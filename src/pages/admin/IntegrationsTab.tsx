import { useEffect, useId, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Bot, Check, Copy, Download, FlaskConical, Pencil, Plug, Plus, Search, Trash2, Upload } from "lucide-react";
import { api } from "../../api";
import type { IntegrationConfig, IntegrationData, IntegrationMapping, MappingCondition, MappingOperator } from "../../types";
import { copyText, selectElementText } from "../../lib/clipboard";
import { errorMessage } from "../../lib/helpers";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Panel } from "../../components/ui/card";
import { Field, Input, Select } from "../../components/ui/input";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { IntegrationFields } from "../../components/integration-field";
import { useToast } from "../../components/toast";

const VALUE_TYPES = ["string", "number", "currency", "percent", "boolean", "date", "unix-seconds", "url", "image"] as const;
const OPERATORS: MappingOperator[] = [">", ">=", "<", "<=", "==", "!="];

const AI_IMPORT_GUIDE = [
  "```markdown",
  "# Task: Build Home Hub integration import JSON",
  "",
  "Given:",
  "- endpoint metadata (URL, auth scheme/header/token, response root path)",
  "- one or more sample JSON responses from the endpoint",
  "- desired dashboard fields and labels",
  "",
  "Output ONLY valid JSON matching this shape:",
  "",
  "{",
  "  \"version\": 1,",
  "  \"exportedAt\": \"<ISO timestamp>\",",
  "  \"integrations\": [",
  "    {",
  "      \"title\": \"<name shown in UI>\",",
  "      \"icon\": \"<emoji>\",",
  "      \"endpointUrl\": \"<full URL>\",",
  "      \"authHeader\": \"Authorization\",",
  "      \"authToken\": \"<token or empty>\",",
  "      \"authScheme\": \"None|Bearer|Token\",",
  "      \"isPublic\": false,",
  "      \"responsePath\": \"<optional nested root path>\",",
  "      \"refreshMinutes\": 10,",
  "      \"mappings\": [",
  "        {",
  "          \"label\": \"<field label>\",",
  "          \"path\": \"<nested JSON path like data.quote.price or items[0].close>\",",
  "          \"valueType\": \"string|number|currency|percent|boolean|date|unix-seconds|url|image\",",
  "          \"emoji\": \"<default emoji or empty>\",",
  "          \"positiveEmoji\": \"<optional>\",",
  "          \"negativeEmoji\": \"<optional>\",",
  "          \"zeroEmoji\": \"<optional>\",",
  "          \"conditionMode\": \"AND|OR\",",
  "          \"conditions\": [",
  "            { \"operator\": \">|>=|<|<=|==|!=\", \"value\": 0, \"emoji\": \"<emoji when matched>\" }",
  "          ]",
  "        }",
  "      ]",
  "    }",
  "  ]",
  "}",
  "",
  "Rules:",
  "1. Resolve all field paths from the sample JSON accurately.",
  "2. Use responsePath to reduce repeated prefixes when useful.",
  "3. If a mapping has no conditions, set conditions to an empty array.",
  "4. Never include comments or markdown outside this JSON output.",
  "5. Set isPublic=true only if the data is safe for all visitors.",
  "```",
].join("\n");

type ImportRow = Partial<Omit<IntegrationConfig, "id">>;

function createCondition(): MappingCondition {
  return { operator: ">", value: 0, emoji: "" };
}

function createMapping(): IntegrationMapping {
  return { label: "", path: "", valueType: "string", emoji: "", conditionMode: "AND", conditions: [] };
}

export function IntegrationsTab({ onChanged }: { onChanged: () => Promise<void> }) {
  const toast = useToast();
  const sectionId = useId();
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const guideRef = useRef<HTMLPreElement | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationConfig[]>([]);
  const [copiedGuide, setCopiedGuide] = useState(false);
  const [editingId, setEditingId] = useState<number | "new">("new");
  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState("🧩");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [authScheme, setAuthScheme] = useState("Bearer");
  const [authHeader, setAuthHeader] = useState("Authorization");
  const [authToken, setAuthToken] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [exportWithTokens, setExportWithTokens] = useState(false);
  const [responsePath, setResponsePath] = useState("");
  const [refreshMinutes, setRefreshMinutes] = useState(10);
  const [mappings, setMappings] = useState<IntegrationMapping[]>([createMapping()]);
  const [preview, setPreview] = useState<IntegrationData | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingImportRows, setPendingImportRows] = useState<ImportRow[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [nameFilter, setNameFilter] = useState("");

  async function reload() {
    setIntegrations(await api.integrations());
  }

  /** Reload this tab's list and the home page's live data together. */
  async function refreshAll() {
    await Promise.all([reload(), onChanged()]);
  }

  useEffect(() => {
    reload().catch((error) => toast.error(errorMessage(error, "Could not load integrations")));
  }, []);

  useEffect(() => {
    if (editingId !== "new" && !integrations.some((item) => item.id === editingId)) loadFromIntegration(undefined);
  }, [integrations]);

  const filteredIntegrations = useMemo(() => {
    const needle = nameFilter.trim().toLowerCase();
    if (!needle) return integrations;
    return integrations.filter((integration) => integration.title.toLowerCase().includes(needle));
  }, [integrations, nameFilter]);

  function loadFromIntegration(integration?: IntegrationConfig) {
    setPreview(null);
    if (!integration) {
      setEditingId("new");
      setTitle("");
      setIcon("🧩");
      setEndpointUrl("");
      setAuthScheme("Bearer");
      setAuthHeader("Authorization");
      setAuthToken("");
      setIsPublic(false);
      setResponsePath("");
      setRefreshMinutes(10);
      setMappings([createMapping()]);
      return;
    }
    setEditingId(integration.id);
    setTitle(integration.title);
    setIcon(integration.icon || "🧩");
    setEndpointUrl(integration.endpointUrl);
    setAuthScheme(integration.authScheme || "Bearer");
    setAuthHeader(integration.authHeader || "Authorization");
    setAuthToken(integration.authToken || "");
    setIsPublic(Boolean(integration.isPublic));
    setResponsePath(integration.responsePath || "");
    setRefreshMinutes(integration.refreshMinutes || 10);
    setMappings(
      integration.mappings?.length
        ? integration.mappings.map((mapping) => ({
            ...mapping,
            conditionMode: mapping.conditionMode || "AND",
            conditions: Array.isArray(mapping.conditions) ? mapping.conditions : [],
          }))
        : [createMapping()],
    );
  }

  function openEditor(integration?: IntegrationConfig) {
    loadFromIntegration(integration);
    requestAnimationFrame(() => editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function updateMapping(index: number, key: keyof IntegrationMapping, value: string) {
    setMappings((prev) => prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  }

  function updateCondition(mappingIndex: number, conditionIndex: number, key: keyof MappingCondition, value: string) {
    setMappings((prev) =>
      prev.map((mapping, i) => {
        if (i !== mappingIndex) return mapping;
        const conditions = Array.isArray(mapping.conditions) ? [...mapping.conditions] : [];
        const current = conditions[conditionIndex] || createCondition();
        conditions[conditionIndex] = key === "value" ? { ...current, value: Number(value) } : { ...current, [key]: value };
        return { ...mapping, conditions };
      }),
    );
  }

  function addCondition(mappingIndex: number) {
    setMappings((prev) => prev.map((mapping, i) => (i === mappingIndex ? { ...mapping, conditions: [...(mapping.conditions || []), createCondition()] } : mapping)));
  }

  function deleteCondition(mappingIndex: number, conditionIndex: number) {
    setMappings((prev) =>
      prev.map((mapping, i) => (i === mappingIndex ? { ...mapping, conditions: (mapping.conditions || []).filter((_, idx) => idx !== conditionIndex) } : mapping)),
    );
  }

  function deleteMapping(index: number) {
    setMappings((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  function buildPayload() {
    return {
      title,
      icon,
      endpointUrl,
      authHeader,
      authToken,
      authScheme,
      isPublic,
      responsePath,
      refreshMinutes,
      mappings: mappings
        .filter((mapping) => mapping.label?.trim() && mapping.path?.trim())
        .map((mapping) => ({
          label: mapping.label.trim(),
          path: mapping.path.trim(),
          valueType: mapping.valueType,
          emoji: mapping.emoji || "",
          positiveEmoji: mapping.positiveEmoji || "",
          negativeEmoji: mapping.negativeEmoji || "",
          zeroEmoji: mapping.zeroEmoji || "",
          conditionMode: mapping.conditionMode || "AND",
          conditions: (mapping.conditions || [])
            .filter((condition) => condition.emoji?.trim() && Number.isFinite(condition.value))
            .map((condition) => ({ operator: condition.operator, value: Number(condition.value), emoji: condition.emoji.trim() })),
        })),
    };
  }

  async function saveIntegration(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = buildPayload();
      if (!payload.title.trim() || !payload.endpointUrl.trim()) throw new Error("Title and endpoint URL are required.");
      if (editingId === "new") await api.createIntegration(payload);
      else await api.updateIntegration(editingId, payload);
      await refreshAll();
      if (editingId === "new") loadFromIntegration(undefined);
      toast.success("Integration saved");
    } catch (error) {
      toast.error(errorMessage(error, "Could not save integration"));
    } finally {
      setSaving(false);
    }
  }

  async function runTest() {
    setTesting(true);
    try {
      const payload = buildPayload();
      if (!payload.endpointUrl.trim()) throw new Error("Endpoint URL is required for test.");
      setPreview(await api.testIntegration(payload));
    } catch (error) {
      toast.error(errorMessage(error, "Integration test failed"));
      setPreview(null);
    } finally {
      setTesting(false);
    }
  }

  function exportIntegrations() {
    try {
      const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        integrations: integrations.map((item) => ({
          title: item.title,
          icon: item.icon,
          endpointUrl: item.endpointUrl,
          authHeader: item.authHeader,
          authToken: exportWithTokens ? item.authToken : "",
          authScheme: item.authScheme,
          isPublic: Boolean(item.isPublic),
          responsePath: item.responsePath,
          refreshMinutes: item.refreshMinutes,
          mappings: item.mappings,
        })),
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `home-hub-integrations-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Could not export integrations.");
    }
  }

  async function copyAiGuide() {
    try {
      await copyText(AI_IMPORT_GUIDE);
      setCopiedGuide(true);
      window.setTimeout(() => setCopiedGuide(false), 2000);
    } catch {
      // Last resort: highlight the block so Ctrl/Cmd+C works.
      if (guideRef.current) selectElementText(guideRef.current);
      toast.info("Couldn't copy automatically. The text is selected, so press Ctrl+C (⌘C on Mac).");
    }
  }

  async function importIntegrations(file: File) {
    try {
      const parsed = JSON.parse(await file.text()) as { integrations?: unknown };
      if (!parsed || !Array.isArray(parsed.integrations)) throw new Error("Invalid import file format.");
      const rows = parsed.integrations as ImportRow[];
      if (!rows.length) throw new Error("Import file has no integrations.");
      setPendingImportRows(rows);
    } catch (error) {
      toast.error(errorMessage(error, "Could not import integrations."));
    }
  }

  async function commitImport(mode: "append" | "replace") {
    if (!pendingImportRows || importing) return;
    setImporting(true);
    try {
      // One request: the server validates every row, then deletes (for
      // "replace") and inserts inside a single transaction, so a failure
      // can never leave you with your old integrations deleted.
      const result = await api.importIntegrations({ mode, integrations: pendingImportRows });
      setPendingImportRows(null);
      await refreshAll();
      const noun = result.imported === 1 ? "integration" : "integrations";
      toast.success(`${mode === "replace" ? "Replaced with" : "Imported"} ${result.imported} ${noun}`);
      if (result.skipped) {
        toast.info(`Skipped ${result.skipped} invalid ${result.skipped === 1 ? "entry" : "entries"}: ${result.problems.join("; ")}`);
      }
    } catch (error) {
      toast.error(errorMessage(error, "Could not complete import."));
    } finally {
      setImporting(false);
    }
  }

  const isNew = editingId === "new";

  return (
    <div className="admin-stack">
      <Panel
        icon={<Plug size={18} />}
        title="Your integrations"
        description="Pull JSON from any API and show selected fields as a Live data card."
        actions={
          <>
            <input
              ref={importFileRef}
              type="file"
              accept="application/json"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.currentTarget.value = "";
                if (file) void importIntegrations(file);
              }}
            />
            <Button variant="outline" size="sm" onClick={() => importFileRef.current?.click()}><Upload size={14} /> Import</Button>
            <Button variant="outline" size="sm" onClick={exportIntegrations} disabled={!integrations.length}><Download size={14} /> Export</Button>
            <Button size="sm" onClick={() => openEditor(undefined)}><Plus size={14} /> New</Button>
          </>
        }
      >
        <div className="table-toolbar">
          <div className="search-box">
            <Search size={16} aria-hidden="true" />
            <Input type="search" aria-label="Filter integrations by name" placeholder="Filter by name…" value={nameFilter} onChange={(e) => setNameFilter(e.target.value)} />
          </div>
          <label className="checkbox-inline">
            <input type="checkbox" checked={exportWithTokens} onChange={(e) => setExportWithTokens(e.target.checked)} /> Include tokens in export
          </label>
        </div>
        <div className="table-wrap table-scroll">
          <table className="data-table">
            <thead>
              <tr><th>Name</th><th>Visibility</th><th className="hide-sm">Endpoint</th><th aria-label="Actions" /></tr>
            </thead>
            <tbody>
              {filteredIntegrations.map((integration) => (
                <tr key={integration.id} data-active={editingId === integration.id}>
                  <td><strong><span aria-hidden="true">{integration.icon}</span> {integration.title}</strong></td>
                  <td><Badge tone={integration.isPublic ? "success" : "neutral"}>{integration.isPublic ? "Public" : "Signed-in only"}</Badge></td>
                  <td className="hide-sm endpoint-cell">{integration.endpointUrl}</td>
                  <td>
                    <div className="row-actions">
                      <Button variant="ghost" size="icon-sm" aria-label={`Edit ${integration.title}`} onClick={() => openEditor(integration)}><Pencil size={15} /></Button>
                      <ConfirmDialog
                        title={`Delete ${integration.title}?`}
                        description="Its Live data card will disappear from the home page."
                        onConfirm={async () => {
                          await api.deleteIntegration(integration.id);
                          await refreshAll();
                          toast.success("Integration deleted");
                        }}
                      >
                        <Button variant="ghost" size="icon-sm" aria-label={`Delete ${integration.title}`}><Trash2 size={15} /></Button>
                      </ConfirmDialog>
                    </div>
                  </td>
                </tr>
              ))}
              {!filteredIntegrations.length && (
                <tr>
                  <td colSpan={4} className="table-empty">
                    {integrations.length ? "No integrations match that name." : "No integrations yet. Create one below or import a JSON file."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <details className="disclosure">
          <summary><Bot size={16} /> AI assistant prompt for generating import JSON</summary>
          <div className="disclosure-body">
            <p>Copy this block and paste it into your AI assistant along with a sample response from your endpoint. Then import the JSON it returns.</p>
            <div className="code-block">
              <Button type="button" size="sm" variant={copiedGuide ? "secondary" : "outline"} className="code-copy" onClick={copyAiGuide}>
                {copiedGuide ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
              </Button>
              <pre ref={guideRef}><code>{AI_IMPORT_GUIDE}</code></pre>
            </div>
          </div>
        </details>
      </Panel>

      <div ref={editorRef} className="scroll-anchor">
        <Panel
          title={isNew ? "Create integration" : `Edit ${title || "integration"}`}
          description={isNew ? "Fill in the endpoint, map the fields you want, then test it." : "Changes apply after you save."}
          actions={!isNew && <Button variant="outline" size="sm" onClick={() => loadFromIntegration(undefined)}><Plus size={14} /> New instead</Button>}
        >
          <form className="form" onSubmit={saveIntegration}>
            <div className="form-section" role="group" aria-labelledby={`${sectionId}-endpoint`}>
              <h4 className="form-section-title" id={`${sectionId}-endpoint`}>Endpoint</h4>
              <div className="form-grid form-grid-icon">
                <Field label="Icon"><Input value={icon} onChange={(e) => setIcon(e.target.value)} className="text-center text-lg" /></Field>
                <Field label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Weather" /></Field>
              </div>
              <Field label="Endpoint URL"><Input type="url" value={endpointUrl} onChange={(e) => setEndpointUrl(e.target.value)} required placeholder="https://api.example.com/v1/current" /></Field>
              <div className="form-grid">
                <Field label="Response root path" hint="Optional. Prefix shared by all fields."><Input value={responsePath} onChange={(e) => setResponsePath(e.target.value)} placeholder="data.quote" /></Field>
                <Field label="Refresh every (minutes)"><Input type="number" min={1} value={refreshMinutes} onChange={(e) => setRefreshMinutes(Number(e.target.value || 1))} /></Field>
              </div>
              <label className="checkbox-inline">
                <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} /> Public: show this card to every visitor (otherwise only signed-in users see it)
              </label>
            </div>

            <div className="form-section" role="group" aria-labelledby={`${sectionId}-auth`}>
              <h4 className="form-section-title" id={`${sectionId}-auth`}>Authentication</h4>
              <div className="form-grid form-grid-3">
                <Field label="Scheme">
                  <Select value={authScheme} onChange={(e) => setAuthScheme(e.target.value)}>
                    <option value="None">None</option><option value="Bearer">Bearer</option><option value="Token">Token</option>
                  </Select>
                </Field>
                <Field label="Header"><Input value={authHeader} onChange={(e) => setAuthHeader(e.target.value)} /></Field>
                <Field label="Token (optional)"><Input type="password" autoComplete="off" value={authToken} onChange={(e) => setAuthToken(e.target.value)} /></Field>
              </div>
            </div>

            <div className="form-section" role="group" aria-labelledby={`${sectionId}-mapper`}>
              <h4 className="form-section-title" id={`${sectionId}-mapper`}>Field mapper</h4>
              {mappings.map((mapping, mappingIndex) => (
                <div key={mappingIndex} className="mapping-card">
                  <div className="mapping-card-header">
                    <strong>Field {mappingIndex + 1}</strong>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove field ${mappingIndex + 1}`} disabled={mappings.length === 1} onClick={() => deleteMapping(mappingIndex)}><Trash2 size={14} /></Button>
                  </div>
                  <div className="form-grid mapping-main">
                    <Field label="Label"><Input placeholder="Temperature" value={mapping.label} onChange={(e) => updateMapping(mappingIndex, "label", e.target.value)} /></Field>
                    <Field label="JSON path"><Input placeholder="current.temp_c or prices[0].close" value={mapping.path} onChange={(e) => updateMapping(mappingIndex, "path", e.target.value)} /></Field>
                    <Field label="Type">
                      <Select value={mapping.valueType} onChange={(e) => updateMapping(mappingIndex, "valueType", e.target.value)}>
                        {VALUE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                      </Select>
                    </Field>
                  </div>
                  <div className="form-grid form-grid-4">
                    <Field label="Default emoji"><Input value={mapping.emoji || ""} onChange={(e) => updateMapping(mappingIndex, "emoji", e.target.value)} /></Field>
                    <Field label="If positive"><Input value={mapping.positiveEmoji || ""} onChange={(e) => updateMapping(mappingIndex, "positiveEmoji", e.target.value)} /></Field>
                    <Field label="If negative"><Input value={mapping.negativeEmoji || ""} onChange={(e) => updateMapping(mappingIndex, "negativeEmoji", e.target.value)} /></Field>
                    <Field label="If zero"><Input value={mapping.zeroEmoji || ""} onChange={(e) => updateMapping(mappingIndex, "zeroEmoji", e.target.value)} /></Field>
                  </div>
                  <div className="condition-block">
                    <div className="condition-header">
                      <span>Advanced conditions</span>
                      <div className="condition-actions">
                        {(mapping.conditions?.length ?? 0) > 1 && (
                          <Select aria-label="Condition mode" className="h-8 w-auto" value={mapping.conditionMode || "AND"} onChange={(e) => updateMapping(mappingIndex, "conditionMode", e.target.value)}>
                            <option value="AND">Match all (AND)</option>
                            <option value="OR">Match any (OR)</option>
                          </Select>
                        )}
                        <Button type="button" variant="ghost" size="sm" onClick={() => addCondition(mappingIndex)}><Plus size={13} /> Condition</Button>
                      </div>
                    </div>
                    {(mapping.conditions || []).map((condition, conditionIndex) => (
                      <div className="condition-row" key={`${mappingIndex}-${conditionIndex}`}>
                        <Select aria-label="Operator" value={condition.operator} onChange={(e) => updateCondition(mappingIndex, conditionIndex, "operator", e.target.value as MappingOperator)}>
                          {OPERATORS.map((operator) => <option key={operator} value={operator}>{operator}</option>)}
                        </Select>
                        <Input aria-label="Value" type="number" value={condition.value} onChange={(e) => updateCondition(mappingIndex, conditionIndex, "value", e.target.value)} />
                        <Input aria-label="Emoji when true" placeholder="Emoji when true" value={condition.emoji} onChange={(e) => updateCondition(mappingIndex, conditionIndex, "emoji", e.target.value)} />
                        <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove condition" onClick={() => deleteCondition(mappingIndex, conditionIndex)}><Trash2 size={14} /></Button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <Button type="button" variant="outline" className="w-full border-dashed" onClick={() => setMappings((prev) => [...prev, createMapping()])}><Plus size={14} /> Add field</Button>
            </div>

            {preview && (
              <div className="preview-box" aria-live="polite">
                <div className="preview-box-header"><FlaskConical size={15} /> Test result: <span aria-hidden="true">{preview.icon}</span> {preview.title}</div>
                <IntegrationFields data={preview} />
              </div>
            )}

            <div className="form-actions form-actions-sticky">
              <Button type="button" variant="outline" onClick={runTest} disabled={testing}><FlaskConical size={15} /> {testing ? "Testing…" : "Test"}</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving…" : isNew ? "Create integration" : "Save changes"}</Button>
            </div>
          </form>
        </Panel>
      </div>

      <Dialog.Root open={pendingImportRows !== null} onOpenChange={(open) => !open && !importing && setPendingImportRows(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content dialog-sm">
            <Dialog.Title className="dialog-title">Import integrations</Dialog.Title>
            <Dialog.Description className="dialog-description">
              Found {pendingImportRows?.length || 0} integration{pendingImportRows?.length === 1 ? "" : "s"} in the file. Add them to your current list, or replace everything?
            </Dialog.Description>
            <div className="dialog-actions dialog-actions-split">
              <Dialog.Close asChild><Button variant="ghost" disabled={importing}>Cancel</Button></Dialog.Close>
              <div className="flex gap-2">
                <Button variant="destructive" disabled={importing} onClick={() => void commitImport("replace")}>Replace all</Button>
                <Button disabled={importing} onClick={() => void commitImport("append")}>{importing ? "Importing…" : "Add to list"}</Button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
