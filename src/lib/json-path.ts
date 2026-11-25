import type { MappingValueType } from "../types";

/**
 * Client copy of the path rules in server/mapping.ts, used by the mapping
 * editor to show sample values. Supports a.b[0], items[*].title and ["odd.key"].
 */
const WILDCARD = Symbol("wildcard");
type PathToken = string | number | typeof WILDCARD;

export function parsePath(path: string): PathToken[] {
  const tokens: PathToken[] = [];
  let i = 0;
  while (i < path.length) {
    const char = path[i];
    if (char === ".") {
      i++;
    } else if (char === "[") {
      const quote = path[i + 1];
      if (quote === '"' || quote === "'") {
        let key = "";
        let j = i + 2;
        for (; j < path.length && path[j] !== quote; j++) {
          if (path[j] === "\\" && j + 1 < path.length) j++;
          key += path[j];
        }
        if (path[j + 1] !== "]") throw new Error("Unclosed [\"…\"]");
        tokens.push(key);
        i = j + 2;
      } else {
        const end = path.indexOf("]", i);
        if (end === -1) throw new Error("Unclosed [");
        const inner = path.slice(i + 1, end).trim();
        tokens.push(inner === "*" ? WILDCARD : /^\d+$/.test(inner) ? Number(inner) : inner);
        i = end + 1;
      }
    } else {
      let j = i;
      while (j < path.length && path[j] !== "." && path[j] !== "[") j++;
      tokens.push(path.slice(i, j).trim());
      i = j;
    }
  }
  return tokens.filter((token) => token !== "");
}

function resolve(value: unknown, tokens: PathToken[], index: number): unknown {
  if (index >= tokens.length) return value;
  const token = tokens[index];
  if (token === WILDCARD) return Array.isArray(value) ? value.map((item) => resolve(item, tokens, index + 1)) : undefined;
  if (value === null || typeof value !== "object") return undefined;
  const key = String(token);
  return Object.prototype.hasOwnProperty.call(value, key) ? resolve((value as Record<string, unknown>)[key], tokens, index + 1) : undefined;
}

export function getByPath(data: unknown, path: string | undefined): unknown {
  if (!path?.trim()) return data;
  try {
    return resolve(data, parsePath(path.trim()), 0);
  } catch {
    return undefined;
  }
}

/** Path to a child key or array index, quoting keys that aren't plain identifiers. */
export function childPath(parent: string, key: string | number | "*"): string {
  if (key === "*" || typeof key === "number") return `${parent}[${key}]`;
  if (/^[A-Za-z_$][\w$]*$/.test(key)) return parent ? `${parent}.${key}` : key;
  return `${parent}[${JSON.stringify(key)}]`;
}

/** "current.temp_c" → "Temp c", "items[*].maxTempF" → "Max temp f". */
export function labelFromPath(path: string): string {
  let tokens: PathToken[] = [];
  try {
    tokens = parsePath(path);
  } catch {
    return "";
  }
  const key = [...tokens].reverse().find((token): token is string => typeof token === "string");
  if (!key) return "Value";
  const words = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_\-.]+/g, " ").trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export type ValueKind = "object" | "array" | "string" | "number" | "boolean" | "null";
export function valueKind(value: unknown): ValueKind {
  if (Array.isArray(value)) return "array";
  if (value === null || value === undefined) return "null";
  if (typeof value === "object") return "object";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "string";
}

/** Short one-line preview of a value for the Source panel and mapping rows. */
export function previewValue(value: unknown, max = 40): string {
  if (value === undefined) return "not found";
  const kind = valueKind(value);
  if (kind === "array") return `${(value as unknown[]).length} items`;
  if (kind === "object") return `${Object.keys(value as object).length} keys`;
  if (kind === "null") return "null";
  const text = kind === "string" ? `"${value as string}"` : String(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Best guess at a field type from a sample value, used when a field is dropped in. */
export function guessValueType(value: unknown, path: string): MappingValueType {
  if (Array.isArray(value)) return "list";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") {
    const key = path.toLowerCase();
    const looksLikeTime = /(time|date|dt|updated|created|timestamp|epoch)/.test(key);
    if (looksLikeTime && value > 946_684_800 && value < 4_102_444_800) return "unix-seconds";
    if (looksLikeTime && value > 946_684_800_000 && value < 4_102_444_800_000) return "date";
    if (/(pct|percent|change)/.test(key) && Math.abs(value) < 1000) return "percent";
    if (/(price|cost|amount|balance|usd|eur)/.test(key)) return "currency";
    return "number";
  }
  if (typeof value === "string") {
    if (/^https?:\/\/\S+\.(png|jpe?g|gif|webp|svg)(\?\S*)?$/i.test(value)) return "image";
    if (/^https?:\/\//i.test(value)) return "url";
    if (/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})?/.test(value) && !Number.isNaN(Date.parse(value))) return "date";
  }
  return "string";
}
