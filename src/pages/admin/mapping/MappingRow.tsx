import { useId, useState } from "react";
import { ArrowRight, Braces, ChevronDown, Crosshair, GripVertical, Plus, SlidersHorizontal, Trash2, X } from "lucide-react";
import type { IntegrationField, IntegrationMapping, MappingCondition, MappingOperator } from "../../../types";
import { previewValue } from "../../../lib/json-path";
import { cn } from "../../../lib/utils";
import { Button } from "../../../components/ui/button";
import { Field, Input, Select, Textarea } from "../../../components/ui/input";
import { IntegrationFieldValue } from "../../../components/integration-field";
import { LOGIC_SNIPPETS, NUMERIC_TYPES, VALUE_TYPES } from "./mapping-utils";
import { PATH_MIME } from "./SourcePanel";

export const ROW_MIME = "application/x-hub-row";
const OPERATORS: MappingOperator[] = [">", ">=", "<", "<=", "==", "!="];

type RowProps = {
  mapping: IntegrationMapping;
  index: number;
  count: number;
  /** Value at the source path in the loaded sample (undefined = no sample / not found). */
  sampleValue: unknown;
  hasSample: boolean;
  /** This row's output from the live preview. */
  result?: IntegrationField;
  previewPending: boolean;
  groups: string[];
  picking: boolean;
  expanded: boolean;
  /** Open the logic box straight away (new computed field). */
  logicRequested?: boolean;
  onChange: (patch: Partial<IntegrationMapping>) => void;
  onDropPath: (path: string) => void;
  onMove: (from: number, to: number) => void;
  onRemove: () => void;
  onStartPick: () => void;
  onToggleExpanded: () => void;
};

export function MappingRow(props: RowProps) {
  const { mapping, index, count, sampleValue, hasSample, result, picking, expanded, onChange } = props;
  const [dropState, setDropState] = useState<"none" | "path" | "row">("none");
  const [logicOpen, setLogicOpen] = useState(Boolean(mapping.transform) || Boolean(props.logicRequested));
  const showLogic = logicOpen || Boolean(mapping.transform);
  const incomplete = !mapping.path.trim() && !mapping.transform?.trim();
  const logicLines = Math.min(6, Math.max(1, (mapping.transform ?? "").split("\n").length));

  return (
    <div
      className={cn("map-row", picking && "is-picking", dropState === "path" && "drop-path", dropState === "row" && "drop-row")}
      onDragOver={(e) => {
        const types = e.dataTransfer.types;
        if (types.includes(PATH_MIME) || types.includes(ROW_MIME)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = types.includes(PATH_MIME) ? "copy" : "move";
          setDropState(types.includes(PATH_MIME) ? "path" : "row");
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropState("none");
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDropState("none");
        const path = e.dataTransfer.getData(PATH_MIME);
        const from = e.dataTransfer.getData(ROW_MIME);
        if (e.dataTransfer.types.includes(PATH_MIME)) props.onDropPath(path);
        else if (from !== "") props.onMove(Number(from), index);
      }}
    >
      <button
        type="button"
        className="map-handle"
        draggable
        aria-label={`Field ${index + 1} of ${count}. Drag to reorder, or use the up and down arrow keys.`}
        onDragStart={(e) => {
          e.dataTransfer.setData(ROW_MIME, String(index));
          e.dataTransfer.effectAllowed = "move";
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" && index > 0) { e.preventDefault(); props.onMove(index, index - 1); }
          if (e.key === "ArrowDown" && index < count - 1) { e.preventDefault(); props.onMove(index, index + 1); }
        }}
      >
        <GripVertical size={16} />
      </button>

      {/* Source */}
      <div className="map-cell map-source">
        <div className="map-input-row">
          <Input
            className="map-path-input"
            title={mapping.path || undefined}
            value={mapping.path}
            placeholder={mapping.transform ? "(none, logic only)" : "Drop a field or type a path"}
            aria-label={`Source path for ${mapping.label || `field ${index + 1}`}`}
            onChange={(e) => onChange({ path: e.target.value })}
          />
          <Button type="button" variant={picking ? "secondary" : "ghost"} size="icon-sm" aria-pressed={picking} aria-label="Pick from the Source panel" title="Pick from the Source panel" onClick={props.onStartPick}>
            <Crosshair size={14} />
          </Button>
        </div>
        <span className="map-sample" title={hasSample && mapping.path ? previewValue(sampleValue, 200) : undefined}>
          {hasSample ? (mapping.path ? previewValue(sampleValue, 32) : mapping.transform ? "uses data / root" : "whole root") : " "}
        </span>
      </div>

      <ArrowRight size={16} className="map-arrow" aria-hidden="true" />

      {/* Logic */}
      <div className="map-cell map-logic">
        {showLogic ? (
          <>
            <div className="map-input-row">
              <Textarea
                className="logic-input min-h-0 py-1.5"
                rows={logicLines}
                spellCheck={false}
                value={mapping.transform ?? ""}
                placeholder="value"
                aria-label={`Logic for ${mapping.label || `field ${index + 1}`}`}
                onChange={(e) => onChange({ transform: e.target.value })}
                autoFocus={logicOpen && !mapping.transform}
              />
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove logic" title="Remove logic" onClick={() => { onChange({ transform: undefined }); setLogicOpen(false); }}><X size={14} /></Button>
            </div>
            {!mapping.transform && (
              <Select className="h-8 text-xs" aria-label="Start from a snippet" value="" onChange={(e) => e.target.value && onChange({ transform: e.target.value })}>
                <option value="">Start from a snippet…</option>
                {LOGIC_SNIPPETS.map((snippet) => <option key={snippet.label} value={snippet.code}>{snippet.label}</option>)}
              </Select>
            )}
          </>
        ) : (
          <button type="button" className="logic-add" onClick={() => setLogicOpen(true)}><Braces size={14} /> Add logic</button>
        )}
      </div>

      <ArrowRight size={16} className="map-arrow" aria-hidden="true" />

      {/* Target */}
      <div className="map-cell map-target">
        <Input value={mapping.label} placeholder="Label on the card" aria-label={`Label for field ${index + 1}`} onChange={(e) => onChange({ label: e.target.value })} />
        <Select className="h-8 text-xs" aria-label={`Type for ${mapping.label || `field ${index + 1}`}`} value={mapping.valueType} onChange={(e) => onChange({ valueType: e.target.value as IntegrationMapping["valueType"] })}>
          {VALUE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
        </Select>
      </div>

      <div className="map-actions">
        <Button type="button" variant={expanded ? "secondary" : "ghost"} size="icon-sm" aria-expanded={expanded} aria-label="Display settings" title="Display settings" onClick={props.onToggleExpanded}>
          <SlidersHorizontal size={15} />
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${mapping.label || `field ${index + 1}`}`} onClick={props.onRemove}><Trash2 size={15} /></Button>
      </div>

      <div className="map-result" aria-live="polite">
        {incomplete ? (
          <span className="muted-text">Drop a source field or add logic.</span>
        ) : !hasSample ? (
          <span className="muted-text">Load a sample to see the result.</span>
        ) : result ? (
          result.error
            ? <span className="map-result-error">⚠ {result.error}</span>
            : <><span className="map-result-label">Result{props.previewPending ? " (updating…)" : ""}</span><span className="map-result-value"><IntegrationFieldValue field={result} /></span>{result.hidden && <span className="muted-text">(hidden: empty)</span>}</>
        ) : (
          <span className="muted-text">Calculating…</span>
        )}
      </div>

      {expanded && <FieldSettings mapping={mapping} groups={props.groups} onChange={onChange} />}
    </div>
  );
}

function FieldSettings({ mapping, groups, onChange }: { mapping: IntegrationMapping; groups: string[]; onChange: (patch: Partial<IntegrationMapping>) => void }) {
  const numeric = NUMERIC_TYPES.includes(mapping.valueType);
  const isDate = mapping.valueType === "date" || mapping.valueType === "unix-seconds";
  const isList = mapping.valueType === "list";
  const listId = useId();
  const num = (value: string) => (value === "" ? undefined : Number(value));
  const conditions = mapping.conditions ?? [];
  const setCondition = (i: number, patch: Partial<MappingCondition>) =>
    onChange({ conditions: conditions.map((condition, index) => (index === i ? { ...condition, ...patch } : condition)) });

  return (
    <div className="map-settings">
      <div className="map-settings-section">
        <span className="map-settings-title">Layout</span>
        <div className="map-settings-grid">
          <Field label="Group" hint="Fields with the same group sit together under a heading.">
            <Input list={listId} value={mapping.group ?? ""} placeholder="e.g. Today" onChange={(e) => onChange({ group: e.target.value || undefined })} />
            <datalist id={listId}>{groups.map((group) => <option key={group} value={group} />)}</datalist>
          </Field>
          <Field label="Size">
            <Select value={mapping.size ?? "normal"} onChange={(e) => onChange({ size: e.target.value === "normal" ? undefined : (e.target.value as IntegrationMapping["size"]) })}>
              <option value="small">Small</option><option value="normal">Normal</option><option value="large">Large (headline number)</option>
            </Select>
          </Field>
          <div className="map-checks">
            <label className="checkbox-inline"><input type="checkbox" checked={Boolean(mapping.wide)} onChange={(e) => onChange({ wide: e.target.checked || undefined })} /> Full width</label>
            <label className="checkbox-inline"><input type="checkbox" checked={Boolean(mapping.hideIfEmpty)} onChange={(e) => onChange({ hideIfEmpty: e.target.checked || undefined })} /> Hide when empty</label>
          </div>
        </div>
      </div>

      <div className="map-settings-section">
        <span className="map-settings-title">Text</span>
        <div className="map-settings-grid">
          <Field label="Prefix"><Input value={mapping.prefix ?? ""} maxLength={20} placeholder="$" onChange={(e) => onChange({ prefix: e.target.value || undefined })} /></Field>
          <Field label="Suffix"><Input value={mapping.suffix ?? ""} maxLength={20} placeholder="°C" onChange={(e) => onChange({ suffix: e.target.value || undefined })} /></Field>
          <Field label="Max length" hint="Longer text ends with …">
            <Input type="number" min={1} max={1000} value={mapping.maxLength ?? ""} placeholder="no limit" onChange={(e) => onChange({ maxLength: num(e.target.value) })} />
          </Field>
          {(numeric || isList) && (
            <Field label="Decimals"><Input type="number" min={0} max={10} value={mapping.decimals ?? ""} placeholder="auto" onChange={(e) => onChange({ decimals: num(e.target.value) })} /></Field>
          )}
          {mapping.valueType === "currency" && (
            <Field label="Currency"><Input value={mapping.currency ?? ""} maxLength={3} placeholder="USD" onChange={(e) => onChange({ currency: e.target.value.toUpperCase() || undefined })} /></Field>
          )}
          {isDate && (
            <Field label="Date style">
              <Select value={mapping.dateStyle ?? "datetime"} onChange={(e) => onChange({ dateStyle: e.target.value as IntegrationMapping["dateStyle"] })}>
                <option value="datetime">Date and time</option><option value="date">Date only</option><option value="time">Time only</option><option value="relative">Relative (3 hours ago)</option>
              </Select>
            </Field>
          )}
          {isList && (
            <Field label="Max items"><Input type="number" min={1} max={100} value={mapping.maxItems ?? ""} placeholder="10" onChange={(e) => onChange({ maxItems: num(e.target.value) })} /></Field>
          )}
        </div>
      </div>

      <details className="map-settings-section map-emoji" open={Boolean(mapping.emoji || mapping.positiveEmoji || mapping.negativeEmoji || mapping.zeroEmoji || conditions.length)}>
        <summary className="map-settings-title">Emoji rules <ChevronDown size={13} aria-hidden="true" /></summary>
        <div className="map-settings-grid">
          <Field label="Default emoji"><Input value={mapping.emoji ?? ""} onChange={(e) => onChange({ emoji: e.target.value || undefined })} /></Field>
          {numeric && (
            <>
              <Field label="If positive"><Input value={mapping.positiveEmoji ?? ""} onChange={(e) => onChange({ positiveEmoji: e.target.value || undefined })} /></Field>
              <Field label="If negative"><Input value={mapping.negativeEmoji ?? ""} onChange={(e) => onChange({ negativeEmoji: e.target.value || undefined })} /></Field>
              <Field label="If zero"><Input value={mapping.zeroEmoji ?? ""} onChange={(e) => onChange({ zeroEmoji: e.target.value || undefined })} /></Field>
            </>
          )}
        </div>
        <div className="condition-block">
          <div className="condition-header">
            <span>Conditions (checked against the value after logic)</span>
            <div className="condition-actions">
              {conditions.length > 1 && (
                <Select aria-label="Condition mode" className="h-8 w-auto" value={mapping.conditionMode || "AND"} onChange={(e) => onChange({ conditionMode: e.target.value as "AND" | "OR" })}>
                  <option value="AND">Match all (AND)</option>
                  <option value="OR">Match any (OR)</option>
                </Select>
              )}
              <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ conditions: [...conditions, { operator: ">", value: 0, emoji: "" }] })}><Plus size={13} /> Condition</Button>
            </div>
          </div>
          {conditions.map((condition, i) => (
            <div className="condition-row" key={i}>
              <Select aria-label="Operator" value={condition.operator} onChange={(e) => setCondition(i, { operator: e.target.value as MappingOperator })}>
                {OPERATORS.map((operator) => <option key={operator} value={operator}>{operator}</option>)}
              </Select>
              <Input aria-label="Value" type="number" value={condition.value} onChange={(e) => setCondition(i, { value: Number(e.target.value) })} />
              <Input aria-label="Emoji when true" placeholder="Emoji when true" value={condition.emoji} onChange={(e) => setCondition(i, { emoji: e.target.value })} />
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove condition" onClick={() => onChange({ conditions: conditions.filter((_, index) => index !== i) })}><Trash2 size={14} /></Button>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
