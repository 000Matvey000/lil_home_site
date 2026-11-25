import { AlertTriangle } from "lucide-react";
import type { DateStyle, IntegrationData, IntegrationField } from "../types";
import { cn } from "../lib/utils";

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 31_536_000], ["month", 2_592_000], ["week", 604_800], ["day", 86_400], ["hour", 3_600], ["minute", 60], ["second", 1],
];

/** Dates are formatted here, in the viewer's own timezone and locale. */
function formatDate(iso: string, style: DateStyle = "datetime") {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  if (style === "date") return date.toLocaleDateString(undefined, { dateStyle: "medium" });
  if (style === "time") return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (style === "relative") {
    const seconds = (date.getTime() - Date.now()) / 1000;
    const [unit, size] = RELATIVE_UNITS.find(([, length]) => Math.abs(seconds) >= length) ?? ["second", 1];
    return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(Math.round(seconds / size), unit);
  }
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function IntegrationFieldValue({ field }: { field: IntegrationField }) {
  const prefix = field.emoji ? `${field.emoji} ` : "";
  if (field.error) {
    return <strong className="field-error" title={field.error}><AlertTriangle size={14} aria-hidden="true" /> Logic error</strong>;
  }
  if (field.items) {
    return field.items.length ? (
      <ul className="field-list">
        {field.items.map((item, index) => <li key={index}>{index === 0 && prefix}{item}</li>)}
      </ul>
    ) : <strong>—</strong>;
  }
  if (field.valueType === "url") {
    const href = String(field.rawValue || field.displayValue || "");
    return href && field.displayValue !== "—" ? (
      <a className="text-link" href={href} target="_blank" rel="noreferrer" title={field.fullValue}>
        {prefix}{field.displayValue || href}
      </a>
    ) : <strong>{prefix}—</strong>;
  }
  if (field.valueType === "image") {
    const src = String(field.rawValue || "");
    return src ? (
      <div className="integration-image-wrap">
        <img src={src} alt={field.label} className="integration-image" loading="lazy" />
      </div>
    ) : <strong>{prefix}—</strong>;
  }
  if (field.isoItems?.length) {
    const dates = field.isoItems.map((iso) => `${field.prefix ?? ""}${formatDate(iso, field.dateStyle)}${field.suffix ?? ""}`);
    return <strong>{prefix}{dates.join(", ")}</strong>;
  }
  if (field.isoValue) {
    return <strong title={new Date(field.isoValue).toLocaleString()}>{prefix}{field.prefix}{formatDate(field.isoValue, field.dateStyle)}{field.suffix}</strong>;
  }
  return <strong title={field.fullValue}>{prefix}{field.displayValue}</strong>;
}

/** Group fields by their `group` name, keeping the order each group first appears in. */
function groupFields(fields: IntegrationField[]) {
  const groups: Array<{ name: string; fields: IntegrationField[] }> = [];
  for (const field of fields) {
    const name = field.group ?? "";
    let group = groups.find((entry) => entry.name === name);
    if (!group) groups.push((group = { name, fields: [] }));
    group.fields.push(field);
  }
  return groups;
}

/**
 * The fields of a Live data card. `showHidden` is for the editor preview,
 * which shows hide-when-empty fields (dimmed) so they don't vanish while you work.
 */
export function IntegrationFields({ data, showHidden = false }: { data: IntegrationData; showHidden?: boolean }) {
  if (data.error) return <p className="integration-error">{data.error}</p>;
  const fields = (data.fields ?? []).filter((field) => showHidden || !field.hidden);
  if (!fields.length) return <p className="muted-text">{data.fields?.length ? "Nothing to show right now." : "No fields mapped yet."}</p>;
  return (
    <div className="integration-groups">
      {groupFields(fields).map((group) => (
        <section key={group.name || "_"} className="integration-group" aria-label={group.name || undefined}>
          {group.name && <h4 className="integration-group-title">{group.name}</h4>}
          <div className="integration-fields">
            {group.fields.map((field) => (
              <div
                key={field.index ?? field.label}
                className={cn("integration-field", field.hidden && "is-hidden")}
                data-size={field.size}
                data-wide={field.wide || field.valueType === "image" || field.valueType === "url" || undefined}
              >
                <span className="integration-field-label">{field.label}</span>
                <IntegrationFieldValue field={field} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
