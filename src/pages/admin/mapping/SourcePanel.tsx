import { useMemo, useState } from "react";
import { ChevronRight, ClipboardPaste, CornerDownRight, Crosshair, DownloadCloud, GripVertical, Plus, Search, X } from "lucide-react";
import { childPath, previewValue, valueKind, type ValueKind } from "../../../lib/json-path";
import { cn } from "../../../lib/utils";
import { Button } from "../../../components/ui/button";
import { Input, Textarea } from "../../../components/ui/input";

export const PATH_MIME = "application/x-hub-path";
const MAX_CHILDREN = 200;
const MAX_SEARCH_DEPTH = 8;
const MAX_SEARCH_RESULTS = 80;

const KIND_LABEL: Record<ValueKind, string> = { object: "{ }", array: "[ ]", string: "abc", number: "123", boolean: "y/n", null: "null" };

type Actions = {
  /** Add a mapping for this path (or assign it, while a row is picking). */
  onChoose: (path: string) => void;
  /** Make this object the response root. */
  onUseAsRoot: (path: string) => void;
  picking: boolean;
};

export function SourcePanel({ scoped, hasSample, responsePath, loading, error, onLoad, onPaste, onClearRoot, pickingLabel, onCancelPick, ...actions }: Actions & {
  /** The sample after the response root path is applied. */
  scoped: unknown;
  hasSample: boolean;
  responsePath: string;
  loading: boolean;
  error: string;
  onLoad: () => void;
  onPaste: (json: unknown) => void;
  onClearRoot: () => void;
  pickingLabel?: string;
  onCancelPick: () => void;
}) {
  const [query, setQuery] = useState("");
  const [pasting, setPasting] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteError, setPasteError] = useState("");

  function usePasted() {
    try {
      onPaste(JSON.parse(pasteText));
      setPasting(false);
      setPasteText("");
      setPasteError("");
    } catch (err) {
      setPasteError(err instanceof Error ? err.message : "That isn't valid JSON");
    }
  }

  return (
    <div className="source-panel">
      <div className="mapper-col-title">
        <span className="mapper-step">1</span>
        <div><strong>Source</strong><span>Fields in the API response</span></div>
      </div>

      <div className="source-actions">
        <Button type="button" size="sm" variant="outline" onClick={onLoad} disabled={loading}><DownloadCloud size={14} /> {loading ? "Loading…" : hasSample ? "Reload sample" : "Load sample"}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setPasting((value) => !value)} aria-expanded={pasting}><ClipboardPaste size={14} /> Paste JSON</Button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {pasting && (
        <div className="paste-box">
          <Textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder='{"current": {"temp_c": 21.4}}' className="code-input" rows={5} aria-label="Sample JSON" />
          {pasteError && <p className="form-error" role="alert">{pasteError}</p>}
          <div className="form-actions"><Button type="button" size="sm" onClick={usePasted} disabled={!pasteText.trim()}>Use this JSON</Button></div>
        </div>
      )}

      {responsePath && (
        <div className="root-chip">
          <span>Root: <code>{responsePath}</code></span>
          <button type="button" onClick={onClearRoot} aria-label="Use the whole response as the root"><X size={13} /></button>
        </div>
      )}

      {actions.picking && (
        <div className="pick-banner" role="status">
          <Crosshair size={14} aria-hidden="true" /> Click a field to use it for <strong>{pickingLabel || "this row"}</strong>
          <button type="button" onClick={onCancelPick}>Cancel</button>
        </div>
      )}

      {hasSample ? (
        <>
          <div className="search-box source-search">
            <Search size={16} aria-hidden="true" />
            <Input type="search" placeholder="Search fields…" aria-label="Search source fields" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className={cn("source-tree", actions.picking && "is-picking")}>
            {query.trim()
              ? <SearchResults data={scoped} query={query.trim().toLowerCase()} {...actions} />
              : <ul role="tree" aria-label="Sample response">
                  {valueKind(scoped) === "object" || valueKind(scoped) === "array"
                    ? <TreeChildren value={scoped} path="" depth={0} {...actions} />
                    : <TreeNode name="(value)" value={scoped} path="" depth={0} {...actions} />}
                </ul>}
          </div>
          <p className="source-hint"><GripVertical size={12} aria-hidden="true" /> Drag a field onto a row, or press <Plus size={11} aria-label="plus" /> to add it.</p>
        </>
      ) : (
        <p className="source-empty">Load a sample response (or paste one) to see its fields here. You can still type paths by hand.</p>
      )}
    </div>
  );
}

function TreeChildren({ value, path, depth, ...actions }: Actions & { value: unknown; path: string; depth: number }) {
  const [mode, setMode] = useState<"first" | "all">("first");
  if (Array.isArray(value)) {
    if (!value.length) return <li className="tree-empty" style={{ paddingLeft: depth * 14 + 26 }}>empty list</li>;
    const itemPath = childPath(path, mode === "all" ? "*" : 0);
    return (
      <>
        <li className="tree-array-mode" style={{ paddingLeft: depth * 14 + 22 }}>
          <div className="mini-segmented" role="radiogroup" aria-label="Which items">
            <button type="button" role="radio" aria-checked={mode === "first"} onClick={() => setMode("first")}>First item</button>
            <button type="button" role="radio" aria-checked={mode === "all"} onClick={() => setMode("all")}>Every item</button>
          </div>
        </li>
        <TreeNode name={mode === "all" ? "[*] each item" : "[0] first item"} value={value[0]} path={itemPath} depth={depth} {...actions} />
      </>
    );
  }
  const entries = Object.entries(value as Record<string, unknown>);
  return (
    <>
      {entries.slice(0, MAX_CHILDREN).map(([key, child]) => (
        <TreeNode key={key} name={key} value={child} path={childPath(path, key)} depth={depth} {...actions} />
      ))}
      {entries.length > MAX_CHILDREN && <li className="tree-empty" style={{ paddingLeft: depth * 14 + 26 }}>…{entries.length - MAX_CHILDREN} more keys (search to find them)</li>}
    </>
  );
}

function TreeNode({ name, value, path, depth, ...actions }: Actions & { name: string; value: unknown; path: string; depth: number }) {
  const kind = valueKind(value);
  const expandable = kind === "object" || kind === "array";
  const [open, setOpen] = useState(depth === 0);
  const inEveryItem = path.includes("[*]");
  return (
    <li role="treeitem" aria-expanded={expandable ? open : undefined} aria-label={path || name}>
      <SourceRow
        path={path}
        depth={depth}
        caret={expandable ? <button type="button" className="tree-caret" aria-label={open ? "Collapse" : "Expand"} onClick={() => setOpen((value) => !value)}><ChevronRight size={14} className={cn(open && "is-open")} /></button> : <span className="tree-caret-spacer" />}
        name={name}
        kind={kind}
        preview={kind === "object" ? `${Object.keys(value as object).length} keys` : previewValue(value, 28)}
        extra={kind === "object" && path && !inEveryItem
          ? <button type="button" className="tree-icon-button" title="Use as root (shortens paths)" aria-label={`Use ${path} as the root`} onClick={() => actions.onUseAsRoot(path)}><CornerDownRight size={13} /></button>
          : null}
        {...actions}
      />
      {expandable && open && (
        <ul role="group">
          <TreeChildren value={value} path={path} depth={depth + 1} {...actions} />
        </ul>
      )}
    </li>
  );
}

/** One draggable row in the tree or search results. */
function SourceRow({ path, depth, caret, name, kind, preview, extra, onChoose, picking }: Actions & {
  path: string;
  depth: number;
  caret?: React.ReactNode;
  name: string;
  kind: ValueKind;
  preview: string;
  extra?: React.ReactNode;
}) {
  return (
    <div
      className="tree-row"
      style={{ paddingLeft: depth * 14 + 4 }}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(PATH_MIME, path);
        e.dataTransfer.setData("text/plain", path);
        e.dataTransfer.effectAllowed = "copy";
      }}
      onClick={(e) => {
        // While a row is picking, clicking anywhere on a field assigns it.
        if (picking && !(e.target as HTMLElement).closest("button")) onChoose(path);
      }}
      title={path || "The whole root"}
    >
      {caret}
      <span className="tree-key">{name}</span>
      <span className={cn("tree-kind", `kind-${kind}`)}>{KIND_LABEL[kind]}</span>
      <span className="tree-preview">{preview}</span>
      {extra}
      <button type="button" className="tree-icon-button tree-add" onClick={() => onChoose(path)} aria-label={picking ? `Use ${path || "the root"}` : `Add field ${path || "root"}`} title={picking ? "Use this field" : "Add as a new field"}>
        {picking ? <Crosshair size={13} /> : <Plus size={13} />}
      </button>
    </div>
  );
}

function SearchResults({ data, query, ...actions }: Actions & { data: unknown; query: string }) {
  const results = useMemo(() => {
    const found: Array<{ path: string; value: unknown }> = [];
    const walk = (value: unknown, path: string, depth: number) => {
      if (found.length >= MAX_SEARCH_RESULTS || depth > MAX_SEARCH_DEPTH) return;
      const kind = valueKind(value);
      if (path && path.toLowerCase().includes(query)) found.push({ path, value });
      if (kind === "array" && (value as unknown[]).length) walk((value as unknown[])[0], childPath(path, 0), depth + 1);
      if (kind === "object") for (const [key, child] of Object.entries(value as Record<string, unknown>).slice(0, MAX_CHILDREN)) walk(child, childPath(path, key), depth + 1);
    };
    walk(data, "", 0);
    return found;
  }, [data, query]);
  if (!results.length) return <p className="source-empty">No fields match "{query}".</p>;
  return (
    <ul aria-label="Matching fields">
      {results.map(({ path, value }) => (
        <li key={path}>
          <SourceRow path={path} depth={0} name={path} kind={valueKind(value)} preview={previewValue(value, 24)} {...actions} />
        </li>
      ))}
    </ul>
  );
}
