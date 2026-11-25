import { useEffect, useMemo, useState } from "react";
import { Braces, Plus } from "lucide-react";
import { api } from "../../../api";
import type { IntegrationData, IntegrationMapping } from "../../../types";
import { errorMessage } from "../../../lib/helpers";
import { getByPath, guessValueType, labelFromPath } from "../../../lib/json-path";
import { cn } from "../../../lib/utils";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import { IntegrationFields } from "../../../components/integration-field";
import { createMapping, isComplete, joinPaths, previewMappings, withRowKeys } from "./mapping-utils";
import { MappingRow } from "./MappingRow";
import { useToast } from "../../../components/toast";
import { PATH_MIME, SourcePanel } from "./SourcePanel";

type Endpoint = { title: string; icon: string; endpointUrl: string; authHeader: string; authToken: string; authScheme: string };

/**
 * Source ▸ Logic ▸ Target mapping editor. Drag fields from the sample
 * response (left) onto rows, add optional JavaScript logic, and choose how
 * each result is labelled and displayed. The card preview re-runs the real
 * server-side mapping against the sample as you edit.
 */
export function MappingDesigner({ mappings, setMappings, responsePath, setResponsePath, endpoint }: {
  mappings: IntegrationMapping[];
  setMappings: React.Dispatch<React.SetStateAction<IntegrationMapping[]>>;
  responsePath: string;
  setResponsePath: (path: string) => void;
  endpoint: Endpoint;
}) {
  const toast = useToast();
  // Wrapped so a sample whose JSON is literally `null` still counts as loaded.
  const [sample, setSample] = useState<{ data: unknown } | null>(null);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [sampleError, setSampleError] = useState("");
  /** Latest preview from the server, tagged with the input it was computed for. */
  const [previewResult, setPreviewResult] = useState<{ input: string; data: IntegrationData } | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [pickingFor, setPickingFor] = useState<number | null>(null);
  /** Row key of the computed field just added, whose logic box opens focused. */
  const [logicRequested, setLogicRequested] = useState<string | null>(null);
  const [addOver, setAddOver] = useState(false);

  // Every row needs a stable key so focus follows it when reordered. withRowKeys
  // returns the same array once all rows have one, so this settles immediately.
  useEffect(() => {
    const keyed = withRowKeys(mappings);
    if (keyed !== mappings) setMappings(keyed);
  }, [mappings, setMappings]);

  const scoped = sample ? (getByPath(sample.data, responsePath) ?? sample.data) : undefined;
  const groups = useMemo(() => [...new Set(mappings.map((mapping) => mapping.group?.trim()).filter((group): group is string => Boolean(group)))], [mappings]);

  async function loadSample() {
    if (!endpoint.endpointUrl.trim()) {
      setSampleError("Add the endpoint URL above first, or paste a sample.");
      return;
    }
    setSampleLoading(true);
    setSampleError("");
    try {
      const { data } = await api.integrationSample({ ...endpoint, responsePath });
      setSample({ data });
    } catch (error) {
      setSampleError(errorMessage(error, "Could not load a sample"));
    } finally {
      setSampleLoading(false);
    }
  }

  // Live preview: the server applies the real mapping (including logic) to the sample.
  // "Pending" is derived (result.input !== current input) instead of being set
  // inside the effect: a setState on every keystroke left React work queued
  // during fast typing and tripped its "Maximum update depth" (#185) guard.
  const previewInput = useMemo(
    () => (sample && mappings.length ? JSON.stringify({ responsePath, mappings: previewMappings(mappings) }) : null),
    [sample, mappings, responsePath],
  );
  useEffect(() => {
    if (!previewInput || !sample) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const { responsePath: path, mappings: rows } = JSON.parse(previewInput) as { responsePath: string; mappings: IntegrationMapping[] };
      api.testIntegration({ title: endpoint.title, icon: endpoint.icon, responsePath: path, mappings: rows, sample: sample.data })
        .then((data) => { if (!cancelled) setPreviewResult({ input: previewInput, data }); })
        .catch((error) => {
          if (!cancelled) setPreviewResult({ input: previewInput, data: { id: 0, title: endpoint.title, icon: endpoint.icon, error: errorMessage(error, "Preview failed") } });
        });
    }, 450);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [previewInput, sample, endpoint.title, endpoint.icon]);
  const preview = previewInput ? previewResult?.data ?? null : null;
  const previewPending = Boolean(previewInput) && previewResult?.input !== previewInput;

  useEffect(() => {
    if (pickingFor === null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPickingFor(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickingFor]);

  const update = (index: number, patch: Partial<IntegrationMapping>) =>
    setMappings((current) => current.map((mapping, i) => (i === index ? { ...mapping, ...patch } : mapping)));

  const guessType = (path: string) => (sample ? guessValueType(getByPath(scoped, path), path) : "string");

  function addFromPath(path: string) {
    setMappings((current) => [...current, createMapping({ path, label: labelFromPath(path), valueType: guessType(path) })]);
  }

  /** Point a row at a source field; blank rows also get a label and a guessed type. */
  function assignPath(index: number, path: string) {
    setMappings((current) => current.map((mapping, i) => {
      if (i !== index) return mapping;
      const fresh = !mapping.label.trim();
      return {
        ...mapping,
        path,
        label: fresh ? labelFromPath(path) : mapping.label,
        valueType: fresh && mapping.valueType === "string" ? guessType(path) : mapping.valueType,
      };
    }));
  }

  function choose(path: string) {
    if (pickingFor !== null) {
      assignPath(pickingFor, path);
      setPickingFor(null);
    } else {
      addFromPath(path);
    }
  }

  function move(from: number, to: number) {
    if (from === to || from < 0 || to < 0) return;
    setMappings((current) => {
      const next = [...current];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
    setExpanded(null);
    setPickingFor(null);
  }

  function remove(index: number) {
    setMappings((current) => current.filter((_, i) => i !== index));
    setExpanded(null);
    setPickingFor(null);
  }

  /**
   * Narrow the root to an object and shorten existing paths so they still
   * point at the same data. Refused when a field lives outside that object,
   * its logic reads `data`, or it reads `value` with an empty path (the whole
   * root), since those would silently start reading something else.
   */
  function useAsRoot(relative: string) {
    const isUnder = (path: string) => path === relative || path.startsWith(`${relative}.`) || path.startsWith(`${relative}[`);
    const blocked = mappings.filter((mapping) => {
      const path = mapping.path.trim();
      const logic = mapping.transform ?? "";
      if (path) return !isUnder(path) || /\bdata\b/.test(logic);
      return /\b(data|value)\b/.test(logic);
    });
    if (blocked.length) {
      const names = blocked.slice(0, 3).map((mapping) => `"${mapping.label || `field ${mappings.indexOf(mapping) + 1}`}"`).join(", ");
      toast.error(`Can't use ${relative} as the root: ${names}${blocked.length > 3 ? " and others" : ""} use data outside it.`);
      return;
    }
    const strip = (path: string) =>
      path === relative ? "" : path.startsWith(`${relative}.`) ? path.slice(relative.length + 1) : path.startsWith(`${relative}[`) ? path.slice(relative.length) : path;
    setMappings((current) => current.map((mapping) => ({ ...mapping, path: strip(mapping.path) })));
    setResponsePath(joinPaths(responsePath, relative));
  }

  /**
   * Back to the whole response: prefix paths with the old root so they still
   * resolve. Computed rows with an empty path (the old root) get that root as
   * their path, so their `value` doesn't become the whole response.
   */
  function clearRoot() {
    const old = responsePath;
    setMappings((current) => current.map((mapping) => {
      if (mapping.path.trim()) return { ...mapping, path: joinPaths(old, mapping.path.trim()) };
      return mapping.transform?.trim() ? { ...mapping, path: old } : mapping;
    }));
    setResponsePath("");
    if (mappings.some((mapping) => /\bdata\b/.test(mapping.transform ?? ""))) {
      toast.info("Paths were updated. Logic that uses data now sees the whole response, so check those fields.");
    }
  }

  function addComputed() {
    const row = createMapping();
    // Keyed by row, not index: a row added later at the same position must not open its logic box too.
    setLogicRequested(row._key ?? null);
    setMappings((current) => [...current, row]);
  }

  const results = new Map((preview?.fields ?? []).map((field) => [field.index, field]));
  const cardFields = (preview?.fields ?? []).filter((field) => mappings[field.index] && isComplete(mappings[field.index]));

  return (
    <div className="mapper">
      <aside className="mapper-source">
        <SourcePanel
          scoped={scoped}
          hasSample={Boolean(sample)}
          responsePath={responsePath}
          loading={sampleLoading}
          error={sampleError}
          onLoad={() => void loadSample()}
          onPaste={(data) => { setSample({ data }); setSampleError(""); }}
          onClearRoot={clearRoot}
          onChoose={choose}
          onUseAsRoot={useAsRoot}
          picking={pickingFor !== null}
          pickingLabel={pickingFor !== null ? mappings[pickingFor]?.label : undefined}
          onCancelPick={() => setPickingFor(null)}
        />
      </aside>

      <div className="mapper-main">
        <div className="map-columns" aria-hidden="true">
          <span />
          <span className="map-col-head">Source path</span>
          <span />
          <span className="map-col-head"><span className="mapper-step">2</span> Logic <em>(optional JavaScript)</em></span>
          <span />
          <span className="map-col-head"><span className="mapper-step">3</span> Target field</span>
          <span />
        </div>

        {preview?.error && <p className="form-error" role="alert">Preview: {preview.error}</p>}

        {mappings.map((mapping, index) => (
          <MappingRow
            key={mapping._key ?? index}
            mapping={mapping}
            index={index}
            count={mappings.length}
            sampleValue={sample ? getByPath(scoped, mapping.path) : undefined}
            hasSample={Boolean(sample)}
            result={results.get(index)}
            previewPending={previewPending}
            groups={groups}
            picking={pickingFor === index}
            expanded={expanded === index}
            logicRequested={Boolean(mapping._key) && logicRequested === mapping._key}
            onChange={(patch) => update(index, patch)}
            onDropPath={(path) => assignPath(index, path)}
            onMove={move}
            onRemove={() => remove(index)}
            onStartPick={() => setPickingFor((current) => (current === index ? null : index))}
            onToggleExpanded={() => setExpanded((current) => (current === index ? null : index))}
          />
        ))}

        <div
          className={cn("map-add-zone", addOver && "is-over")}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes(PATH_MIME)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            setAddOver(true);
          }}
          onDragLeave={() => setAddOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setAddOver(false);
            if (e.dataTransfer.types.includes(PATH_MIME)) addFromPath(e.dataTransfer.getData(PATH_MIME));
          }}
        >
          <span className="map-add-hint"><Plus size={15} aria-hidden="true" /> {mappings.length ? "Drop another source field here" : "Drop a source field here to start mapping"}</span>
          <div className="map-add-buttons">
            <Button type="button" size="sm" variant="outline" onClick={() => setMappings((current) => [...current, createMapping()])}><Plus size={14} /> Empty field</Button>
            <Button type="button" size="sm" variant="ghost" onClick={addComputed}><Braces size={14} /> Computed field</Button>
          </div>
        </div>

        <details className="logic-help">
          <summary>How logic works</summary>
          <ul>
            <li><code>value</code> is the source field, <code>data</code> is the response after the root path, and <code>root</code> is the whole response.</li>
            <li>Write an expression (<code>value * 9 / 5 + 32</code>) or several lines ending in <code>return</code>.</li>
            <li>Return a list to show bullet points (set the type to List). Use <code>items[*].name</code> in a path to get every item without logic.</li>
            <li>Inputs are read-only: <code>value.sort()</code> works, but copy nested lists first (<code>[...value.items].sort()</code>).</li>
            <li>Logic runs on the server in a sandbox: no network or files, and each field must finish within 100 ms.</li>
          </ul>
        </details>

        {sample && mappings.length > 0 && (
          <div className="mapper-preview">
            <div className="mapper-col-title">
              <span className="mapper-step">✓</span>
              <div><strong>Card preview</strong><span>Exactly how it renders on the home page. Hidden-when-empty fields show faded.</span></div>
            </div>
            <Card className="live-card">
              <div className="live-card-header">
                <h3><span aria-hidden="true">{endpoint.icon}</span> {endpoint.title || "Untitled integration"}</h3>
                {previewPending && <span className="muted-text">Updating…</span>}
              </div>
              {preview && !preview.error ? <IntegrationFields data={{ ...preview, fields: cardFields }} showHidden /> : <p className="muted-text">{preview?.error ? "Fix the problem above to see the card." : "Calculating…"}</p>}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
