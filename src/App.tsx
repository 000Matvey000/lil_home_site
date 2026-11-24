import { useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ArrowLeft, Bell, ExternalLink, FileDown, LogIn, LogOut, Moon, Pencil, Plus, Search, Settings, Sun, Trash2, UserPlus, Users, X } from "lucide-react";
import { api } from "./api";
import type { Announcement, IntegrationConfig, IntegrationData, IntegrationMapping, LinkRecord, MappingCondition, MappingOperator, SiteSettings, User } from "./types";
import { Button } from "./components/ui/button";
import { Card } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Badge } from "./components/ui/badge";

type FileValue = { name: string; base64: string };
type AppPage = "home" | "integration-setup";
type HomeSectionKey = "showHero" | "showIntegrations" | "showAnnouncements" | "showLinks";

const defaultSettings: SiteSettings = {
  siteName: "Home Hub",
  headerSubtitle: "Quick links & updates",
  heroBadge: "Home communications",
  heroTitle: "Everything close to home.",
  heroDescription: "Find useful links and catch the latest announcements.",
  announcementsTitle: "Announcements",
  linksTitle: "Useful links",
  footerText: "Home Hub keeps your household informed.",
  logoUrl: "",
  faviconUrl: "",
  showHero: true,
  showIntegrations: true,
  showAnnouncements: true,
  showLinks: true,
};

function readFile(file: File): Promise<FileValue> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, base64: String(reader.result) });
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

function parseCategoryText(raw: string) {
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function categoryFilterMatch(raw: string, selected: string) {
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

function toFriendlyErrorMessage(raw: string) {
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
  if (normalized.includes("timeout")) {
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

function renderIntegrationField(field: NonNullable<IntegrationData["fields"]>[number]) {
  if (!field) return null;
  const prefix = field.emoji ? `${field.emoji} ` : "";
  if (field.valueType === "url") {
    const href = String(field.rawValue || field.displayValue || "");
    return href ? (
      <a className="open-link" href={href} target="_blank" rel="noreferrer">
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

function updateFavicon(url: string) {
  let node = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
  if (!node) {
    node = document.createElement("link");
    node.rel = "icon";
    document.head.appendChild(node);
  }
  node.href = url || "/favicon.ico";
}

function LinkDialog({ item, onSaved, setError, icon = false }: { item?: LinkRecord; onSaved: () => Promise<void>; setError: (value: string) => void; icon?: boolean; }) {
  const [open, setOpen] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const thumbnailFile = (form.get("thumbnail") as File);
    const attachmentFile = (form.get("attachment") as File);
    const value: Record<string, unknown> = {
      title: form.get("title"),
      url: form.get("url"),
      description: form.get("description"),
      department: form.get("department"),
      category: form.get("category"),
      color: form.get("color"),
    };
    if (thumbnailFile?.size) value.thumbnail = await readFile(thumbnailFile);
    if (attachmentFile?.size) value.attachment = await readFile(attachmentFile);
    try {
      if (item) await api.updateLink(item.id, value);
      else await api.createLink(value);
      await onSaved();
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save link");
    }
  }
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild><Button variant={icon ? "ghost" : "default"} size={icon ? "icon" : "default"} aria-label={item ? "Edit link" : "Add link"}>
        {icon ? <Pencil size={15} /> : <><Plus size={16} /> Add link</>}
      </Button></Dialog.Trigger>
      <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content">
        <Dialog.Title>{item ? "Edit link" : "Add a link"}</Dialog.Title>
        <Dialog.Description>Add destination, categories, and optional files.</Dialog.Description>
        <form className="form" onSubmit={submit}>
          <label>Title<Input name="title" defaultValue={item?.title} required /></label>
          <label>URL<Input name="url" type="url" defaultValue={item?.url} placeholder="https://" /></label>
          <label>Description<textarea name="description" defaultValue={item?.description} /></label>
          <div className="form-row"><label>Department<Input name="department" defaultValue={item?.department || "General"} /></label><label>Accent<input name="color" type="color" defaultValue={item?.color || "#4f46e5"} /></label></div>
          <label>Categories (comma-separated)<Input name="category" defaultValue={item?.category || ""} placeholder="News, Finance, Video" /></label>
          <label>Thumbnail image<input name="thumbnail" type="file" accept="image/*" /></label>
          <label>Attachment<input name="attachment" type="file" /></label>
          <div className="dialog-actions"><Dialog.Close asChild><Button type="button" variant="outline">Cancel</Button></Dialog.Close><Button type="submit">{item ? "Save changes" : "Add link"}</Button></div>
        </form>
      </Dialog.Content></Dialog.Portal>
    </Dialog.Root>
  );
}

function AnnouncementDialog({ item, onSaved, setError, icon = false }: { item?: Announcement; onSaved: () => Promise<void>; setError: (value: string) => void; icon?: boolean; }) {
  const [open, setOpen] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const value = { title: form.get("title"), body: form.get("body"), color: form.get("color"), category: form.get("category") };
    try {
      if (item) await api.updateAnnouncement(item.id, value);
      else await api.createAnnouncement(value);
      await onSaved();
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save announcement");
    }
  }
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild><Button variant={icon ? "ghost" : "outline"} size={icon ? "icon" : "default"} aria-label={item ? "Edit announcement" : "Add announcement"}>
        {icon ? <Pencil size={15} /> : <><Plus size={16} /> Announcement</>}
      </Button></Dialog.Trigger>
      <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content">
        <Dialog.Title>{item ? "Edit announcement" : "New announcement"}</Dialog.Title>
        <form className="form" onSubmit={submit}>
          <label>Title<Input name="title" defaultValue={item?.title} required /></label>
          <label>Categories (comma-separated)<Input name="category" defaultValue={item?.category || ""} placeholder="General, Alerts" /></label>
          <label>Message<textarea name="body" defaultValue={item?.body} /></label>
          <label>Accent<input name="color" type="color" defaultValue={item?.color || "#4f46e5"} /></label>
          <div className="dialog-actions"><Dialog.Close asChild><Button type="button" variant="outline">Cancel</Button></Dialog.Close><Button type="submit">Save</Button></div>
        </form>
      </Dialog.Content></Dialog.Portal>
    </Dialog.Root>
  );
}

function createCondition(): MappingCondition {
  return { operator: ">", value: 0, emoji: "" };
}

function createMapping(): IntegrationMapping {
  return { label: "", path: "", valueType: "string", emoji: "", conditionMode: "AND", conditions: [] };
}

function IntegrationSetupPage({ integrations, onRefresh, setError }: {
  integrations: IntegrationConfig[];
  onRefresh: () => Promise<void>;
  setError: (value: string) => void;
}) {
  const importFileRef = useRef<HTMLInputElement | null>(null);
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
  const [toast, setToast] = useState("");
  const [pendingImportRows, setPendingImportRows] = useState<Array<Partial<Omit<IntegrationConfig, "id">>> | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [nameFilter, setNameFilter] = useState("");
  const aiImportGuideMarkdown = [
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

  function loadFromIntegration(integration?: IntegrationConfig) {
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
      setPreview(null);
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
    setPreview(null);
  }

  useEffect(() => {
    const current = editingId === "new" ? undefined : integrations.find((item) => item.id === editingId);
    if (!current && editingId !== "new") loadFromIntegration(undefined);
  }, [integrations]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const filteredIntegrations = useMemo(() => {
    const needle = nameFilter.trim().toLowerCase();
    if (!needle) return integrations;
    return integrations.filter((integration) => integration.title.toLowerCase().includes(needle));
  }, [integrations, nameFilter]);

  function updateMapping(index: number, key: keyof IntegrationMapping, value: string) {
    setMappings((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
    );
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
    setMappings((prev) =>
      prev.map((mapping, i) => (i === mappingIndex ? { ...mapping, conditions: [...(mapping.conditions || []), createCondition()] } : mapping)),
    );
  }

  function deleteCondition(mappingIndex: number, conditionIndex: number) {
    setMappings((prev) =>
      prev.map((mapping, i) => {
        if (i !== mappingIndex) return mapping;
        return { ...mapping, conditions: (mapping.conditions || []).filter((_, idx) => idx !== conditionIndex) };
      }),
    );
  }

  function addMapping() {
    setMappings((prev) => [...prev, createMapping()]);
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
      await onRefresh();
      if (editingId === "new") loadFromIntegration(undefined);
      setToast("Integration saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save integration");
    } finally {
      setSaving(false);
    }
  }

  async function runTest() {
    setTesting(true);
    try {
      const payload = buildPayload();
      if (!payload.endpointUrl.trim()) throw new Error("Endpoint URL is required for test.");
      const result = await api.testIntegration(payload);
      setPreview(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Integration test failed");
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
      setError("Could not export integrations.");
    }
  }

  async function copyAiGuide() {
    try {
      await navigator.clipboard.writeText(aiImportGuideMarkdown);
      setCopiedGuide(true);
      window.setTimeout(() => setCopiedGuide(false), 2000);
    } catch {
      setError("Could not copy AI guide to clipboard.");
    }
  }

  async function importIntegrations(file: File) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as { integrations?: unknown };
      if (!parsed || !Array.isArray(parsed.integrations)) {
        throw new Error("Invalid import file format.");
      }
      const rows = parsed.integrations as Array<Partial<Omit<IntegrationConfig, "id">>>;
      if (!rows.length) throw new Error("Import file has no integrations.");
      setPendingImportRows(rows);
      setImportDialogOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not import integrations.");
    }
  }

  async function commitImport(mode: "append" | "replace") {
    if (!pendingImportRows) return;
    try {
      if (mode === "replace") {
        await Promise.all(integrations.map((item) => api.deleteIntegration(item.id)));
      }
      for (const row of pendingImportRows) {
        if (!row.title?.trim() || !row.endpointUrl?.trim()) continue;
        await api.createIntegration({
          title: row.title,
          icon: row.icon || "🧩",
          endpointUrl: row.endpointUrl,
          authHeader: row.authHeader || "Authorization",
          authToken: row.authToken || "",
          authScheme: row.authScheme || "Bearer",
          isPublic: Boolean(row.isPublic),
          responsePath: row.responsePath || "",
          refreshMinutes: row.refreshMinutes || 10,
          mappings: Array.isArray(row.mappings) ? row.mappings : [],
        });
      }
      setImportDialogOpen(false);
      setPendingImportRows(null);
      await onRefresh();
      setToast(mode === "replace" ? "Integrations replaced" : "Integrations imported");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not complete import.");
    }
  }

  return (
    <section className="integration-setup-page">
      <div className="integration-setup-header">
        <h2>Integration Setup</h2>
        <p>Configure and test API integrations with nested JSON mapping, typed display values, and condition-based emoji rules.</p>
        <div className="integration-transfer-actions">
          <input
            ref={importFileRef}
            type="file"
            accept="application/json"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importIntegrations(file);
              e.currentTarget.value = "";
            }}
          />
          <Button variant="outline" onClick={() => importFileRef.current?.click()}>Import JSON</Button>
          <Button variant="outline" onClick={exportIntegrations}>Export JSON</Button>
          <label className="checkbox-inline"><input type="checkbox" checked={exportWithTokens} onChange={(e) => setExportWithTokens(e.target.checked)} /> Include tokens</label>
        </div>
        <details className="ai-guide-details">
          <summary>AI assistant prompt for generating import JSON</summary>
          <p>Copy this markdown block, then paste it to your AI assistant along with a sample endpoint response.</p>
          <div className="ai-guide-actions">
            <Button type="button" variant="outline" onClick={copyAiGuide}>{copiedGuide ? "Copied" : "Copy markdown block"}</Button>
          </div>
          <pre className="ai-guide-block"><code>{aiImportGuideMarkdown}</code></pre>
        </details>
      </div>
      <div className="integration-list-toolbar">
        <Input
          aria-label="Filter integrations by name"
          placeholder="Filter by name..."
          value={nameFilter}
          onChange={(e) => setNameFilter(e.target.value)}
        />
      </div>
      <div className="integration-table-wrap">
        <table className="integration-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Visibility</th>
              <th>Endpoint</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredIntegrations.map((integration) => (
              <tr key={integration.id} className={editingId === integration.id ? "active" : ""}>
                <td>{integration.icon} {integration.title}</td>
                <td>{integration.isPublic ? "Public" : "Private"}</td>
                <td className="endpoint-cell">{integration.endpointUrl}</td>
                <td>
                  <div className="integration-actions">
                    <Button variant="outline" size="sm" onClick={() => loadFromIntegration(integration)}>Edit</Button>
                    <Button variant="ghost" size="icon" onClick={() => api.deleteIntegration(integration.id).then(async () => { await onRefresh(); loadFromIntegration(undefined); }).catch((e) => setError(e.message))}><Trash2 size={14} /></Button>
                  </div>
                </td>
              </tr>
            ))}
            {!filteredIntegrations.length && (
              <tr>
                <td colSpan={4} className="integration-empty-row">
                  {integrations.length ? "No integrations match that name filter." : "No integrations yet. Create one below."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Card className="integration-editor-card">
        <div className="integration-editor-header">
          <h3>{editingId === "new" ? "Create Integration" : "Edit Integration"}</h3>
          <Button variant="outline" onClick={() => loadFromIntegration(undefined)}><Plus size={14} /> New integration</Button>
        </div>
        <form className="integration-editor-form" onSubmit={saveIntegration}>
          <div className="integration-form-row">
            <label>Title<Input value={title} onChange={(e) => setTitle(e.target.value)} required /></label>
            <label>Icon emoji<Input value={icon} onChange={(e) => setIcon(e.target.value)} /></label>
          </div>
          <label>Endpoint URL<Input type="url" value={endpointUrl} onChange={(e) => setEndpointUrl(e.target.value)} required /></label>
          <div className="integration-form-row">
            <label>Auth scheme<select value={authScheme} onChange={(e) => setAuthScheme(e.target.value)}><option value="None">None</option><option value="Bearer">Bearer</option><option value="Token">Token</option></select></label>
            <label>Auth header<Input value={authHeader} onChange={(e) => setAuthHeader(e.target.value)} /></label>
          </div>
          <label>Auth token (optional)<Input value={authToken} onChange={(e) => setAuthToken(e.target.value)} /></label>
          <label className="checkbox-inline"><input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} /> Public integration (visible to all visitors)</label>
          <div className="integration-form-row">
            <label>Response root path<Input value={responsePath} onChange={(e) => setResponsePath(e.target.value)} placeholder="data.quote" /></label>
            <label>Refresh minutes<Input type="number" min={1} value={refreshMinutes} onChange={(e) => setRefreshMinutes(Number(e.target.value || 1))} /></label>
          </div>

          <div className="mapper-block mapper-block-wide">
            <div className="mapper-title-row"><h4>Field mapper</h4><Button type="button" variant="outline" onClick={addMapping}><Plus size={14} /> Add field</Button></div>
            {mappings.map((mapping, mappingIndex) => (
              <div key={mappingIndex} className="mapping-panel">
                <div className="mapping-row-full">
                  <Input placeholder="Label (e.g. Temperature)" value={mapping.label} onChange={(e) => updateMapping(mappingIndex, "label", e.target.value)} />
                  <Input placeholder="JSON path (e.g. current.temp_c or prices[0].close)" value={mapping.path} onChange={(e) => updateMapping(mappingIndex, "path", e.target.value)} />
                  <select value={mapping.valueType} onChange={(e) => updateMapping(mappingIndex, "valueType", e.target.value)}>
                    <option value="string">string</option><option value="number">number</option><option value="currency">currency</option><option value="percent">percent</option><option value="boolean">boolean</option><option value="date">date</option><option value="unix-seconds">unix-seconds</option><option value="url">url</option><option value="image">image</option>
                  </select>
                  <Button type="button" variant="ghost" size="icon" onClick={() => deleteMapping(mappingIndex)}><Trash2 size={14} /></Button>
                </div>
                <div className="mapping-row-full">
                  <Input placeholder="Default emoji (optional)" value={mapping.emoji || ""} onChange={(e) => updateMapping(mappingIndex, "emoji", e.target.value)} />
                  <Input placeholder="Positive emoji (numeric)" value={mapping.positiveEmoji || ""} onChange={(e) => updateMapping(mappingIndex, "positiveEmoji", e.target.value)} />
                  <Input placeholder="Negative emoji (numeric)" value={mapping.negativeEmoji || ""} onChange={(e) => updateMapping(mappingIndex, "negativeEmoji", e.target.value)} />
                  <Input placeholder="Zero emoji (numeric)" value={mapping.zeroEmoji || ""} onChange={(e) => updateMapping(mappingIndex, "zeroEmoji", e.target.value)} />
                </div>
                <div className="condition-block">
                  <div className="condition-header">
                    <strong>Advanced conditions</strong>
                    <div className="condition-actions">
                      <select value={mapping.conditionMode || "AND"} onChange={(e) => updateMapping(mappingIndex, "conditionMode", e.target.value)}>
                        <option value="AND">AND</option>
                        <option value="OR">OR</option>
                      </select>
                      <Button type="button" variant="outline" onClick={() => addCondition(mappingIndex)}><Plus size={13} /> Add condition</Button>
                    </div>
                  </div>
                  {(mapping.conditions || []).map((condition, conditionIndex) => (
                    <div className="condition-row" key={`${mappingIndex}-${conditionIndex}`}>
                      <select value={condition.operator} onChange={(e) => updateCondition(mappingIndex, conditionIndex, "operator", e.target.value as MappingOperator)}>
                        <option value=">">{">"}</option><option value=">=">{">="}</option><option value="<">{"<"}</option><option value="<=">{"<="}</option><option value="==">{"=="}</option><option value="!=">{"!="}</option>
                      </select>
                      <Input type="number" value={condition.value} onChange={(e) => updateCondition(mappingIndex, conditionIndex, "value", e.target.value)} />
                      <Input placeholder="Emoji when true" value={condition.emoji} onChange={(e) => updateCondition(mappingIndex, conditionIndex, "emoji", e.target.value)} />
                      <Button type="button" variant="ghost" size="icon" onClick={() => deleteCondition(mappingIndex, conditionIndex)}><Trash2 size={14} /></Button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="integration-editor-actions">
            <Button type="button" variant="outline" onClick={runTest} disabled={testing}>{testing ? "Testing..." : "Test integration"}</Button>
            <Button type="submit" className={saving ? "saving-button" : ""}>{saving ? "Saving..." : "Save integration"}</Button>
          </div>
        </form>
      </Card>

      {preview && (
        <Card className="integration-preview-card">
          <h3>Preview: {preview.icon} {preview.title}</h3>
          {preview.error ? <p className="integration-error">{preview.error}</p> : (
            <div className="integration-values">
              {preview.fields?.map((field, index) => (
                <div className="integration-value" key={`preview-${index}`}>
                  <span>{field.label}</span>
                  {renderIntegrationField(field)}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <Dialog.Root open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content">
            <Dialog.Title>Import integrations</Dialog.Title>
            <Dialog.Description>
              Loaded {pendingImportRows?.length || 0} integration definitions.
            </Dialog.Description>
            <div className="form">
              <p>Choose a safe import mode:</p>
              <div className="dialog-actions import-actions">
                <Button type="button" variant="outline" onClick={() => { setImportDialogOpen(false); setPendingImportRows(null); }}>Cancel</Button>
                <Button type="button" variant="outline" onClick={() => void commitImport("append")}>Append</Button>
                <Button type="button" variant="destructive" onClick={() => void commitImport("replace")}>Replace existing</Button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {toast && <div className="toast-popup">{toast}</div>}
    </section>
  );
}

function AdminDialog({ open, onOpenChange, settings, onSaved, setError }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: SiteSettings;
  onSaved: () => Promise<void>;
  setError: (value: string) => void;
}) {
  const [users, setUsers] = useState<User[]>([]);
  useEffect(() => {
    if (open) api.users().then(setUsers).catch((e) => setError(e.message));
  }, [open]);
  async function saveSettings(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      const logoFile = form.get("logo") as File;
      const faviconFile = form.get("favicon") as File;
      if (logoFile?.size) await api.uploadAsset("logo", await readFile(logoFile));
      if (faviconFile?.size) await api.uploadAsset("favicon", await readFile(faviconFile));
      await api.updateSettings({
        siteName: form.get("siteName"),
        headerSubtitle: form.get("headerSubtitle"),
        heroBadge: form.get("heroBadge"),
        heroTitle: form.get("heroTitle"),
        heroDescription: form.get("heroDescription"),
        announcementsTitle: form.get("announcementsTitle"),
        linksTitle: form.get("linksTitle"),
        footerText: form.get("footerText"),
      });
      await onSaved();
    } catch (e: any) {
      setError(e.message);
    }
  }
  async function createUser(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      await api.createUser({ username: form.get("username"), password: form.get("password"), role: form.get("role") });
      setUsers(await api.users());
      e.currentTarget.reset();
    } catch (e: any) {
      setError(e.message);
    }
  }
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content admin-dialog">
        <Dialog.Title>Manage Home Hub</Dialog.Title>
        <div className="admin-section">
          <h3><Settings size={16} /> Site text & branding</h3>
          <form className="form" onSubmit={saveSettings}>
            <label>Site name<Input name="siteName" defaultValue={settings.siteName} /></label>
            <label>Header subtitle<Input name="headerSubtitle" defaultValue={settings.headerSubtitle} /></label>
            <label>Hero badge<Input name="heroBadge" defaultValue={settings.heroBadge} /></label>
            <label>Hero title<Input name="heroTitle" defaultValue={settings.heroTitle} /></label>
            <label>Hero description<textarea name="heroDescription" defaultValue={settings.heroDescription} /></label>
            <div className="form-row"><label>Announcements title<Input name="announcementsTitle" defaultValue={settings.announcementsTitle} /></label><label>Links title<Input name="linksTitle" defaultValue={settings.linksTitle} /></label></div>
            <label>Footer text<Input name="footerText" defaultValue={settings.footerText} /></label>
            <label>Site logo<input name="logo" type="file" accept="image/*" /></label>
            <label>Tab icon (favicon)<input name="favicon" type="file" accept="image/x-icon,image/png,image/svg+xml" /></label>
            <Button type="submit">Save settings</Button>
          </form>
        </div>
        <div className="admin-section">
          <h3><Users size={16} /> Users</h3>
          <div className="user-list">
            {users.map((item) => <div className="user-row" key={item.id}><div><strong>{item.username}</strong><Badge>{item.role}</Badge></div><Button variant="ghost" size="icon" aria-label={`Delete ${item.username}`} onClick={() => api.deleteUser(item.id).then(async () => setUsers(await api.users())).catch((e) => setError(e.message))}><Trash2 size={15} /></Button></div>)}
          </div>
          <form className="form-inline user-form" onSubmit={createUser}>
            <Input name="username" placeholder="Username" required />
            <Input name="password" type="password" placeholder="Password" required />
            <select name="role" aria-label="Role"><option value="user">User</option><option value="admin">Admin</option></select>
            <Button><UserPlus size={15} /> Add</Button>
          </form>
        </div>
      </Dialog.Content></Dialog.Portal>
    </Dialog.Root>
  );
}

export function App() {
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "light");
  const [page, setPage] = useState<AppPage>("home");
  const [user, setUser] = useState<User | null>(null);
  const [links, setLinks] = useState<LinkRecord[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [settings, setSettings] = useState<SiteSettings>(defaultSettings);
  const [integrations, setIntegrations] = useState<IntegrationConfig[]>([]);
  const [integrationData, setIntegrationData] = useState<IntegrationData[]>([]);
  const [activeIntegrationIndex, setActiveIntegrationIndex] = useState(0);
  const [search, setSearch] = useState("");
  const [linkCategoryFilter, setLinkCategoryFilter] = useState("all");
  const [announcementCategoryFilter, setAnnouncementCategoryFilter] = useState("all");
  const [loginOpen, setLoginOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [error, setErrorState] = useState("");
  const [errorToast, setErrorToast] = useState("");

  function setError(value: string) {
    if (!value) {
      setErrorState("");
      return;
    }
    const friendly = toFriendlyErrorMessage(value);
    setErrorState(friendly);
    setErrorToast(friendly);
  }

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!errorToast) return;
    const timer = window.setTimeout(() => setErrorToast(""), 4200);
    return () => window.clearTimeout(timer);
  }, [errorToast]);

  useEffect(() => {
    function handleWindowError(event: ErrorEvent) {
      if (!event.message) return;
      setError(event.message);
    }
    function handleUnhandledRejection(event: PromiseRejectionEvent) {
      const reason = event.reason;
      const message = reason instanceof Error ? reason.message : String(reason || "Unexpected error");
      setError(message);
    }
    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => {
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  async function refresh() {
    const [linkRows, announcementRows, siteSettings, integrationRows, integrationValues] = await Promise.all([
      api.links(),
      api.announcements(),
      api.settings(),
      user?.role === "admin" ? api.integrations() : Promise.resolve([]),
      api.integrationData(),
    ]);
    setLinks(linkRows);
    setAnnouncements(announcementRows);
    setSettings({
      ...defaultSettings,
      ...siteSettings,
      showHero: readSettingBoolean((siteSettings as Partial<SiteSettings>).showHero, defaultSettings.showHero),
      showIntegrations: readSettingBoolean((siteSettings as Partial<SiteSettings>).showIntegrations, defaultSettings.showIntegrations),
      showAnnouncements: readSettingBoolean((siteSettings as Partial<SiteSettings>).showAnnouncements, defaultSettings.showAnnouncements),
      showLinks: readSettingBoolean((siteSettings as Partial<SiteSettings>).showLinks, defaultSettings.showLinks),
    });
    setIntegrations(integrationRows);
    setIntegrationData(integrationValues);
  }

  useEffect(() => {
    refresh().catch((e) => setError(e.message));
    api.me().then((result) => setUser(result.user)).catch(() => setUser(null));
  }, [user?.role]);

  useEffect(() => {
    updateFavicon(settings.faviconUrl);
  }, [settings.faviconUrl]);

  const allLinkCategories = useMemo(() => [...new Set(links.flatMap((item) => parseCategoryText(item.category)))].sort((a, b) => a.localeCompare(b)), [links]);
  const allAnnouncementCategories = useMemo(() => [...new Set(announcements.flatMap((item) => parseCategoryText(item.category)))].sort((a, b) => a.localeCompare(b)), [announcements]);
  const filteredLinks = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return links.filter((link) => {
      const searchMatch = !needle || `${link.title} ${link.description} ${link.department} ${link.category}`.toLowerCase().includes(needle);
      const categoryMatch = categoryFilterMatch(link.category, linkCategoryFilter);
      return searchMatch && categoryMatch;
    });
  }, [links, search, linkCategoryFilter]);
  const filteredAnnouncements = useMemo(() => announcements.filter((item) => categoryFilterMatch(item.category, announcementCategoryFilter)), [announcements, announcementCategoryFilter]);

  const departments = useMemo(() => [...new Set(filteredLinks.map((link) => link.department))], [filteredLinks]);
  const isAdmin = user?.role === "admin";
  const activeIntegration = integrationData[activeIntegrationIndex] || null;

  async function toggleHomeSection(section: HomeSectionKey) {
    const next = !settings[section];
    setSettings((current) => ({ ...current, [section]: next }));
    try {
      await api.updateSettings({ [section]: next });
    } catch (e: any) {
      setSettings((current) => ({ ...current, [section]: !next }));
      setError(e.message || "Could not update section visibility");
    }
  }

  useEffect(() => {
    if (!integrationData.length) {
      setActiveIntegrationIndex(0);
      return;
    }
    if (activeIntegrationIndex > integrationData.length - 1) {
      setActiveIntegrationIndex(integrationData.length - 1);
    }
  }, [integrationData, activeIntegrationIndex]);

  async function login(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      const result = await api.login(String(form.get("username")), String(form.get("password")));
      setUser(result.user);
      setLoginOpen(false);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function logout() {
    await api.logout();
    setUser(null);
    setPage("home");
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">{settings.logoUrl ? <img src={settings.logoUrl} alt="Site logo" /> : "H"}</div>
          <div><strong>{settings.siteName}</strong><span>{settings.headerSubtitle}</span></div>
        </div>
        <div className="top-actions">
          {isAdmin && page === "home" && <Button variant="outline" onClick={() => setPage("integration-setup")}>Integration Setup</Button>}
          {isAdmin && page === "integration-setup" && <Button variant="outline" onClick={() => setPage("home")}><ArrowLeft size={14} /> Back</Button>}
          <Button variant="ghost" size="icon" aria-label="Toggle theme" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>{theme === "light" ? <Moon size={18} /> : <Sun size={18} />}</Button>
          {isAdmin && page === "home" && <Button variant="outline" onClick={() => setAdminOpen(true)}><Settings size={16} /> Manage</Button>}
          {user ? (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild><Button variant="outline">{user.username}</Button></DropdownMenu.Trigger>
              <DropdownMenu.Portal><DropdownMenu.Content className="dropdown" align="end">
                <DropdownMenu.Label className="dropdown-label">{user.role === "admin" ? "Administrator" : "View-only user"}</DropdownMenu.Label>
                <DropdownMenu.Separator />
                <DropdownMenu.Item className="dropdown-item" onSelect={logout}><LogOut size={15} /> Sign out</DropdownMenu.Item>
              </DropdownMenu.Content></DropdownMenu.Portal>
            </DropdownMenu.Root>
          ) : <Button onClick={() => setLoginOpen(true)}><LogIn size={16} /> Sign in</Button>}
        </div>
      </header>

      <main>
        {error && <div className="error-banner">{error}<button onClick={() => setError("")}><X size={16} /></button></div>}
        {page === "integration-setup" && isAdmin ? (
          <IntegrationSetupPage integrations={integrations} onRefresh={refresh} setError={setError} />
        ) : (
          <>
            {(settings.showHero || isAdmin) && <section aria-label="Hero">
              <div className="section-heading">
                <div><h2>Hero</h2></div>
                {isAdmin && (
                  <Button variant="outline" size="sm" onClick={() => toggleHomeSection("showHero")}>
                    {settings.showHero ? "Hide section" : "Show section"}
                  </Button>
                )}
              </div>
              {settings.showHero && <div className="hero">
                <div>
                  <Badge className="hero-badge">{settings.heroBadge}</Badge>
                  <h1>{settings.heroTitle}</h1>
                  <p>{settings.heroDescription}</p>
                </div>
                {isAdmin && <LinkDialog onSaved={refresh} setError={setError} />}
              </div>}
            </section>}
            {(settings.showIntegrations || isAdmin) && <section className="integrations" aria-label="Live data">
              <div className="section-heading">
                <div><h2>Live data</h2></div>
                <div className="integration-carousel-controls">
                  {settings.showIntegrations && integrationData.length > 1 && (
                    <>
                      <Button variant="outline" size="sm" onClick={() => setActiveIntegrationIndex((prev) => (prev - 1 + integrationData.length) % integrationData.length)}>Prev</Button>
                      <span>{activeIntegrationIndex + 1} / {integrationData.length}</span>
                      <Button variant="outline" size="sm" onClick={() => setActiveIntegrationIndex((prev) => (prev + 1) % integrationData.length)}>Next</Button>
                    </>
                  )}
                  {isAdmin && (
                    <Button variant="outline" size="sm" onClick={() => toggleHomeSection("showIntegrations")}>
                      {settings.showIntegrations ? "Hide section" : "Show section"}
                    </Button>
                  )}
                </div>
              </div>
              {settings.showIntegrations && <div className="integration-carousel-box">
                {activeIntegration ? (
                  <Card className="integration-card">
                    <h3>{activeIntegration.icon} {activeIntegration.title}</h3>
                    {activeIntegration.error ? <p className="integration-error">{activeIntegration.error}</p> : (
                      <div className="integration-values integration-values-scroll">
                        {activeIntegration.fields?.map((field, index) => (
                          <div key={`${activeIntegration.id}-${index}`} className="integration-value">
                            <span>{field.label}</span>
                            {renderIntegrationField(field)}
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                ) : <Card className="empty-state">No integrations configured yet.</Card>}
              </div>}
            </section>}
            {(settings.showAnnouncements || isAdmin) && <section className="announcements" aria-label="Announcements">
              <div className="section-heading">
                <div><Bell size={18} /><h2>{settings.announcementsTitle}</h2></div>
                <div className="filters-row">
                  {settings.showAnnouncements && (
                    <select aria-label="Filter announcements by category" value={announcementCategoryFilter} onChange={(e) => setAnnouncementCategoryFilter(e.target.value)}>
                      <option value="all">All categories</option>
                      {allAnnouncementCategories.map((category) => <option key={category} value={category}>{category}</option>)}
                    </select>
                  )}
                  {isAdmin && (
                    <>
                      {settings.showAnnouncements && <AnnouncementDialog onSaved={refresh} setError={setError} />}
                      <Button variant="outline" size="sm" onClick={() => toggleHomeSection("showAnnouncements")}>
                        {settings.showAnnouncements ? "Hide section" : "Show section"}
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {settings.showAnnouncements && <div className="announcement-grid">
                {filteredAnnouncements.map((item) => (
                  <Card key={item.id} className="announcement-card" style={{ borderTopColor: item.color }}>
                    <div className="announcement-icon" style={{ background: `${item.color}18`, color: item.color }}><Bell size={18} /></div>
                    <div className="announcement-body">
                      <h3>{item.title}</h3>
                      <div className="chips">{parseCategoryText(item.category).map((category) => <Badge key={`${item.id}-${category}`} className="item-category">{category}</Badge>)}</div>
                      <p>{item.body}</p>
                    </div>
                    {isAdmin && <div className="card-actions">
                      <AnnouncementDialog item={item} onSaved={refresh} setError={setError} icon />
                      <Button variant="ghost" size="icon" aria-label="Delete announcement" onClick={() => api.deleteAnnouncement(item.id).then(refresh).catch((e) => setError(e.message))}><Trash2 size={15} /></Button>
                    </div>}
                  </Card>
                ))}
                {!filteredAnnouncements.length && <Card className="empty-state">No announcements in this category.</Card>}
              </div>}
            </section>}
            {(settings.showLinks || isAdmin) && <section className="links-section">
              <div className="section-heading">
                <div><h2>{settings.linksTitle}</h2><Badge className="count-badge">{filteredLinks.length}</Badge></div>
                <div className="filters-row">
                  {settings.showLinks && <>
                    <div className="search-box"><Search size={16} /><Input aria-label="Search links" placeholder="Search links..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
                    <select aria-label="Filter links by category" value={linkCategoryFilter} onChange={(e) => setLinkCategoryFilter(e.target.value)}>
                      <option value="all">All categories</option>
                      {allLinkCategories.map((category) => <option key={category} value={category}>{category}</option>)}
                    </select>
                  </>}
                  {isAdmin && (
                    <>
                      {!settings.showHero && settings.showLinks && <LinkDialog onSaved={refresh} setError={setError} />}
                      <Button variant="outline" size="sm" onClick={() => toggleHomeSection("showLinks")}>
                        {settings.showLinks ? "Hide section" : "Show section"}
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {settings.showLinks && departments.map((department) => (
                <div className="department-block" key={department}>
                  <h3>{department}</h3>
                  <div className="link-grid">
                    {filteredLinks.filter((link) => link.department === department).map((link) => (
                      <Card key={link.id} className="link-card">
                        <div className="thumbnail" style={{ background: `${link.color}12` }}>
                          {link.thumbnail ? <img src={link.thumbnail.dataUrl} alt="" /> : <span style={{ color: link.color }}>{link.title.slice(0, 2).toUpperCase()}</span>}
                        </div>
                        <div className="link-content">
                          <h3>{link.title}</h3>
                          <div className="chips">{parseCategoryText(link.category).map((category) => <Badge key={`${link.id}-${category}`} className="item-category">{category}</Badge>)}</div>
                          <p>{link.description}</p>
                          <div className="link-actions">
                            {link.url && <a href={link.url} target="_blank" rel="noreferrer" className="open-link">Open <ExternalLink size={14} /></a>}
                            {link.attachment && <a href={`/api/links/${link.id}/attachment`} className="open-link"><FileDown size={14} /> {link.attachment.name}</a>}
                          </div>
                        </div>
                        {isAdmin && <div className="card-actions">
                          <LinkDialog item={link} onSaved={refresh} setError={setError} icon />
                          <Button variant="ghost" size="icon" aria-label="Delete link" onClick={() => api.deleteLink(link.id).then(refresh).catch((e) => setError(e.message))}><Trash2 size={15} /></Button>
                        </div>}
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
              {settings.showLinks && !filteredLinks.length && <Card className="empty-state">No links match the selected filters.</Card>}
            </section>}
          </>
        )}
      </main>
      {errorToast && <div className="global-error-toast" role="alert">{errorToast}</div>}

      <footer className="site-footer">{settings.footerText}</footer>

      <Dialog.Root open={loginOpen} onOpenChange={setLoginOpen}>
        <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content">
          <Dialog.Title>Welcome back</Dialog.Title><Dialog.Description>Sign in to manage your Home Hub.</Dialog.Description>
          <form className="form" onSubmit={login}>
            <label>Username<Input name="username" autoComplete="username" required /></label>
            <label>Password<Input name="password" type="password" autoComplete="current-password" required /></label>
            <Button type="submit">Sign in</Button>
          </form>
        </Dialog.Content></Dialog.Portal>
      </Dialog.Root>
      {isAdmin && <AdminDialog open={adminOpen} onOpenChange={setAdminOpen} settings={settings} onSaved={refresh} setError={setError} />}
    </div>
  );
}
