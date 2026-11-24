import type { FileValue, SiteSettings } from "../types";

export const defaultSettings: SiteSettings = {
  siteName: "Home Hub",
  headerSubtitle: "Quick links & updates",
  announcementsTitle: "Announcements",
  linksTitle: "Useful links",
  photosTitle: "Photos",
  footerText: "Home Hub keeps your household informed.",
  logoUrl: "",
  faviconUrl: "",
  bannerUrl: "",
  showHero: true,
  showPhotos: true,
  showIntegrations: true,
  showAnnouncements: true,
  showLinks: true,
};

export type HomeSectionKey = "showHero" | "showPhotos" | "showIntegrations" | "showAnnouncements" | "showLinks";

export function readFile(file: File): Promise<FileValue> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, base64: String(reader.result) });
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export function parseCategoryText(raw: string) {
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function categoryFilterMatch(raw: string, selected: string) {
  if (selected === "all") return true;
  return parseCategoryText(raw).includes(selected);
}

function readSettingBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
}

/** Settings are stored as strings server-side; coerce the booleans back. */
export function normalizeSettings(raw: Partial<Record<keyof SiteSettings, unknown>>): SiteSettings {
  const merged = { ...defaultSettings, ...raw } as SiteSettings;
  const keys: HomeSectionKey[] = ["showHero", "showPhotos", "showIntegrations", "showAnnouncements", "showLinks"];
  for (const key of keys) merged[key] = readSettingBoolean(raw[key], defaultSettings[key]);
  return merged;
}

export function toFriendlyErrorMessage(raw: string) {
  const message = raw.trim();
  const normalized = message.toLowerCase();
  if (!message) return "Something went wrong.";
  if (normalized.includes("failed to fetch") || normalized.includes("networkerror")) {
    return "Could not reach the server or endpoint. Check the URL/network and try again.";
  }
  if (normalized.includes("unauthorized") || normalized.includes("401")) {
    return "Authentication failed. Please sign in again or verify the token.";
  }
  if (normalized.includes("forbidden") || normalized.includes("403")) {
    return "You do not have permission to do that.";
  }
  if (normalized.includes("not found") || normalized.includes("404")) {
    return "The requested resource was not found.";
  }
  if (normalized.includes("timeout") || normalized.includes("timed out")) {
    return "The request timed out. Please try again.";
  }
  if (normalized.includes("invalid import file format")) {
    return "Import file is invalid. Use the exported Home Hub JSON format.";
  }
  if (normalized.includes("import file has no integrations")) {
    return "Import file has no integrations to load.";
  }
  if (normalized.includes("endpoint url is required for test")) {
    return "Add an endpoint URL before running an integration test.";
  }
  return message;
}

export function errorMessage(error: unknown, fallback = "Something went wrong.") {
  return error instanceof Error ? error.message : fallback;
}

export function updateFavicon(url: string) {
  let node = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
  if (!node) {
    node = document.createElement("link");
    node.rel = "icon";
    document.head.appendChild(node);
  }
  node.href = url || "/favicon.ico";
}

export function formatDate(value?: string) {
  if (!value) return "";
  // SQLite CURRENT_TIMESTAMP is UTC without a zone marker.
  const date = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
