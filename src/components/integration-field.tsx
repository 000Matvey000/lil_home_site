import type { IntegrationData } from "../types";

type Field = NonNullable<IntegrationData["fields"]>[number];

export function IntegrationFieldValue({ field }: { field: Field }) {
  const prefix = field.emoji ? `${field.emoji} ` : "";
  if (field.valueType === "url") {
    const href = String(field.rawValue || field.displayValue || "");
    return href ? (
      <a className="text-link" href={href} target="_blank" rel="noreferrer">
        {prefix}{field.displayValue || href}
      </a>
    ) : <strong>{prefix}—</strong>;
  }
  if (field.valueType === "image") {
    const src = String(field.rawValue || "");
    return src ? (
      <div className="integration-image-wrap">
        <img src={src} alt={field.label} className="integration-image" />
      </div>
    ) : <strong>{prefix}—</strong>;
  }
  return <strong>{prefix}{field.displayValue}</strong>;
}

export function IntegrationFields({ data }: { data: IntegrationData }) {
  if (data.error) return <p className="integration-error">{data.error}</p>;
  if (!data.fields?.length) return <p className="muted-text">No fields mapped yet.</p>;
  return (
    <div className="integration-fields">
      {data.fields.map((field, index) => (
        <div key={`${data.id}-${index}`} className="integration-field" data-wide={field.valueType === "image" || field.valueType === "url"}>
          <span>{field.label}</span>
          <IntegrationFieldValue field={field} />
        </div>
      ))}
    </div>
  );
}
