/**
 * Turns an API response into the fields shown on a Live data card.
 *
 *   source path ──▶ optional JavaScript "logic" ──▶ formatted target field
 *
 * Logic runs in QuickJS compiled to WebAssembly. It has no access to the
 * server (no require/process/fs/network), a time limit per expression and a
 * memory cap, so an imported integration file can't run code on the host.
 */
import { getQuickJS, shouldInterruptAfterDeadline, type QuickJSContext, type QuickJSHandle, type QuickJSRuntime, type QuickJSWASMModule } from "quickjs-emscripten";

export type Operator = ">" | ">=" | "<" | "<=" | "==" | "!=";
export const OPERATORS: Operator[] = [">", ">=", "<", "<=", "==", "!="];
export const VALUE_TYPES = ["string", "number", "currency", "percent", "boolean", "date", "unix-seconds", "url", "image", "list"] as const;
export type MappingValueType = (typeof VALUE_TYPES)[number];
export const DATE_STYLES = ["datetime", "date", "time", "relative"] as const;
export type DateStyle = (typeof DATE_STYLES)[number];
export const FIELD_SIZES = ["small", "normal", "large"] as const;
export type FieldSize = (typeof FIELD_SIZES)[number];
export type MappingCondition = { operator: Operator; value: number; emoji: string };

export type IntegrationMapping = {
  label: string;
  /** Where the value comes from. Supports a.b[0].c, items[*].title (every item) and ["key with.dots"]. Empty = the whole response root. */
  path: string;
  valueType: MappingValueType;
  /** "Middle logic": a JavaScript expression (or a function body using `return`). */
  transform?: string;
  // Presentation
  group?: string;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  currency?: string;
  dateStyle?: DateStyle;
  maxLength?: number;
  maxItems?: number;
  size?: FieldSize;
  wide?: boolean;
  hideIfEmpty?: boolean;
  // Emoji rules
  emoji?: string;
  positiveEmoji?: string;
  negativeEmoji?: string;
  zeroEmoji?: string;
  conditionMode?: "AND" | "OR";
  conditions?: MappingCondition[];
  // Legacy single-condition fields from older exports (still honoured).
  conditionOperator?: Operator;
  conditionValue?: number;
  conditionTrueEmoji?: string;
  conditionFalseEmoji?: string;
};

export type MappedField = {
  /** Position of the mapping this field came from. */
  index: number;
  label: string;
  rawValue: unknown;
  displayValue: string;
  /** Untruncated text when maxLength shortened displayValue. */
  fullValue?: string;
  emoji: string;
  valueType: MappingValueType;
  group?: string;
  size?: FieldSize;
  wide?: boolean;
  /** hideIfEmpty matched: the card skips it, the editor preview still shows it. */
  hidden?: boolean;
  /** Formatted entries for list values. */
  items?: string[];
  /** Dates are formatted in the viewer's browser (their timezone and locale). */
  isoValue?: string;
  /** A date field whose value is a list: one ISO string per entry (or the text, if it isn't a date). */
  isoItems?: string[];
  dateStyle?: DateStyle;
  /** Re-applied by the browser around the dates it formats. */
  prefix?: string;
  suffix?: string;
  /** The logic threw or timed out. */
  error?: string;
};

export const MAX_MAPPINGS = 100;
export const TRANSFORM_MAX_LENGTH = 2000;
const TRANSFORM_TIMEOUT_MS = 100;
const SANDBOX_SETUP_TIMEOUT_MS = 1000;
const SANDBOX_MEMORY_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAX_ITEMS = 10;

// ---------- Paths ----------

const WILDCARD = Symbol("wildcard");
type PathToken = string | number | typeof WILDCARD;

/** Tokenise `a.b[0]["odd.key"][*]`. Throws on malformed brackets. */
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
        if (path[j + 1] !== "]") throw new Error(`Unclosed ["…"] in path "${path}"`);
        tokens.push(key);
        i = j + 2;
      } else {
        const end = path.indexOf("]", i);
        if (end === -1) throw new Error(`Unclosed [ in path "${path}"`);
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

function resolveTokens(value: unknown, tokens: PathToken[], index: number): unknown {
  if (index >= tokens.length) return value;
  const token = tokens[index];
  if (token === WILDCARD) {
    if (!Array.isArray(value)) return undefined;
    return value.map((item) => resolveTokens(item, tokens, index + 1));
  }
  if (value === null || typeof value !== "object") return undefined;
  // Own properties only: "constructor" or "__proto__" must not reach prototypes.
  const key = String(token);
  return Object.prototype.hasOwnProperty.call(value, key) ? resolveTokens((value as Record<string, unknown>)[key], tokens, index + 1) : undefined;
}

export function getByPath(data: unknown, path: string | undefined): unknown {
  if (!path?.trim()) return data;
  try {
    return resolveTokens(data, parsePath(path.trim()), 0);
  } catch {
    return undefined;
  }
}

// ---------- Formatting ----------

const isEmpty = (value: unknown) => value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);

function truncate(text: string, maxLength?: number) {
  if (!maxLength) return { text, truncated: false };
  const chars = Array.from(text); // code points, so emoji aren't split
  if (chars.length <= maxLength) return { text, truncated: false };
  return { text: `${chars.slice(0, Math.max(1, maxLength - 1)).join("").trimEnd()}…`, truncated: true };
}

function toDate(value: unknown, type: MappingValueType): Date | null {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const numeric = Number(value);
  let date: Date;
  if (type === "unix-seconds") date = new Date(numeric * 1000);
  else if (Number.isFinite(numeric)) date = new Date(numeric > 10_000_000_000 ? numeric : numeric * 1000);
  else date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateFallback(date: Date, style: DateStyle) {
  if (style === "date") return date.toLocaleDateString();
  if (style === "time") return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return date.toLocaleString();
}

function formatNumber(value: unknown, mapping: IntegrationMapping): string | null {
  const parsed = Number(value);
  if (value === null || value === "" || typeof value === "boolean" || !Number.isFinite(parsed)) return null;
  const digits = mapping.decimals;
  const fraction = digits === undefined ? {} : { minimumFractionDigits: digits, maximumFractionDigits: digits };
  if (mapping.valueType === "currency") {
    try {
      return parsed.toLocaleString(undefined, { style: "currency", currency: mapping.currency || "USD", ...fraction });
    } catch {
      return parsed.toLocaleString(undefined, { style: "currency", currency: "USD", ...fraction });
    }
  }
  if (mapping.valueType === "percent") return `${parsed.toFixed(digits ?? 2)}%`;
  return parsed.toLocaleString(undefined, fraction);
}

/** One value (not a list) as display text, before prefix/suffix/truncation. */
function formatScalar(value: unknown, mapping: IntegrationMapping): string {
  if (value === null || value === undefined || value === "") return "—";
  switch (mapping.valueType) {
    case "number":
    case "currency":
    case "percent":
      return formatNumber(value, mapping) ?? String(value);
    case "boolean":
      if (typeof value === "boolean") return value ? "Yes" : "No";
      return String(value);
    case "date":
    case "unix-seconds": {
      const date = toDate(value, mapping.valueType);
      return date ? formatDateFallback(date, mapping.dateStyle ?? "datetime") : String(value);
    }
    default:
      if (typeof value === "object") {
        // Objects in lists usually have a readable title/name; fall back to JSON.
        const record = value as Record<string, unknown>;
        const label = record.title ?? record.name ?? record.label;
        return typeof label === "string" || typeof label === "number" ? String(label) : JSON.stringify(value);
      }
      return String(value);
  }
}

const decorate = (text: string, mapping: IntegrationMapping) => (text === "—" ? text : `${mapping.prefix ?? ""}${text}${mapping.suffix ?? ""}`);

// ---------- Emoji rules ----------

function evaluateCondition(value: unknown, operator: Operator, conditionValue: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return false;
  switch (operator) {
    case ">": return numeric > conditionValue;
    case ">=": return numeric >= conditionValue;
    case "<": return numeric < conditionValue;
    case "<=": return numeric <= conditionValue;
    case "==": return numeric === conditionValue;
    case "!=": return numeric !== conditionValue;
  }
}

function resolveEmoji(value: unknown, mapping: IntegrationMapping) {
  if (Array.isArray(mapping.conditions) && mapping.conditions.length) {
    const checks = mapping.conditions.map((condition) => evaluateCondition(value, condition.operator, Number(condition.value)));
    const matched = mapping.conditionMode === "OR" ? checks.some(Boolean) : checks.every(Boolean);
    if (matched) {
      const active = mapping.conditions.find((condition, index) => checks[index] && condition.emoji?.trim());
      return active?.emoji || mapping.emoji || "";
    }
    return mapping.conditionFalseEmoji || "";
  }
  if (mapping.conditionOperator && Number.isFinite(mapping.conditionValue)) {
    const matched = evaluateCondition(value, mapping.conditionOperator, Number(mapping.conditionValue));
    return matched ? mapping.conditionTrueEmoji || mapping.emoji || "" : mapping.conditionFalseEmoji || "";
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

// ---------- Logic sandbox ----------

let quickJs: Promise<QuickJSWASMModule> | null = null;
const loadQuickJS = () => (quickJs ??= getQuickJS());

/** A path as JSON for the sandbox: keys and indexes, with null for [*]. "null" = invalid path (no value). */
function pathTokensJson(path: string | undefined) {
  try {
    return JSON.stringify(parsePath((path ?? "").trim()).map((token) => (token === WILDCARD ? null : token)));
  } catch {
    return "null";
  }
}

/**
 * Runs once per sandbox. It parses the response, deep-freezes it, exposes it
 * as the read-only globals `root` and `data`, and returns a `run` function.
 * Only the host holds `run`, and it uses built-ins captured here, so logic
 * that replaces globals or prototypes can't change how later fields get
 * their inputs.
 */
const SANDBOX_SETUP = `(function (json, scopeTokens) {
  "use strict";
  const parse = JSON.parse, stringify = JSON.stringify, isArray = Array.isArray, apply = Reflect.apply;
  const freeze = Object.freeze, isFrozen = Object.isFrozen, keys = Object.keys, assign = Object.assign, define = Object.defineProperty;
  const hasOwn = Object.prototype.hasOwnProperty, slice = Array.prototype.slice;
  const isObject = (o) => o !== null && typeof o === "object";
  // Iterative, so deeply nested JSON can't overflow the stack.
  const deepFreeze = (start) => {
    const stack = [start];
    while (stack.length) {
      const o = stack.pop();
      if (!isObject(o) || isFrozen(o)) continue;
      freeze(o);
      const k = keys(o);
      for (let i = 0; i < k.length; i++) stack.push(o[k[i]]);
    }
    return start;
  };
  // Mirrors getByPath in server/mapping.ts (own properties only; null = every item).
  const resolve = (value, tokens, i) => {
    if (i >= tokens.length) return value;
    const token = tokens[i];
    if (token === null) {
      if (!isArray(value)) return undefined;
      const out = [];
      for (let j = 0; j < value.length; j++) out[j] = resolve(value[j], tokens, i + 1);
      return out;
    }
    if (!isObject(value)) return undefined;
    const key = "" + token;
    return apply(hasOwn, value, [key]) ? resolve(value[key], tokens, i + 1) : undefined;
  };
  const root = deepFreeze(parse(json));
  const scope = parse(scopeTokens);
  let data = scope === null ? undefined : resolve(root, scope, 0);
  if (data === null || data === undefined) data = root;
  deepFreeze(data);
  define(globalThis, "root", { value: root, enumerable: true });
  define(globalThis, "data", { value: data, enumerable: true });
  // A shallow copy, so value.sort() or value.push() work; nested objects stay read-only.
  const copy = (v) => (isArray(v) ? apply(slice, v, []) : isObject(v) ? assign({}, v) : v);
  return function run(fn, tokensJson) {
    const tokens = parse(tokensJson);
    const value = tokens === null ? undefined : copy(resolve(data, tokens, 0));
    const result = apply(fn, undefined, [value, data, root]);
    return result === undefined ? undefined : stringify(result);
  };
})`;

function describeError(vm: QuickJSContext, handle: QuickJSHandle, timeoutMs: number) {
  const dumped = vm.dump(handle) as { name?: string; message?: string } | string;
  handle.dispose();
  if (typeof dumped === "object" && dumped) {
    return dumped.message === "interrupted" ? `took longer than ${timeoutMs}ms` : `${dumped.name ?? "Error"}: ${dumped.message ?? ""}`;
  }
  return String(dumped);
}

type Compiled = { fn: QuickJSHandle } | { error: string; syntaxError: boolean };

class LogicSandbox {
  private constructor(private runtime: QuickJSRuntime, private vm: QuickJSContext, private runner: QuickJSHandle) {}

  /** Load the whole response once; `data` is derived inside the sandbox from responsePath. */
  static async create(response: unknown, responsePath: string) {
    const QuickJS = await loadQuickJS();
    const runtime = QuickJS.newRuntime();
    runtime.setMemoryLimit(SANDBOX_MEMORY_BYTES);
    runtime.setMaxStackSize(1024 * 1024);
    const vm = runtime.newContext();
    runtime.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + SANDBOX_SETUP_TIMEOUT_MS));
    const fail = (error: QuickJSHandle) => {
      const message = describeError(vm, error, SANDBOX_SETUP_TIMEOUT_MS);
      vm.dispose();
      runtime.dispose();
      return new Error(`Could not prepare the response for logic (${message})`);
    };
    const factory = vm.evalCode(SANDBOX_SETUP);
    if (factory.error) throw fail(factory.error);
    const factoryFn = (factory as { value: QuickJSHandle }).value;
    // JSON.parse inside QuickJS: cheaper than evaluating a huge literal, and data can't become code.
    const json = vm.newString(JSON.stringify(response) ?? "null");
    const scope = vm.newString(pathTokensJson(responsePath));
    const made = vm.callFunction(factoryFn, vm.undefined, json, scope);
    json.dispose();
    scope.dispose();
    factoryFn.dispose();
    if (made.error) throw fail(made.error);
    return new LogicSandbox(runtime, vm, (made as { value: QuickJSHandle }).value);
  }

  /**
   * Run logic as an expression (`value * 2`). Only when that doesn't compile,
   * run it as a function body (`const x = …; return x;`). An error thrown while
   * the logic runs, even a SyntaxError from JSON.parse, is reported as-is.
   */
  run(code: string, path: string): { value: unknown } | { error: string } {
    this.runtime.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + TRANSFORM_TIMEOUT_MS));
    // The newline before `)` stops a trailing // comment from swallowing it.
    let compiled = this.compile(`return (${code}\n);`);
    if ("syntaxError" in compiled && compiled.syntaxError) compiled = this.compile(code);
    if ("error" in compiled) return { error: compiled.error };
    const tokens = this.vm.newString(pathTokensJson(path));
    const result = this.vm.callFunction(this.runner, this.vm.undefined, compiled.fn, tokens);
    tokens.dispose();
    compiled.fn.dispose();
    if (result.error) return { error: describeError(this.vm, result.error, TRANSFORM_TIMEOUT_MS) };
    const handle = (result as { value: QuickJSHandle }).value;
    const json = this.vm.dump(handle) as string | undefined;
    handle.dispose();
    return { value: json === undefined ? null : JSON.parse(json) };
  }

  /** Evaluating a function expression only compiles it; the body doesn't run. */
  private compile(body: string): Compiled {
    const result = this.vm.evalCode(`(function (value, data, root) {\n${body}\n})`);
    if (result.error) {
      const error = describeError(this.vm, result.error, TRANSFORM_TIMEOUT_MS);
      return { error, syntaxError: error.startsWith("SyntaxError") };
    }
    return { fn: (result as { value: QuickJSHandle }).value };
  }

  dispose() {
    this.runner.dispose();
    this.vm.dispose();
    this.runtime.dispose();
  }
}

// ---------- Mapping → field ----------

/** The sandbox shared by one card's fields, or why it couldn't be prepared. */
type Logic = { sandbox: LogicSandbox } | { error: string } | null;

function runLogic(logic: Logic, code: string, path: string): { value: unknown } | { error: string } {
  if (!logic) return { error: "Logic is unavailable" };
  if ("error" in logic) return { error: logic.error };
  try {
    return logic.sandbox.run(code, path);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Logic failed" };
  }
}

const isDateType = (type: MappingValueType) => type === "date" || type === "unix-seconds";

function buildField(mapping: IntegrationMapping, index: number, scoped: unknown, logic: Logic): MappedField {
  const base = {
    index,
    label: mapping.label,
    valueType: mapping.valueType,
    group: mapping.group || undefined,
    size: mapping.size && mapping.size !== "normal" ? mapping.size : undefined,
    wide: mapping.wide || undefined,
  };
  let value: unknown;
  const code = mapping.transform?.trim();
  if (code) {
    const outcome = runLogic(logic, code, mapping.path);
    if ("error" in outcome) return { ...base, rawValue: undefined, displayValue: "—", emoji: "", error: outcome.error };
    value = outcome.value;
  } else {
    value = getByPath(scoped, mapping.path);
  }
  // Only links and images read rawValue in the browser. Sending it for every
  // field would ship unmapped API data (a whole object, or a long list past
  // maxItems) to visitors of public cards.
  const rawValue = mapping.valueType === "url" || mapping.valueType === "image" ? value : undefined;
  const field: MappedField = { ...base, rawValue, displayValue: "—", emoji: resolveEmoji(value, mapping) };

  if (mapping.valueType === "list" || Array.isArray(value)) {
    const entries = Array.isArray(value) ? value : isEmpty(value) ? [] : [value];
    const kept = entries.filter((entry) => !isEmpty(entry)).slice(0, mapping.maxItems ?? DEFAULT_MAX_ITEMS);
    // Numbers inside a list honour `decimals` like a number field would.
    const itemFormat = (entry: unknown) => (mapping.valueType === "list" && typeof entry === "number" ? { ...mapping, valueType: "number" as const } : mapping);
    const items = kept.map((entry) => decorate(truncate(formatScalar(entry, itemFormat(entry)), mapping.maxLength).text, mapping));
    if (mapping.valueType === "list") field.items = items;
    if (isDateType(mapping.valueType) && items.length) {
      // Formatted in the browser, like single dates. Entries that aren't dates are sent as text.
      field.isoItems = kept.map((entry) => toDate(entry, mapping.valueType)?.toISOString() ?? formatScalar(entry, mapping));
      field.dateStyle = mapping.dateStyle ?? "datetime";
      if (mapping.prefix) field.prefix = mapping.prefix;
      if (mapping.suffix) field.suffix = mapping.suffix;
    }
    field.displayValue = items.length ? items.join(", ") : "—";
    // Judged after filtering: [null, null] from items[*].missing counts as empty.
    if (mapping.hideIfEmpty && !items.length) field.hidden = true;
    return field;
  }

  if (mapping.hideIfEmpty && isEmpty(value)) field.hidden = true;
  if (isDateType(mapping.valueType)) {
    const date = toDate(value, mapping.valueType);
    if (date) {
      field.isoValue = date.toISOString();
      field.dateStyle = mapping.dateStyle ?? "datetime";
      if (mapping.prefix) field.prefix = mapping.prefix;
      if (mapping.suffix) field.suffix = mapping.suffix;
    }
  }
  const { text, truncated } = truncate(formatScalar(value, mapping), mapping.maxLength);
  field.displayValue = decorate(text, mapping);
  if (truncated) field.fullValue = decorate(formatScalar(value, mapping), mapping);
  return field;
}

/**
 * Build every card field for one response. One sandbox is shared by all
 * fields' logic. If it can't be prepared (a response too big or too deeply
 * nested for its limits), only the fields with logic show the error.
 */
export async function buildFields(mappings: IntegrationMapping[], response: unknown, responsePath: string): Promise<MappedField[]> {
  const scoped = getByPath(response, responsePath) ?? response;
  let logic: Logic = null;
  if (mappings.some((mapping) => mapping.transform?.trim())) {
    try {
      logic = { sandbox: await LogicSandbox.create(response, responsePath) };
    } catch (error) {
      logic = { error: error instanceof Error ? error.message : "Could not prepare the response for logic" };
    }
  }
  try {
    return mappings.map((mapping, index) => buildField(mapping, index, scoped, logic));
  } finally {
    if (logic && "sandbox" in logic) logic.sandbox.dispose();
  }
}

// ---------- Validation ----------

const text = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : undefined);
const int = (value: unknown, min: number, max: number) => {
  const parsed = Number(value);
  return value !== undefined && value !== null && value !== "" && Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : undefined;
};
const oneOf = <T extends string>(value: unknown, options: readonly T[]) => (options.includes(value as T) ? (value as T) : undefined);

/**
 * Validate mappings from the editor or an import. Structural problems are
 * rejected with a message; out-of-range presentation options are dropped.
 */
export function normalizeMappings(raw: unknown): IntegrationMapping[] | string {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return "Mappings must be an array";
  if (raw.length > MAX_MAPPINGS) return `An integration can have at most ${MAX_MAPPINGS} fields`;
  const result: IntegrationMapping[] = [];
  for (let index = 0; index < raw.length; index++) {
    const item: unknown = raw[index];
    const name = `Field ${index + 1}`;
    if (!item || typeof item !== "object" || Array.isArray(item)) return `${name} is not an object`;
    const source = item as Record<string, unknown>;
    const label = text(source.label, 120)?.trim();
    if (!label) return `${name} needs a label`;
    const path = text(source.path, 500)?.trim() ?? "";
    try {
      parsePath(path);
    } catch (error) {
      return `${name} ("${label}"): ${error instanceof Error ? error.message : "invalid path"}`;
    }
    if (typeof source.transform === "string" && source.transform.length > TRANSFORM_MAX_LENGTH) {
      return `${name} ("${label}"): logic must be ${TRANSFORM_MAX_LENGTH} characters or fewer`;
    }
    const conditions = Array.isArray(source.conditions)
      ? source.conditions.slice(0, 20).flatMap((condition) => {
          const c = condition as Record<string, unknown>;
          const operator = oneOf(c?.operator, OPERATORS);
          const value = Number(c?.value);
          const emoji = text(c?.emoji, 32)?.trim();
          return operator && Number.isFinite(value) && emoji ? [{ operator, value, emoji }] : [];
        })
      : [];
    const mapping: IntegrationMapping = {
      label,
      path,
      valueType: oneOf(source.valueType, VALUE_TYPES) ?? "string",
      transform: text(source.transform, TRANSFORM_MAX_LENGTH)?.trim() || undefined,
      group: text(source.group, 60)?.trim() || undefined,
      prefix: text(source.prefix, 20) || undefined,
      suffix: text(source.suffix, 20) || undefined,
      decimals: int(source.decimals, 0, 10),
      currency: typeof source.currency === "string" && /^[A-Za-z]{3}$/.test(source.currency) ? source.currency.toUpperCase() : undefined,
      dateStyle: oneOf(source.dateStyle, DATE_STYLES),
      maxLength: int(source.maxLength, 1, 1000),
      maxItems: int(source.maxItems, 1, 100),
      size: oneOf(source.size, FIELD_SIZES),
      wide: source.wide === true || undefined,
      hideIfEmpty: source.hideIfEmpty === true || undefined,
      emoji: text(source.emoji, 32) || undefined,
      positiveEmoji: text(source.positiveEmoji, 32) || undefined,
      negativeEmoji: text(source.negativeEmoji, 32) || undefined,
      zeroEmoji: text(source.zeroEmoji, 32) || undefined,
      conditionMode: source.conditionMode === "OR" ? "OR" : conditions.length ? "AND" : undefined,
      conditions: conditions.length ? conditions : undefined,
      conditionOperator: oneOf(source.conditionOperator, OPERATORS),
      conditionValue: Number.isFinite(Number(source.conditionValue)) && source.conditionValue !== null && source.conditionValue !== "" ? Number(source.conditionValue) : undefined,
      conditionTrueEmoji: text(source.conditionTrueEmoji, 32) || undefined,
      conditionFalseEmoji: text(source.conditionFalseEmoji, 32) || undefined,
    };
    result.push(JSON.parse(JSON.stringify(mapping)) as IntegrationMapping); // drop undefined keys
  }
  return result;
}
