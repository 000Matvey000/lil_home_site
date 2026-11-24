import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import path from "node:path";
import fs from "node:fs";
import { db } from "./db";
import "./seed";

const app = express();
const port = Number(process.env.PORT || 3001);
const jwtSecret = process.env.JWT_SECRET || "development-only-change-this-secret";
const isProduction = process.env.NODE_ENV === "production";

if (isProduction && (!process.env.JWT_SECRET || process.env.JWT_SECRET === "development-only-change-this-secret")) {
  throw new Error("JWT_SECRET must be explicitly set in production.");
}

app.use(
  helmet({
    crossOriginResourcePolicy: false,
    crossOriginOpenerPolicy: false,
    originAgentCluster: false,
  }),
);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "30mb" }));
app.use(cookieParser());

type Role = "user" | "admin";
type AuthUser = { id: number; username: string; role: Role };
type Operator = ">" | ">=" | "<" | "<=" | "==" | "!=";
type MappingValueType = "string" | "number" | "currency" | "percent" | "boolean" | "date" | "unix-seconds" | "url" | "image";
type MappingCondition = { operator: Operator; value: number; emoji: string };
type IntegrationMapping = {
  label: string;
  path: string;
  valueType: MappingValueType;
  emoji?: string;
  positiveEmoji?: string;
  negativeEmoji?: string;
  zeroEmoji?: string;
  conditionOperator?: Operator;
  conditionValue?: number;
  conditionTrueEmoji?: string;
  conditionFalseEmoji?: string;
  conditionMode?: "AND" | "OR";
  conditions?: MappingCondition[];
};

const integrationCache = new Map<number, { expiresAt: number; value: unknown }>();

function toSqliteBool(value: unknown) {
  if (value === true || value === 1 || value === "1" || value === "true") return 1;
  return 0;
}

function decodeBlob(row: any, prefix: "thumbnail" | "attachment") {
  if (!row[`${prefix}_data`]) return null;
  return {
    name: row[`${prefix}_name`],
    type: row[`${prefix}_type`],
    base64: Buffer.from(row[`${prefix}_data`]).toString("base64"),
  };
}

function mapLink(row: any) {
  const thumbnail = decodeBlob(row, "thumbnail");
  const attachment = decodeBlob(row, "attachment");
  return {
    id: row.id,
    title: row.title,
    url: row.url,
    description: row.description,
    department: row.department,
    category: row.category,
    color: row.color,
    thumbnail: thumbnail ? { name: thumbnail.name, type: thumbnail.type, dataUrl: `data:${thumbnail.type};base64,${thumbnail.base64}` } : null,
    attachment: attachment ? { name: attachment.name, type: attachment.type } : null,
  };
}

function mapIntegration(row: any) {
  let mappings: IntegrationMapping[] = [];
  try {
    const parsed = JSON.parse(row.mappings_json);
    if (Array.isArray(parsed)) mappings = parsed;
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

function auth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: "Authentication required" });
  try {
    (req as express.Request & { user: AuthUser }).user = jwt.verify(token, jwtSecret) as AuthUser;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired session" });
  }
}

function getOptionalUser(req: express.Request): AuthUser | null {
  const token = req.cookies?.token;
  if (!token) return null;
  try {
    return jwt.verify(token, jwtSecret) as AuthUser;
  } catch {
    return null;
  }
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

function getByPath(data: unknown, rawPath: string): unknown {
  if (!rawPath.trim()) return data;
  const normalized = rawPath.replace(/\[(\d+)\]/g, ".$1");
  return normalized.split(".").filter(Boolean).reduce<unknown>((acc, part) => {
    if (acc === null || acc === undefined) return undefined;
    if (typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[part];
  }, data);
}

function evaluateCondition(value: unknown, operator: Operator, conditionValue: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return false;
  switch (operator) {
    case ">":
      return numeric > conditionValue;
    case ">=":
      return numeric >= conditionValue;
    case "<":
      return numeric < conditionValue;
    case "<=":
      return numeric <= conditionValue;
    case "==":
      return numeric === conditionValue;
    case "!=":
      return numeric !== conditionValue;
  }
}

function formatValue(value: unknown, type: MappingValueType) {
  if (value === null || value === undefined) return "—";
  if (type === "number") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed.toLocaleString() : String(value);
  }
  if (type === "currency") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed.toLocaleString(undefined, { style: "currency", currency: "USD" }) : String(value);
  }
  if (type === "percent") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? `${parsed.toFixed(2)}%` : String(value);
  }
  if (type === "boolean") {
    if (typeof value === "boolean") return value ? "Yes" : "No";
    return String(value);
  }
  if (type === "date") {
    const numeric = Number(value);
    const date = Number.isFinite(numeric)
      ? new Date(numeric > 10_000_000_000 ? numeric : numeric * 1000)
      : new Date(String(value));
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString();
  }
  if (type === "unix-seconds") {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return String(value);
    return new Date(parsed * 1000).toLocaleString();
  }
  if (type === "url" || type === "image") {
    return String(value);
  }
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function resolveEmoji(value: unknown, mapping: IntegrationMapping) {
  if (Array.isArray(mapping.conditions) && mapping.conditions.length) {
    const checks = mapping.conditions.map((condition) =>
      evaluateCondition(value, condition.operator, Number(condition.value)),
    );
    const mode = mapping.conditionMode === "OR" ? "OR" : "AND";
    const matched = mode === "OR" ? checks.some(Boolean) : checks.every(Boolean);
    if (matched) {
      const active = mapping.conditions.find((condition, index) => checks[index] && condition.emoji?.trim());
      return active?.emoji || mapping.emoji || "";
    }
    return mapping.conditionFalseEmoji || "";
  }
  if (mapping.conditionOperator && Number.isFinite(mapping.conditionValue)) {
    const matched = evaluateCondition(value, mapping.conditionOperator, Number(mapping.conditionValue));
    if (matched) return mapping.conditionTrueEmoji || mapping.emoji || "";
    return mapping.conditionFalseEmoji || "";
  }
  if (mapping.valueType === "number" || mapping.valueType === "currency" || mapping.valueType === "percent") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      if (parsed > 0 && mapping.positiveEmoji) return mapping.positiveEmoji;
      if (parsed < 0 && mapping.negativeEmoji) return mapping.negativeEmoji;
      if (parsed === 0 && mapping.zeroEmoji) return mapping.zeroEmoji;
    }
  }
  return mapping.emoji || "";
}

async function fetchIntegrationData(integration: ReturnType<typeof mapIntegration>, useCache = true) {
  const cached = integrationCache.get(integration.id);
  if (useCache && cached && cached.expiresAt > Date.now()) return cached.value;

  const headers: Record<string, string> = {};
  if (integration.authToken) {
    if (integration.authScheme === "Bearer") headers[integration.authHeader || "Authorization"] = `Bearer ${integration.authToken}`;
    else if (integration.authScheme === "Token") headers[integration.authHeader || "Authorization"] = integration.authToken;
    else headers[integration.authHeader || "Authorization"] = integration.authToken;
  }

  const response = await fetch(integration.endpointUrl, { headers });
  if (!response.ok) throw new Error(`Endpoint ${integration.title} failed with ${response.status}`);
  const json = await response.json();
  const scoped = getByPath(json, integration.responsePath) ?? json;

  const fields = integration.mappings.map((mapping) => {
    const rawValue = getByPath(scoped, mapping.path);
    return {
      label: mapping.label,
      rawValue,
      displayValue: formatValue(rawValue, mapping.valueType || "string"),
      emoji: resolveEmoji(rawValue, mapping),
      valueType: mapping.valueType || "string",
    };
  });

  const value = {
    id: integration.id,
    title: integration.title,
    icon: integration.icon,
    fields,
    fetchedAt: new Date().toISOString(),
  };

  const ttl = Math.max(1, Number(integration.refreshMinutes || 10)) * 60_000;
  if (useCache) integrationCache.set(integration.id, { expiresAt: Date.now() + ttl, value });
  return value;
}

function getAssetMeta() {
  const assets = db.prepare("SELECT key, updated_at AS updatedAt FROM site_assets").all() as Array<{ key: string; updatedAt: string }>;
  const indexed = new Map(assets.map((asset) => [asset.key, asset.updatedAt]));
  return {
    logoUrl: indexed.has("logo") ? `/api/assets/logo?v=${encodeURIComponent(indexed.get("logo") as string)}` : "",
    faviconUrl: indexed.has("favicon") ? `/api/assets/favicon?v=${encodeURIComponent(indexed.get("favicon") as string)}` : "",
  };
}

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as any;
  if (!user || !bcrypt.compareSync(password || "", user.password_hash)) {
    return res.status(401).json({ error: "Incorrect username or password" });
  }
  const payload: AuthUser = { id: user.id, username: user.username, role: user.role };
  const token = jwt.sign(payload, jwtSecret, { expiresIn: "7d" });
  res.cookie("token", token, { httpOnly: true, sameSite: "strict", secure: isProduction, maxAge: 7 * 24 * 60 * 60 * 1000 });
  res.json({ user: payload });
});

app.post("/api/auth/logout", (_req, res) => {
  res.clearCookie("token");
  res.status(204).end();
});

app.get("/api/auth/me", auth, (req, res) => {
  res.json({ user: (req as express.Request & { user: AuthUser }).user });
});

app.get("/api/settings", (_req, res) => {
  const settings = Object.fromEntries(db.prepare("SELECT key, value FROM settings").all().map((row: any) => [row.key, row.value]));
  res.json({ ...settings, ...getAssetMeta() });
});

app.put("/api/settings", auth, admin, (req, res) => {
  const upsert = db.prepare("INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  const editableKeys = ["siteName", "headerSubtitle", "heroBadge", "heroTitle", "heroDescription", "announcementsTitle", "linksTitle", "footerText"];
  db.transaction(() => {
    for (const key of editableKeys) {
      if (typeof req.body[key] === "string") upsert.run(key, req.body[key].trim());
    }
  })();
  const settings = Object.fromEntries(db.prepare("SELECT key, value FROM settings").all().map((row: any) => [row.key, row.value]));
  res.json({ ...settings, ...getAssetMeta() });
});

app.put("/api/assets/:key", auth, admin, (req, res) => {
  const key = String(req.params.key ?? "");
  if (!["logo", "favicon"].includes(key)) return res.status(400).json({ error: "Unsupported asset key" });
  const { name, base64 } = req.body as { name?: string; base64?: string };
  if (!name || !base64) return res.status(400).json({ error: "Asset name and base64 are required" });
  try {
    const decoded = blobFromBase64(base64);
    if (!decoded) return res.status(400).json({ error: "Invalid base64 payload" });
    db.prepare(`INSERT INTO site_assets(key,file_name,mime_type,file_data,updated_at)
      VALUES (?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET file_name=excluded.file_name,mime_type=excluded.mime_type,file_data=excluded.file_data,updated_at=CURRENT_TIMESTAMP`)
      .run(key, name, decoded.type, decoded.data);
    res.status(204).end();
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Invalid asset" });
  }
});

app.get("/api/assets/:key", (req, res) => {
  const key = req.params.key;
  const asset = db.prepare("SELECT file_name, mime_type, file_data FROM site_assets WHERE key=?").get(key) as any;
  if (!asset) return res.status(404).json({ error: "Asset not found" });
  res.setHeader("Content-Type", asset.mime_type);
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(asset.file_name)}"`);
  res.send(asset.file_data);
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

app.get("/api/links", (_req, res) => {
  res.json(db.prepare("SELECT * FROM links ORDER BY department, title").all().map(mapLink));
});

app.post("/api/links", auth, admin, (req, res) => {
  const { title, url = "", description = "", department = "General", category = "", color = "#4f46e5", thumbnail, attachment } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: "Title is required" });
  try {
    const thumb = thumbnail?.base64 ? blobFromBase64(thumbnail.base64) : null;
    const attach = attachment?.base64 ? blobFromBase64(attachment.base64) : null;
    const result = db.prepare(`INSERT INTO links(title,url,description,department,category,color,thumbnail_name,thumbnail_type,thumbnail_data,attachment_name,attachment_type,attachment_data)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(title.trim(), url.trim(), description.trim(), department.trim(), String(category).trim(), color, thumbnail?.name || null, thumb?.type || null, thumb?.data || null, attachment?.name || null, attach?.type || null, attach?.data || null);
    res.status(201).json(mapLink(db.prepare("SELECT * FROM links WHERE id=?").get(result.lastInsertRowid)));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Could not save link" });
  }
});

app.put("/api/links/:id", auth, admin, (req, res) => {
  const existing = db.prepare("SELECT * FROM links WHERE id=?").get(req.params.id) as any;
  if (!existing) return res.status(404).json({ error: "Link not found" });
  const { title, url = "", description = "", department = "General", category = "", color = "#4f46e5", thumbnail, attachment } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: "Title is required" });
  try {
    const thumb = thumbnail?.base64 ? blobFromBase64(thumbnail.base64) : null;
    const attach = attachment?.base64 ? blobFromBase64(attachment.base64) : null;
    db.prepare(`UPDATE links SET title=?,url=?,description=?,department=?,category=?,color=?,
      thumbnail_name=COALESCE(?,thumbnail_name),thumbnail_type=COALESCE(?,thumbnail_type),thumbnail_data=COALESCE(?,thumbnail_data),
      attachment_name=COALESCE(?,attachment_name),attachment_type=COALESCE(?,attachment_type),attachment_data=COALESCE(?,attachment_data),
      updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(
      title.trim(), url.trim(), description.trim(), department.trim(), String(category).trim(), color,
      thumb ? thumbnail.name : null, thumb?.type || null, thumb?.data || null,
      attach ? attachment.name : null, attach?.type || null, attach?.data || null, req.params.id);
    res.json(mapLink(db.prepare("SELECT * FROM links WHERE id=?").get(req.params.id)));
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

app.get("/api/integrations", auth, admin, (_req, res) => {
  const rows = db.prepare("SELECT * FROM integrations ORDER BY id DESC").all();
  res.json(rows.map(mapIntegration));
});

app.post("/api/integrations", auth, admin, (req, res) => {
  const {
    title,
    icon = "🧩",
    endpointUrl,
    authHeader = "Authorization",
    authToken = "",
    authScheme = "Bearer",
    isPublic = false,
    responsePath = "",
    refreshMinutes = 10,
    mappings = [],
  } = req.body as {
    title?: string;
    icon?: string;
    endpointUrl?: string;
    authHeader?: string;
    authToken?: string;
    authScheme?: string;
    isPublic?: boolean;
    responsePath?: string;
    refreshMinutes?: number;
    mappings?: IntegrationMapping[];
  };

  if (!title?.trim() || !endpointUrl?.trim()) return res.status(400).json({ error: "Title and endpoint URL are required" });
  if (!Array.isArray(mappings)) return res.status(400).json({ error: "Mappings must be an array" });
  const result = db.prepare(`INSERT INTO integrations(title, icon, endpoint_url, auth_header, auth_token, auth_scheme, is_public, response_path, mappings_json, refresh_minutes)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(title.trim(), icon.trim() || "🧩", endpointUrl.trim(), authHeader.trim() || "Authorization", String(authToken), authScheme, toSqliteBool(isPublic), responsePath.trim(), JSON.stringify(mappings), Math.max(1, Number(refreshMinutes) || 10));
  const row = db.prepare("SELECT * FROM integrations WHERE id=?").get(result.lastInsertRowid);
  res.status(201).json(mapIntegration(row));
});

app.put("/api/integrations/:id", auth, admin, (req, res) => {
  const existing = db.prepare("SELECT * FROM integrations WHERE id=?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Integration not found" });
  const {
    title,
    icon = "🧩",
    endpointUrl,
    authHeader = "Authorization",
    authToken = "",
    authScheme = "Bearer",
    isPublic = false,
    responsePath = "",
    refreshMinutes = 10,
    mappings = [],
  } = req.body as {
    title?: string;
    icon?: string;
    endpointUrl?: string;
    authHeader?: string;
    authToken?: string;
    authScheme?: string;
    isPublic?: boolean;
    responsePath?: string;
    refreshMinutes?: number;
    mappings?: IntegrationMapping[];
  };
  if (!title?.trim() || !endpointUrl?.trim()) return res.status(400).json({ error: "Title and endpoint URL are required" });
  if (!Array.isArray(mappings)) return res.status(400).json({ error: "Mappings must be an array" });
  db.prepare(`UPDATE integrations SET title=?, icon=?, endpoint_url=?, auth_header=?, auth_token=?, auth_scheme=?, is_public=?, response_path=?, mappings_json=?, refresh_minutes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(title.trim(), icon.trim() || "🧩", endpointUrl.trim(), authHeader.trim() || "Authorization", String(authToken), authScheme, toSqliteBool(isPublic), responsePath.trim(), JSON.stringify(mappings), Math.max(1, Number(refreshMinutes) || 10), req.params.id);
  integrationCache.delete(Number(req.params.id));
  const row = db.prepare("SELECT * FROM integrations WHERE id=?").get(req.params.id);
  res.json(mapIntegration(row));
});

app.post("/api/integrations/test", auth, admin, async (req, res) => {
  const {
    title = "Preview",
    icon = "🧩",
    endpointUrl,
    authHeader = "Authorization",
    authToken = "",
    authScheme = "Bearer",
    responsePath = "",
    refreshMinutes = 10,
    mappings = [],
  } = req.body as {
    title?: string;
    icon?: string;
    endpointUrl?: string;
    authHeader?: string;
    authToken?: string;
    authScheme?: string;
    responsePath?: string;
    refreshMinutes?: number;
    mappings?: IntegrationMapping[];
  };
  if (!endpointUrl?.trim()) return res.status(400).json({ error: "Endpoint URL is required for test" });
  if (!Array.isArray(mappings)) return res.status(400).json({ error: "Mappings must be an array" });
  try {
    const payload = await fetchIntegrationData(
      {
        id: 0,
        title: title.trim() || "Preview",
        icon: icon.trim() || "🧩",
        endpointUrl: endpointUrl.trim(),
        authHeader: authHeader.trim() || "Authorization",
        authToken: String(authToken),
        authScheme,
        isPublic: false,
        responsePath: responsePath.trim(),
        refreshMinutes: Math.max(1, Number(refreshMinutes) || 10),
        mappings,
      },
      false,
    );
    res.json(payload);
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "Integration test failed" });
  }
});

app.delete("/api/integrations/:id", auth, admin, (req, res) => {
  db.prepare("DELETE FROM integrations WHERE id=?").run(req.params.id);
  integrationCache.delete(Number(req.params.id));
  res.status(204).end();
});

app.get("/api/integrations/public", (_req, res) => {
  const rows = db.prepare("SELECT id, title, icon, endpoint_url, response_path, mappings_json, refresh_minutes FROM integrations WHERE is_public=1 ORDER BY id DESC").all() as any[];
  res.json(rows.map((row) => ({
    id: row.id,
    title: row.title,
    icon: row.icon,
    endpointUrl: row.endpoint_url,
    responsePath: row.response_path,
    refreshMinutes: row.refresh_minutes,
    mappings: JSON.parse(row.mappings_json || "[]"),
  })));
});

app.get("/api/integrations/:id/data", async (req, res) => {
  const row = db.prepare("SELECT * FROM integrations WHERE id=?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Integration not found" });
  const integration = mapIntegration(row);
  const currentUser = getOptionalUser(req);
  if (!integration.isPublic && currentUser?.role !== "admin") {
    return res.status(403).json({ error: "Integration data is private" });
  }
  try {
    const payload = await fetchIntegrationData(integration);
    res.json(payload);
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "Endpoint request failed" });
  }
});

app.get("/api/integrations/data/all", async (_req, res) => {
  const rows = db.prepare("SELECT * FROM integrations WHERE is_public=1 ORDER BY id DESC").all();
  const mapped = rows.map(mapIntegration);
  const values = await Promise.all(mapped.map(async (integration) => {
    try {
      return await fetchIntegrationData(integration);
    } catch (error) {
      return { id: integration.id, title: integration.title, icon: integration.icon, error: error instanceof Error ? error.message : "Endpoint failed" };
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
  const { username, password, role = "user" } = req.body;
  if (!username?.trim() || !password || !["user", "admin"].includes(role)) return res.status(400).json({ error: "Valid username, password, and role are required" });
  try {
    const result = db.prepare("INSERT INTO users(username,password_hash,role) VALUES (?,?,?)").run(username.trim(), bcrypt.hashSync(password, 12), role);
    res.status(201).json(db.prepare("SELECT id, username, role, created_at AS createdAt FROM users WHERE id=?").get(result.lastInsertRowid));
  } catch {
    res.status(409).json({ error: "Username already exists" });
  }
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
