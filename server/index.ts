import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import path from "node:path";
import fs from "node:fs";
import { contentHash, db } from "./db";
import { buildFields, normalizeMappings, type IntegrationMapping } from "./mapping";
import "./seed";

const app = express();
const port = Number(process.env.PORT || 3001);
const jwtSecret = process.env.JWT_SECRET || "development-only-change-this-secret";
const isProduction = process.env.NODE_ENV === "production";
const secureCookies = process.env.COOKIE_SECURE
  ? ["1", "true", "yes", "on"].includes(process.env.COOKIE_SECURE.toLowerCase())
  : isProduction;

if (isProduction && (!process.env.JWT_SECRET || process.env.JWT_SECRET === "development-only-change-this-secret")) {
  throw new Error("JWT_SECRET must be explicitly set in production.");
}

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: false,
    crossOriginOpenerPolicy: false,
    originAgentCluster: false,
    strictTransportSecurity: false,
  }),
);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "30mb" }));
app.use(cookieParser());

type Role = "user" | "admin";
type AuthUser = { id: number; username: string; role: Role };
const integrationCache = new Map<number, { expiresAt: number; value: unknown }>();
const INTEGRATION_TIMEOUT_MS = 10_000;
// Guards the Pi's memory against huge API responses.
const INTEGRATION_MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
// The mapping editor's Source panel only needs a representative sample.
const SAMPLE_MAX_BYTES = 1024 * 1024;
const ASSET_KEYS = ["logo", "favicon", "banner"];
const PHOTO_CAPTION_MAX = 140; // keep in sync with src/pages/admin/PhotosTab.tsx
// Uploaded images are served from our own origin; a strict CSP keeps an
// uploaded SVG from running script if someone opens it directly.
const IMAGE_RESPONSE_CSP = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

function toSqliteBool(value: unknown) {
  if (value === true || value === 1 || value === "1" || value === "true") return 1;
  return 0;
}

function toBooleanSettingValue(value: unknown): "true" | "false" | null {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "false") return normalized;
  }
  return null;
}

// Never select the BLOB columns for listings: thumbnails are served from their
// own cacheable URL instead of being base64-inlined into every /api/links call.
const linkColumns = `id, title, url, description, department, category, color, link_type,
  thumbnail_name, thumbnail_type, thumbnail_hash, thumbnail_data IS NOT NULL AS has_thumbnail,
  attachment_name, attachment_type, attachment_data IS NOT NULL AS has_attachment`;
const selectLink = (id: unknown) => db.prepare(`SELECT ${linkColumns} FROM links WHERE id=?`).get(id);

function mapLink(row: any) {
  return {
    id: row.id,
    title: row.title,
    url: row.url,
    description: row.description,
    department: row.department,
    category: row.category,
    color: row.color,
    linkType: row.link_type || "",
    thumbnail: row.has_thumbnail
      ? { name: row.thumbnail_name, type: row.thumbnail_type, url: `/api/links/${row.id}/thumbnail?v=${row.thumbnail_hash}` }
      : null,
    attachment: row.has_attachment ? { name: row.attachment_name, type: row.attachment_type } : null,
  };
}

/**
 * Serve an image stored in SQLite. URLs handed to the client carry
 * ?v=<content hash>, so a versioned request can be cached for a year; an
 * unversioned one must revalidate. The CSP keeps an uploaded SVG from running
 * script if someone opens it directly.
 */
function sendStoredImage(req: express.Request, res: express.Response, file: { name: string | null; type: string; data: Buffer }) {
  res.setHeader("Content-Type", file.type);
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(file.name || "image")}"`);
  res.setHeader("Content-Security-Policy", IMAGE_RESPONSE_CSP);
  res.setHeader("Cache-Control", req.query.v ? "public, max-age=31536000, immutable" : "no-cache");
  res.send(file.data);
}

type UploadedFile = { name: string; type: string; data: Buffer; hash: string };

/** Decode an optional `{ name, base64 }` upload; throws on malformed input. */
function parseUpload(value: unknown, { imageOnly = false, label = "File" } = {}): UploadedFile | null {
  const file = value as { name?: unknown; base64?: unknown } | null | undefined;
  if (!file || typeof file.base64 !== "string" || !file.base64) return null;
  const decoded = blobFromBase64(file.base64);
  if (!decoded) return null;
  if (imageOnly && !decoded.type.startsWith("image/")) throw new Error(`${label} must be an image`);
  return {
    name: typeof file.name === "string" && file.name ? file.name : "file",
    type: decoded.type,
    data: decoded.data,
    hash: contentHash(decoded.data),
  };
}

function mapIntegration(row: any) {
  // Rows saved before validation existed may hold odd entries; keep the good
  // ones rather than dropping the whole integration.
  let mappings: IntegrationMapping[] = [];
  try {
    const parsed = JSON.parse(row.mappings_json);
    if (Array.isArray(parsed)) {
      mappings = parsed.flatMap((item) => {
        const normalized = normalizeMappings([item]);
        return typeof normalized === "string" ? [] : normalized;
      });
    }
  } catch {
    mappings = [];
  }
  return {
    id: row.id,
    title: row.title,
    icon: row.icon,
    endpointUrl: row.endpoint_url,
    authHeader: row.auth_header,
    authToken: row.auth_token,
    authScheme: row.auth_scheme,
    isPublic: toSqliteBool(row.is_public) === 1,
    responsePath: row.response_path,
    refreshMinutes: row.refresh_minutes,
    mappings,
  };
}

const SESSION_DAYS = 7;

/** Set the session cookie. `tv` ties the token to the user's token_version. */
function issueSession(res: express.Response, user: AuthUser & { token_version: number }) {
  const payload = { id: user.id, username: user.username, role: user.role, tv: user.token_version };
  const token = jwt.sign(payload, jwtSecret, { expiresIn: `${SESSION_DAYS}d` });
  res.cookie("token", token, { httpOnly: true, sameSite: "strict", secure: secureCookies, maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000 });
}

// Resolve the session against the database on every request, instead of
// trusting a 7-day JWT: deleted users lose access, role changes apply at
// once, and a password reset (which bumps token_version) signs out every
// session issued before it. Tokens from before token_version existed count
// as version 0, so upgrading doesn't log anyone out.
function getOptionalUser(req: express.Request): AuthUser | null {
  const token = req.cookies?.token;
  if (!token) return null;
  try {
    const claims = jwt.verify(token, jwtSecret) as AuthUser & { tv?: number };
    const row = db.prepare("SELECT id, username, role, token_version FROM users WHERE id=?").get(claims.id) as (AuthUser & { token_version: number }) | undefined;
    if (!row || (claims.tv ?? 0) !== row.token_version) return null;
    return { id: row.id, username: row.username, role: row.role };
  } catch {
    return null;
  }
}

function auth(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!req.cookies?.token) return res.status(401).json({ error: "Authentication required" });
  const user = getOptionalUser(req);
  if (!user) return res.status(401).json({ error: "Invalid or expired session" });
  (req as express.Request & { user: AuthUser }).user = user;
  next();
}

function admin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = (req as express.Request & { user: AuthUser }).user;
  if (user.role !== "admin") return res.status(403).json({ error: "Admin access required" });
  next();
}

function blobFromBase64(value?: string) {
  if (!value) return null;
  const match = /^data:(.+);base64,(.*)$/.exec(value);
  if (!match) throw new Error("Invalid base64 file");
  return { type: match[1], data: Buffer.from(match[2], "base64") };
}

type EndpointConfig = { title: string; endpointUrl: string; authHeader: string; authToken: string; authScheme: string };

/**
 * Read a response body as UTF-8, giving up as soon as it passes maxBytes.
 * Chunked responses have no Content-Length, so the bytes are counted as they
 * arrive instead of buffering the whole body first. The count is after
 * decompression, so a small gzip that expands hugely is caught too.
 */
async function readBodyCapped(response: Response, maxBytes: number, tooLarge: () => Error) {
  if (!response.body) return "";
  if (Number(response.headers.get("content-length")) > maxBytes) {
    await response.body.cancel().catch(() => undefined);
    throw tooLarge();
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw tooLarge();
    }
    chunks.push(value);
  }
  // TextDecoder drops a leading byte-order mark, as response.text() did.
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/** GET the endpoint and parse JSON, with a timeout and a size cap. */
async function fetchEndpointJson(endpoint: EndpointConfig, maxBytes = INTEGRATION_MAX_RESPONSE_BYTES): Promise<unknown> {
  const headers: Record<string, string> = {};
  if (endpoint.authToken) {
    const header = endpoint.authHeader || "Authorization";
    headers[header] = endpoint.authScheme === "Bearer" ? `Bearer ${endpoint.authToken}` : endpoint.authToken;
  }
  const tooLarge = () => new Error(`Endpoint ${endpoint.title} returned more than ${Math.round(maxBytes / 1024 / 1024)} MB`);
  // The timeout signal also covers reading the body, so fetch and parse share one try.
  try {
    const response = await fetch(endpoint.endpointUrl, { headers, signal: AbortSignal.timeout(INTEGRATION_TIMEOUT_MS) });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`Endpoint ${endpoint.title} failed with ${response.status}`);
    }
    const body = await readBodyCapped(response, maxBytes, tooLarge);
    try {
      return JSON.parse(body);
    } catch {
      throw new Error(`Endpoint ${endpoint.title} did not return JSON`);
    }
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new Error(`Endpoint ${endpoint.title} timed out after ${INTEGRATION_TIMEOUT_MS / 1000}s`);
    }
    throw error;
  }
}

async function fetchIntegrationData(integration: ReturnType<typeof mapIntegration>, useCache = true) {
  const cached = integrationCache.get(integration.id);
  if (useCache && cached && cached.expiresAt > Date.now()) return cached.value;

  const json = await fetchEndpointJson(integration);
  const value = {
    id: integration.id,
    title: integration.title,
    icon: integration.icon,
    isPublic: integration.isPublic,
    fields: await buildFields(integration.mappings, json, integration.responsePath),
    fetchedAt: new Date().toISOString(),
  };

  const ttl = Math.max(1, Number(integration.refreshMinutes || 10)) * 60_000;
  if (useCache) integrationCache.set(integration.id, { expiresAt: Date.now() + ttl, value });
  return value;
}

function getAssetMeta() {
  const assets = db.prepare("SELECT key, file_hash FROM site_assets").all() as Array<{ key: string; file_hash: string }>;
  const versions = new Map(assets.map((asset) => [asset.key, asset.file_hash]));
  const url = (key: string) => (versions.has(key) ? `/api/assets/${key}?v=${versions.get(key)}` : "");
  return { logoUrl: url("logo"), faviconUrl: url("favicon"), bannerUrl: url("banner") };
}

app.post("/api/auth/login", (req, res) => {
  const { username, password } = (req.body ?? {}) as { username?: unknown; password?: unknown };
  const user = typeof username === "string"
    ? db.prepare("SELECT id, username, role, password_hash, token_version FROM users WHERE username = ?").get(username) as any
    : undefined;
  if (!user || !bcrypt.compareSync(typeof password === "string" ? password : "", user.password_hash)) {
    return res.status(401).json({ error: "Incorrect username or password" });
  }
  issueSession(res, user);
  res.json({ user: { id: user.id, username: user.username, role: user.role } });
});

app.post("/api/auth/logout", (_req, res) => {
  res.clearCookie("token", { httpOnly: true, sameSite: "strict", secure: secureCookies });
  res.status(204).end();
});

// Being signed out is a normal state, not an error: answer 200 with user: null
// so every anonymous visit doesn't log a failed request in the console.
app.get("/api/auth/me", (req, res) => {
  res.json({ user: getOptionalUser(req) });
});

app.get("/api/settings", (_req, res) => {
  const settings = Object.fromEntries(db.prepare("SELECT key, value FROM settings").all().map((row: any) => [row.key, row.value]));
  res.json({ ...settings, ...getAssetMeta() });
});

const SETTING_TEXT_KEYS = ["siteName", "headerSubtitle", "announcementsTitle", "linksTitle", "photosTitle", "footerText", "bannerTitle", "bannerSubtitle"];
const SETTING_BOOLEAN_KEYS = ["showHero", "showPhotos", "showIntegrations", "showAnnouncements", "showLinks"];
const SETTING_NUMBER_RANGES: Record<string, [number, number]> = { photoIntervalSeconds: [1, 60] };
// Home section positions (lower = higher on the page).
const SETTING_ORDER_KEYS = ["orderHero", "orderPhotos", "orderIntegrations", "orderAnnouncements", "orderLinks"];
const SETTING_ORDER_LIMIT = 999;
const SETTING_TEXT_MAX = 300;
// Google Fonts family names are letters, digits and spaces ("Source Sans 3").
// The name ends up in a stylesheet URL and a CSS font-family, so nothing else is allowed.
const FONT_FAMILY_PATTERN = /^[A-Za-z0-9 ]{0,60}$/;

app.put("/api/settings", auth, admin, (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const updates: Array<[string, string]> = [];
  for (const key of SETTING_TEXT_KEYS) {
    if (typeof body[key] !== "string") continue;
    const value = (body[key] as string).trim();
    if (value.length > SETTING_TEXT_MAX) return res.status(400).json({ error: `${key} must be ${SETTING_TEXT_MAX} characters or fewer` });
    updates.push([key, value]);
  }
  for (const key of SETTING_BOOLEAN_KEYS) {
    const normalized = toBooleanSettingValue(body[key]);
    if (normalized !== null) updates.push([key, normalized]);
  }
  for (const [key, [min, max]] of Object.entries(SETTING_NUMBER_RANGES)) {
    if (body[key] === undefined) continue;
    const value = Number(body[key]);
    if (!Number.isFinite(value) || value < min || value > max) return res.status(400).json({ error: `${key} must be between ${min} and ${max}` });
    updates.push([key, String(Math.round(value * 10) / 10)]);
  }
  for (const key of SETTING_ORDER_KEYS) {
    if (body[key] === undefined) continue;
    const value = Number(body[key]);
    if (!Number.isInteger(value) || Math.abs(value) > SETTING_ORDER_LIMIT) {
      return res.status(400).json({ error: `Section order must be a whole number between -${SETTING_ORDER_LIMIT} and ${SETTING_ORDER_LIMIT}` });
    }
    updates.push([key, String(value)]);
  }
  if (body.fontFamily !== undefined) {
    const font = typeof body.fontFamily === "string" ? body.fontFamily.trim().replace(/\s+/g, " ") : null;
    if (font === null || !FONT_FAMILY_PATTERN.test(font)) {
      return res.status(400).json({ error: "Font name can only contain letters, numbers and spaces" });
    }
    updates.push(["fontFamily", font]);
  }
  const upsert = db.prepare("INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  db.transaction(() => updates.forEach(([key, value]) => upsert.run(key, value)))();
  const settings = Object.fromEntries(db.prepare("SELECT key, value FROM settings").all().map((row: any) => [row.key, row.value]));
  res.json({ ...settings, ...getAssetMeta() });
});

app.put("/api/assets/:key", auth, admin, (req, res) => {
  const key = String(req.params.key ?? "");
  if (!ASSET_KEYS.includes(key)) return res.status(400).json({ error: "Unsupported asset key" });
  try {
    const upload = parseUpload(req.body, { imageOnly: true, label: "Branding file" });
    if (!upload) return res.status(400).json({ error: "Choose an image to upload" });
    db.prepare(`INSERT INTO site_assets(key,file_name,mime_type,file_data,file_hash,updated_at)
      VALUES (?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET file_name=excluded.file_name,mime_type=excluded.mime_type,file_data=excluded.file_data,file_hash=excluded.file_hash,updated_at=CURRENT_TIMESTAMP`)
      .run(key, upload.name, upload.type, upload.data, upload.hash);
    res.status(204).end();
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Invalid asset" });
  }
});

app.get("/api/assets/:key", (req, res) => {
  const key = req.params.key;
  const asset = db.prepare("SELECT file_name, mime_type, file_data FROM site_assets WHERE key=?").get(key) as any;
  if (!asset) return res.status(404).json({ error: "Asset not found" });
  sendStoredImage(req, res, { name: asset.file_name, type: asset.mime_type, data: asset.file_data });
});

app.delete("/api/assets/:key", auth, admin, (req, res) => {
  const key = String(req.params.key ?? "");
  if (!ASSET_KEYS.includes(key)) return res.status(400).json({ error: "Unsupported asset key" });
  db.prepare("DELETE FROM site_assets WHERE key=?").run(key);
  res.status(204).end();
});

function mapPhoto(row: any) {
  const uploaded = Boolean(row.has_image);
  return {
    id: row.id,
    caption: row.caption,
    sortOrder: row.sort_order,
    source: uploaded ? "upload" : "url",
    sourceUrl: row.source_url || "",
    imageUrl: uploaded ? `/api/photos/${row.id}/image?v=${row.image_hash}` : row.source_url,
  };
}

const photoColumns = "id, caption, source_url, sort_order, image_hash, image_data IS NOT NULL AS has_image";
const selectPhoto = (id: unknown) => db.prepare(`SELECT ${photoColumns} FROM photos WHERE id=?`).get(id);
const listPhotos = () => db.prepare(`SELECT ${photoColumns} FROM photos ORDER BY sort_order, id`).all().map(mapPhoto);

const PHOTO_ORDER_LIMIT = 1_000_000;

/** Fields left undefined were not sent and are left unchanged on update. */
type PhotoInput = {
  caption: string | undefined;
  order: number | undefined;
  image: { kind: "url"; url: string } | ({ kind: "upload" } & UploadedFile) | null;
};

function parsePhotoInput(body: any): PhotoInput {
  const caption = typeof body?.caption === "string" ? body.caption.trim() : undefined;
  if (caption !== undefined && caption.length > PHOTO_CAPTION_MAX) throw new Error(`Caption must be ${PHOTO_CAPTION_MAX} characters or fewer`);
  let order: number | undefined;
  if (body?.order !== undefined && body?.order !== null && body?.order !== "") {
    order = Number(body.order);
    if (!Number.isInteger(order) || Math.abs(order) > PHOTO_ORDER_LIMIT) throw new Error("Order must be a whole number");
  }
  const rawUrl = typeof body?.url === "string" ? body.url.trim() : "";
  const file = body?.file as { name?: string; base64?: string } | undefined;
  if (rawUrl && file?.base64) throw new Error("Provide either an image URL or an uploaded file, not both");
  if (rawUrl) {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new Error("Image URL is not valid");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("Image URL must start with http:// or https://");
    return { caption, order, image: { kind: "url", url: parsed.toString() } };
  }
  const upload = parseUpload(file, { imageOnly: true, label: "Uploaded file" });
  if (upload) return { caption, order, image: { kind: "upload", ...upload } };
  return { caption, order, image: null };
}

app.get("/api/photos", (_req, res) => {
  res.json(listPhotos());
});

app.post("/api/photos", auth, admin, (req, res) => {
  let input: PhotoInput;
  try {
    input = parsePhotoInput(req.body);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Invalid photo" });
  }
  if (!input.image) return res.status(400).json({ error: "Add an image file or an image URL" });
  // Default: play after everything else.
  const order = input.order ?? (db.prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM photos").get() as { next: number }).next;
  const caption = input.caption ?? "";
  const image = input.image;
  const result = image.kind === "url"
    ? db.prepare("INSERT INTO photos(caption, source_url, sort_order) VALUES (?,?,?)").run(caption, image.url, order)
    : db.prepare("INSERT INTO photos(caption, image_name, image_type, image_data, image_hash, sort_order) VALUES (?,?,?,?,?,?)")
        .run(caption, image.name, image.type, image.data, image.hash, order);
  res.status(201).json(mapPhoto(selectPhoto(result.lastInsertRowid)));
});

// Must be registered before /api/photos/:id so "order" is not treated as an id.
// Used by the move arrows: renumbers every photo 1, 2, 3... in the new
// arrangement. The client may send a stale list (another admin added a photo
// meanwhile), so the listed ids go first in the given order, then any
// unlisted photos in their current order; every photo ends up unique.
app.put("/api/photos/order", auth, admin, (req, res) => {
  const ids = (req.body as { ids?: unknown })?.ids;
  if (!Array.isArray(ids) || !ids.every((id) => Number.isInteger(id))) return res.status(400).json({ error: "ids must be an array of photo ids" });
  const current = (db.prepare("SELECT id FROM photos ORDER BY sort_order, id").all() as Array<{ id: number }>).map((row) => row.id);
  const known = new Set(current);
  const listed = Array.from(new Set(ids as number[])).filter((id) => known.has(id));
  const listedSet = new Set(listed);
  const finalOrder = [...listed, ...current.filter((id) => !listedSet.has(id))];
  const update = db.prepare("UPDATE photos SET sort_order=? WHERE id=?");
  db.transaction(() => finalOrder.forEach((id, index) => update.run(index + 1, id)))();
  res.json(listPhotos());
});

/** Partial update: only caption, order and/or image fields that were sent change. */
app.put("/api/photos/:id", auth, admin, (req, res) => {
  if (!selectPhoto(req.params.id)) return res.status(404).json({ error: "Photo not found" });
  let input: PhotoInput;
  try {
    input = parsePhotoInput(req.body);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Invalid photo" });
  }
  const sets: string[] = [];
  const params: unknown[] = [];
  if (input.caption !== undefined) { sets.push("caption=?"); params.push(input.caption); }
  if (input.order !== undefined) { sets.push("sort_order=?"); params.push(input.order); }
  const image = input.image;
  if (image?.kind === "url") {
    sets.push("source_url=?", "image_name=NULL", "image_type=NULL", "image_data=NULL", "image_hash=NULL");
    params.push(image.url);
  } else if (image?.kind === "upload") {
    sets.push("source_url=NULL", "image_name=?", "image_type=?", "image_data=?", "image_hash=?");
    params.push(image.name, image.type, image.data, image.hash);
  }
  if (sets.length) {
    sets.push("updated_at=CURRENT_TIMESTAMP");
    db.prepare(`UPDATE photos SET ${sets.join(", ")} WHERE id=?`).run(...params, req.params.id);
  }
  res.json(mapPhoto(selectPhoto(req.params.id)));
});

app.delete("/api/photos/:id", auth, admin, (req, res) => {
  db.prepare("DELETE FROM photos WHERE id=?").run(req.params.id);
  res.status(204).end();
});

app.get("/api/photos/:id/image", (req, res) => {
  const row = db.prepare("SELECT image_name, image_type, image_data FROM photos WHERE id=?").get(req.params.id) as any;
  if (!row?.image_data) return res.status(404).json({ error: "Photo not found" });
  sendStoredImage(req, res, { name: row.image_name, type: row.image_type, data: row.image_data });
});

app.get("/api/announcements", (_req, res) => {
  res.json(db.prepare("SELECT id, title, body, color, category, created_at AS createdAt FROM announcements ORDER BY id DESC").all());
});

app.post("/api/announcements", auth, admin, (req, res) => {
  const { title, body = "", color = "#4f46e5", category = "" } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: "Title is required" });
  const result = db.prepare("INSERT INTO announcements(title, body, color, category) VALUES (?, ?, ?, ?)").run(title.trim(), body.trim(), color, String(category).trim());
  res.status(201).json(db.prepare("SELECT id, title, body, color, category, created_at AS createdAt FROM announcements WHERE id = ?").get(result.lastInsertRowid));
});

app.put("/api/announcements/:id", auth, admin, (req, res) => {
  const { title, body = "", color = "#4f46e5", category = "" } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: "Title is required" });
  const result = db.prepare("UPDATE announcements SET title=?, body=?, color=?, category=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(title.trim(), body.trim(), color, String(category).trim(), req.params.id);
  if (!result.changes) return res.status(404).json({ error: "Announcement not found" });
  res.json(db.prepare("SELECT id, title, body, color, category, created_at AS createdAt FROM announcements WHERE id = ?").get(req.params.id));
});

app.delete("/api/announcements/:id", auth, admin, (req, res) => {
  db.prepare("DELETE FROM announcements WHERE id=?").run(req.params.id);
  res.status(204).end();
});

/** Text fields shared by link create/update. */
function parseLinkFields(body: any) {
  const text = (value: unknown, fallback = "") => (typeof value === "string" ? value.trim() : fallback);
  return {
    title: text(body?.title),
    url: text(body?.url),
    description: text(body?.description),
    department: text(body?.department) || "General",
    category: text(body?.category),
    color: text(body?.color) || "#4f46e5",
    // Brand logo key chosen in the link editor (e.g. "github"); the client owns
    // the list of brands, so the server only enforces a safe slug.
    linkType: /^[a-z0-9-]{0,40}$/.test(text(body?.linkType)) ? text(body?.linkType) : "",
  };
}

app.get("/api/links", (_req, res) => {
  res.json(db.prepare(`SELECT ${linkColumns} FROM links ORDER BY department, title`).all().map(mapLink));
});

app.post("/api/links", auth, admin, (req, res) => {
  const fields = parseLinkFields(req.body);
  if (!fields.title) return res.status(400).json({ error: "Title is required" });
  try {
    const thumb = parseUpload(req.body?.thumbnail, { imageOnly: true, label: "Thumbnail" });
    const attach = parseUpload(req.body?.attachment);
    const result = db.prepare(`INSERT INTO links(title,url,description,department,category,color,link_type,thumbnail_name,thumbnail_type,thumbnail_data,thumbnail_hash,attachment_name,attachment_type,attachment_data)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      fields.title, fields.url, fields.description, fields.department, fields.category, fields.color, fields.linkType,
      thumb?.name ?? null, thumb?.type ?? null, thumb?.data ?? null, thumb?.hash ?? null,
      attach?.name ?? null, attach?.type ?? null, attach?.data ?? null);
    res.status(201).json(mapLink(selectLink(result.lastInsertRowid)));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Could not save link" });
  }
});

/**
 * Files are optional on update: a new upload replaces the stored file,
 * `removeThumbnail` / `removeAttachment: true` clears it, and omitting both
 * leaves it untouched.
 */
app.put("/api/links/:id", auth, admin, (req, res) => {
  if (!db.prepare("SELECT id FROM links WHERE id=?").get(req.params.id)) return res.status(404).json({ error: "Link not found" });
  const fields = parseLinkFields(req.body);
  if (!fields.title) return res.status(400).json({ error: "Title is required" });
  try {
    const sets = ["title=?", "url=?", "description=?", "department=?", "category=?", "color=?", "link_type=?"];
    const params: unknown[] = [fields.title, fields.url, fields.description, fields.department, fields.category, fields.color, fields.linkType];
    // Thumbnails are images served from a cached, hash-versioned URL;
    // attachments are downloads and don't need a hash.
    const files = [
      { column: "thumbnail", hashed: true, upload: parseUpload(req.body?.thumbnail, { imageOnly: true, label: "Thumbnail" }), remove: req.body?.removeThumbnail === true },
      { column: "attachment", hashed: false, upload: parseUpload(req.body?.attachment), remove: req.body?.removeAttachment === true },
    ];
    for (const { column, hashed, upload, remove } of files) {
      if (upload) {
        sets.push(`${column}_name=?`, `${column}_type=?`, `${column}_data=?`);
        params.push(upload.name, upload.type, upload.data);
        if (hashed) {
          sets.push(`${column}_hash=?`);
          params.push(upload.hash);
        }
      } else if (remove) {
        sets.push(`${column}_name=NULL`, `${column}_type=NULL`, `${column}_data=NULL`);
        if (hashed) sets.push(`${column}_hash=NULL`);
      }
    }
    sets.push("updated_at=CURRENT_TIMESTAMP");
    db.prepare(`UPDATE links SET ${sets.join(", ")} WHERE id=?`).run(...params, req.params.id);
    res.json(mapLink(selectLink(req.params.id)));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Could not update link" });
  }
});

app.delete("/api/links/:id", auth, admin, (req, res) => {
  db.prepare("DELETE FROM links WHERE id=?").run(req.params.id);
  res.status(204).end();
});

app.get("/api/links/:id/attachment", (req, res) => {
  const row = db.prepare("SELECT attachment_name, attachment_type, attachment_data FROM links WHERE id=?").get(req.params.id) as any;
  if (!row?.attachment_data) return res.status(404).json({ error: "Attachment not found" });
  res.setHeader("Content-Type", row.attachment_type);
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(row.attachment_name)}"`);
  res.send(row.attachment_data);
});

app.get("/api/links/:id/thumbnail", (req, res) => {
  const row = db.prepare("SELECT thumbnail_name, thumbnail_type, thumbnail_data FROM links WHERE id=?").get(req.params.id) as any;
  if (!row?.thumbnail_data) return res.status(404).json({ error: "Thumbnail not found" });
  sendStoredImage(req, res, { name: row.thumbnail_name, type: row.thumbnail_type, data: row.thumbnail_data });
});

app.get("/api/integrations", auth, admin, (_req, res) => {
  const rows = db.prepare("SELECT * FROM integrations ORDER BY id DESC").all();
  res.json(rows.map(mapIntegration));
});

type IntegrationInput = {
  title: string;
  icon: string;
  endpointUrl: string;
  authHeader: string;
  authToken: string;
  authScheme: string;
  isPublic: 0 | 1;
  responsePath: string;
  refreshMinutes: number;
  mappings: IntegrationMapping[];
};

/** Validate and normalize one integration; returns an error message on failure. */
function parseIntegrationInput(raw: any): IntegrationInput | string {
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const title = text(raw?.title);
  const endpointUrl = text(raw?.endpointUrl);
  if (!title || !endpointUrl) return "Title and endpoint URL are required";
  try {
    const { protocol } = new URL(endpointUrl);
    if (protocol !== "http:" && protocol !== "https:") return "Endpoint URL must start with http:// or https://";
  } catch {
    return `Endpoint URL for "${title}" is not a valid URL`;
  }
  const mappings = normalizeMappings(raw?.mappings);
  if (typeof mappings === "string") return `"${title}": ${mappings}`;
  return {
    title,
    endpointUrl,
    icon: text(raw?.icon) || "🧩",
    authHeader: text(raw?.authHeader) || "Authorization",
    authToken: raw?.authToken == null ? "" : String(raw.authToken),
    authScheme: text(raw?.authScheme) || "Bearer",
    isPublic: toSqliteBool(raw?.isPublic),
    responsePath: text(raw?.responsePath),
    refreshMinutes: Math.max(1, Number(raw?.refreshMinutes) || 10),
    mappings,
  };
}

function insertIntegration(input: IntegrationInput) {
  return db.prepare(`INSERT INTO integrations(title, icon, endpoint_url, auth_header, auth_token, auth_scheme, is_public, response_path, mappings_json, refresh_minutes)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(input.title, input.icon, input.endpointUrl, input.authHeader, input.authToken, input.authScheme, input.isPublic, input.responsePath, JSON.stringify(input.mappings), input.refreshMinutes);
}

app.post("/api/integrations", auth, admin, (req, res) => {
  const input = parseIntegrationInput(req.body);
  if (typeof input === "string") return res.status(400).json({ error: input });
  const result = insertIntegration(input);
  res.status(201).json(mapIntegration(db.prepare("SELECT * FROM integrations WHERE id=?").get(result.lastInsertRowid)));
});

/**
 * Import many integrations at once. Every row is validated first, then the
 * optional "replace" delete and all inserts run in one SQLite transaction, so
 * a failure part-way through rolls back and nothing is lost.
 *
 * "append" skips invalid rows and reports them. "replace" is all-or-nothing:
 * any invalid row rejects the whole import, because replacing your working
 * integrations with a partial set is data loss.
 */
app.post("/api/integrations/import", auth, admin, (req, res) => {
  const { mode, integrations } = (req.body ?? {}) as { mode?: unknown; integrations?: unknown };
  if (mode !== "append" && mode !== "replace") return res.status(400).json({ error: "mode must be append or replace" });
  if (!Array.isArray(integrations)) return res.status(400).json({ error: "integrations must be an array" });
  const parsed = integrations.map(parseIntegrationInput);
  const valid = parsed.filter((row): row is IntegrationInput => typeof row !== "string");
  const problems = parsed.filter((row): row is string => typeof row === "string");
  const summary = Array.from(new Set(problems)).slice(0, 3).join("; ");
  if (!valid.length) {
    return res.status(400).json({ error: `No valid integrations found in the file. ${summary}`.trim() });
  }
  if (mode === "replace" && problems.length) {
    return res.status(400).json({
      error: `Nothing was replaced: ${problems.length} of ${parsed.length} entries are invalid (${summary}). Fix the file, or use "Add to list" to import only the valid ones.`,
    });
  }
  db.transaction(() => {
    if (mode === "replace") db.prepare("DELETE FROM integrations").run();
    for (const row of valid) insertIntegration(row);
  })();
  if (mode === "replace") integrationCache.clear();
  res.json({ imported: valid.length, skipped: problems.length, problems: Array.from(new Set(problems)).slice(0, 5) });
});

app.put("/api/integrations/:id", auth, admin, (req, res) => {
  if (!db.prepare("SELECT id FROM integrations WHERE id=?").get(req.params.id)) return res.status(404).json({ error: "Integration not found" });
  const input = parseIntegrationInput(req.body);
  if (typeof input === "string") return res.status(400).json({ error: input });
  db.prepare(`UPDATE integrations SET title=?, icon=?, endpoint_url=?, auth_header=?, auth_token=?, auth_scheme=?, is_public=?, response_path=?, mappings_json=?, refresh_minutes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(input.title, input.icon, input.endpointUrl, input.authHeader, input.authToken, input.authScheme, input.isPublic, input.responsePath, JSON.stringify(input.mappings), input.refreshMinutes, req.params.id);
  integrationCache.delete(Number(req.params.id));
  res.json(mapIntegration(db.prepare("SELECT * FROM integrations WHERE id=?").get(req.params.id)));
});

/** Endpoint settings from an editor request; nothing here is saved. */
function readEndpointConfig(body: any): EndpointConfig & { responsePath: string } {
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  return {
    title: text(body?.title) || "Preview",
    endpointUrl: text(body?.endpointUrl),
    authHeader: text(body?.authHeader) || "Authorization",
    authToken: body?.authToken == null ? "" : String(body.authToken),
    authScheme: text(body?.authScheme) || "Bearer",
    responsePath: text(body?.responsePath),
  };
}

function checkEndpointUrl(url: string) {
  if (!url) return "Endpoint URL is required for test";
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:" ? null : "Endpoint URL must start with http:// or https://";
  } catch {
    return "Endpoint URL is not a valid URL";
  }
}

/**
 * Preview the card for unsaved settings. With `sample` (JSON pasted or loaded
 * in the mapping editor) the fields are built from it without calling the
 * endpoint, so the editor can re-run the logic on every change.
 */
app.post("/api/integrations/test", auth, admin, async (req, res) => {
  const config = readEndpointConfig(req.body);
  const mappings = normalizeMappings(req.body?.mappings);
  if (typeof mappings === "string") return res.status(400).json({ error: mappings });
  const hasSample = req.body && Object.prototype.hasOwnProperty.call(req.body, "sample");
  if (!hasSample) {
    const urlProblem = checkEndpointUrl(config.endpointUrl);
    if (urlProblem) return res.status(400).json({ error: urlProblem });
  }
  try {
    const json = hasSample ? req.body.sample : await fetchEndpointJson(config);
    res.json({
      id: 0,
      title: config.title,
      icon: typeof req.body?.icon === "string" && req.body.icon.trim() ? req.body.icon.trim() : "🧩",
      fields: await buildFields(mappings, json, config.responsePath),
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "Integration test failed" });
  }
});

/** Raw JSON from the endpoint for the mapping editor's Source panel. */
app.post("/api/integrations/sample", auth, admin, async (req, res) => {
  const config = readEndpointConfig(req.body);
  const urlProblem = checkEndpointUrl(config.endpointUrl);
  if (urlProblem) return res.status(400).json({ error: urlProblem });
  try {
    res.json({ data: await fetchEndpointJson(config, SAMPLE_MAX_BYTES) });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "Could not load a sample" });
  }
});

app.delete("/api/integrations/:id", auth, admin, (req, res) => {
  db.prepare("DELETE FROM integrations WHERE id=?").run(req.params.id);
  integrationCache.delete(Number(req.params.id));
  res.status(204).end();
});

app.get("/api/integrations/:id/data", async (req, res) => {
  const row = db.prepare("SELECT * FROM integrations WHERE id=?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Integration not found" });
  const integration = mapIntegration(row);
  if (!integration.isPublic && !getOptionalUser(req)) {
    return res.status(403).json({ error: "Sign in to see this integration" });
  }
  try {
    const payload = await fetchIntegrationData(integration);
    res.json(payload);
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "Endpoint request failed" });
  }
});

// Visibility: public cards are shown to everyone; private cards to any
// signed-in user (both the "user" and "admin" roles).
app.get("/api/integrations/data/all", async (req, res) => {
  const signedIn = Boolean(getOptionalUser(req));
  const rows = db.prepare(`SELECT * FROM integrations ${signedIn ? "" : "WHERE is_public=1"} ORDER BY id DESC`).all();
  const mapped = rows.map(mapIntegration);
  const values = await Promise.all(mapped.map(async (integration) => {
    try {
      return await fetchIntegrationData(integration);
    } catch (error) {
      return { id: integration.id, title: integration.title, icon: integration.icon, isPublic: integration.isPublic, error: error instanceof Error ? error.message : "Endpoint failed" };
    }
  }));
  res.json(values);
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", uptimeSeconds: Math.floor(process.uptime()) });
});

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok", uptimeSeconds: Math.floor(process.uptime()) });
});

app.get("/api/users", auth, admin, (_req, res) => {
  res.json(db.prepare("SELECT id, username, role, created_at AS createdAt FROM users ORDER BY username").all());
});

app.post("/api/users", auth, admin, (req, res) => {
  const { username, password, role = "user" } = (req.body ?? {}) as { username?: unknown; password?: unknown; role?: unknown };
  const name = typeof username === "string" ? username.trim() : "";
  if (!name || typeof password !== "string" || !password || (role !== "user" && role !== "admin")) {
    return res.status(400).json({ error: "Valid username, password, and role are required" });
  }
  if (db.prepare("SELECT id FROM users WHERE username=?").get(name)) return res.status(409).json({ error: "Username already exists" });
  const result = db.prepare("INSERT INTO users(username,password_hash,role) VALUES (?,?,?)").run(name, bcrypt.hashSync(password, 12), role);
  res.status(201).json(db.prepare("SELECT id, username, role, created_at AS createdAt FROM users WHERE id=?").get(result.lastInsertRowid));
});

app.put("/api/users/:id", auth, admin, (req, res) => {
  const current = (req as express.Request & { user: AuthUser }).user;
  const id = Number(req.params.id);
  if (!db.prepare("SELECT id FROM users WHERE id=?").get(id)) return res.status(404).json({ error: "User not found" });
  const { password, role } = req.body as { password?: unknown; role?: unknown };
  if (role !== undefined) {
    if (role !== "user" && role !== "admin") return res.status(400).json({ error: "Role must be user or admin" });
    if (id === current.id && role !== "admin") return res.status(400).json({ error: "You cannot remove your own admin role" });
  }
  if (password !== undefined && (typeof password !== "string" || !password)) {
    return res.status(400).json({ error: "Password cannot be empty" });
  }
  db.transaction(() => {
    if (role !== undefined) db.prepare("UPDATE users SET role=? WHERE id=?").run(role, id);
    // Bumping token_version signs out every existing session for this user.
    if (typeof password === "string") {
      db.prepare("UPDATE users SET password_hash=?, token_version=token_version+1 WHERE id=?").run(bcrypt.hashSync(password, 12), id);
    }
  })();
  // Changing your own password keeps *this* session alive with a fresh token;
  // your other sessions (other devices) are still signed out.
  if (typeof password === "string" && id === current.id) {
    issueSession(res, db.prepare("SELECT id, username, role, token_version FROM users WHERE id=?").get(id));
  }
  res.json(db.prepare("SELECT id, username, role, created_at AS createdAt FROM users WHERE id=?").get(id));
});

app.delete("/api/users/:id", auth, admin, (req, res) => {
  const current = (req as express.Request & { user: AuthUser }).user;
  if (Number(req.params.id) === current.id) return res.status(400).json({ error: "You cannot delete the signed-in account" });
  db.prepare("DELETE FROM users WHERE id=?").run(req.params.id);
  res.status(204).end();
});

const distDir = path.join(process.cwd(), "dist");
if (fs.existsSync(distDir)) app.use(express.static(distDir));
app.use((_req, res) => {
  if (fs.existsSync(path.join(distDir, "index.html"))) res.sendFile(path.join(distDir, "index.html"));
  else res.status(404).json({ error: "Not found" });
});

app.listen(port, "0.0.0.0", () => console.log(`Home Hub API listening on http://0.0.0.0:${port}`));
