import type { IntegrationMapping, MappingValueType } from "../../../types";

export const VALUE_TYPES: Array<{ value: MappingValueType; label: string }> = [
  { value: "string", label: "Text" },
  { value: "number", label: "Number" },
  { value: "currency", label: "Currency" },
  { value: "percent", label: "Percent" },
  { value: "boolean", label: "Yes / No" },
  { value: "date", label: "Date" },
  { value: "unix-seconds", label: "Unix time (s)" },
  { value: "list", label: "List" },
  { value: "url", label: "Link" },
  { value: "image", label: "Image" },
];

export const NUMERIC_TYPES: MappingValueType[] = ["number", "currency", "percent"];

let keyCounter = 0;
/** Stable row key so focus and local state follow a row when it moves. (randomUUID needs HTTPS, so a counter.) */
export const newRowKey = () => `row-${++keyCounter}`;

export function createMapping(partial: Partial<IntegrationMapping> = {}): IntegrationMapping {
  return { label: "", path: "", valueType: "string", ...partial, _key: newRowKey() };
}

/** Give rows loaded from the server a key; returns the same array when nothing changed. */
export function withRowKeys(mappings: IntegrationMapping[]): IntegrationMapping[] {
  return mappings.every((mapping) => mapping._key) ? mappings : mappings.map((mapping) => (mapping._key ? mapping : { ...mapping, _key: newRowKey() }));
}

/** A row is usable once it has a label and either a source path or logic. */
export const isComplete = (mapping: IntegrationMapping) => Boolean(mapping.label.trim() && (mapping.path.trim() || mapping.transform?.trim()));

/** Mappings as sent to the server: incomplete rows and empty options removed. */
export function cleanMappings(mappings: IntegrationMapping[]): IntegrationMapping[] {
  return mappings.filter(isComplete).map((mapping) => withoutEmpty({
    ...mapping,
    label: mapping.label.trim(),
    path: mapping.path.trim(),
    transform: mapping.transform?.trim(),
    conditions: mapping.conditions?.filter((condition) => condition.emoji?.trim() && Number.isFinite(condition.value)),
  }));
}

/** Every row, for the live preview; blank labels get a placeholder so the server accepts them. */
export function previewMappings(mappings: IntegrationMapping[]): IntegrationMapping[] {
  return mappings.map((mapping, index) => withoutEmpty({ ...mapping, label: mapping.label.trim() || `Field ${index + 1}` }));
}

function withoutEmpty(mapping: IntegrationMapping): IntegrationMapping {
  return JSON.parse(JSON.stringify(mapping, (key, value) => {
    if (key === "_key") return undefined; // editor-only
    if (key === "path") return value; // "" is meaningful (the whole root)
    if (value === "" || value === null) return undefined;
    if (Array.isArray(value) && value.length === 0) return undefined;
    return value;
  })) as IntegrationMapping;
}

/** Join a response root path and a path relative to it. */
export function joinPaths(root: string, relative: string) {
  if (!root) return relative;
  if (!relative) return root;
  return relative.startsWith("[") ? `${root}${relative}` : `${root}.${relative}`;
}

export type LogicSnippet = { label: string; code: string };

/** Starting points for the "Logic" box. `value` is the source value. */
export const LOGIC_SNIPPETS: LogicSnippet[] = [
  { label: "Round to 1 decimal", code: "Math.round(value * 10) / 10" },
  { label: "Celsius → Fahrenheit", code: "value * 9 / 5 + 32" },
  { label: "Fraction → percent (0.12 → 12)", code: "value * 100" },
  { label: "UPPER CASE", code: "String(value).toUpperCase()" },
  { label: "Capitalise first letter", code: "String(value).charAt(0).toUpperCase() + String(value).slice(1)" },
  { label: "Fallback when empty", code: 'value ?? "n/a"' },
  { label: "True/false → words", code: 'value ? "Open" : "Closed"' },
  { label: "Count items in a list", code: "value.length" },
  { label: "Pick a property from each item", code: "value.map(item => item.name)" },
  { label: "First 3 items", code: "value.slice(0, 3)" },
  { label: "Join a list into text", code: 'value.join(", ")' },
  { label: "Combine two fields", code: "`${data.city}, ${data.country}`" },
  { label: "Change from two fields (%)", code: "(data.close - data.open) / data.open * 100" },
  { label: "Unix seconds → ISO date", code: "new Date(value * 1000).toISOString()" },
  { label: "Multi-line with return", code: "const total = value.reduce((sum, n) => sum + n, 0);\nreturn total / value.length;" },
];
