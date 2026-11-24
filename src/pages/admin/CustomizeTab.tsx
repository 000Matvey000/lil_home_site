import { useRef, useState } from "react";
import { ImageIcon, LayoutDashboard, Paintbrush, Type, Upload } from "lucide-react";
import { api, type AssetKey } from "../../api";
import type { SiteSettings } from "../../types";
import { errorMessage, normalizeSettings, readFile, type HomeSectionKey } from "../../lib/helpers";
import { prepareImageUpload } from "../../lib/image";
import { cn } from "../../lib/utils";
import { Button } from "../../components/ui/button";
import { Panel } from "../../components/ui/card";
import { Field, Input } from "../../components/ui/input";
import { Switch } from "../../components/ui/switch";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { useToast } from "../../components/toast";

const TEXT_FIELDS = [
  { key: "siteName", label: "Site name", span: 3 },
  { key: "headerSubtitle", label: "Header subtitle", span: 3 },
  { key: "photosTitle", label: "Photos heading", span: 2 },
  { key: "announcementsTitle", label: "Announcements heading", span: 2 },
  { key: "linksTitle", label: "Links heading", span: 2 },
  { key: "footerText", label: "Footer text", span: 6 },
] as const;
type TextKey = (typeof TEXT_FIELDS)[number]["key"];

const SECTIONS: Array<{ key: HomeSectionKey; label: string; description: string }> = [
  { key: "showHero", label: "Banner image", description: "Wide image across the top of the home page." },
  { key: "showPhotos", label: "Photos", description: "Slideshow that rotates every 3 seconds." },
  { key: "showIntegrations", label: "Live data", description: "Public cards for everyone; private cards for signed-in users." },
  { key: "showAnnouncements", label: "Announcements", description: "Notice tiles for the household." },
  { key: "showLinks", label: "Links", description: "Searchable link cards grouped by department." },
];

export function CustomizeTab({ settings, setSettings, onSaved }: {
  settings: SiteSettings;
  setSettings: React.Dispatch<React.SetStateAction<SiteSettings>>;
  onSaved: () => Promise<void>;
}) {
  return (
    <div className="admin-grid">
      <SiteTextPanel settings={settings} setSettings={setSettings} />
      <HomeSectionsPanel settings={settings} setSettings={setSettings} />
      <Panel className="span-full" icon={<Paintbrush size={18} />} title="Branding" description="Images are saved as soon as you pick them.">
        <div className="asset-grid">
          <AssetSlot assetKey="logo" label="Logo" hint="Square image, shown in the header." url={settings.logoUrl} shape="square" onChanged={onSaved} />
          <AssetSlot assetKey="favicon" label="Tab icon" hint="PNG, SVG or ICO." url={settings.faviconUrl} shape="square" accept="image/x-icon,image/png,image/svg+xml" onChanged={onSaved} />
          <AssetSlot assetKey="banner" label="Home banner" hint="Wide image, about 1600×420." url={settings.bannerUrl} shape="wide" onChanged={onSaved} />
        </div>
      </Panel>
    </div>
  );
}

function SiteTextPanel({ settings, setSettings }: { settings: SiteSettings; setSettings: React.Dispatch<React.SetStateAction<SiteSettings>> }) {
  const toast = useToast();
  // Only edited fields live here, so settings that finish loading after the
  // tab opened still show up in untouched inputs.
  const [edits, setEdits] = useState<Partial<Record<TextKey, string>>>({});
  const [saving, setSaving] = useState(false);
  const dirty = TEXT_FIELDS.some(({ key }) => edits[key] !== undefined && edits[key] !== settings[key]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const values = Object.fromEntries(TEXT_FIELDS.map(({ key }) => [key, edits[key] ?? settings[key]])) as Partial<SiteSettings>;
      setSettings(normalizeSettings(await api.updateSettings(values)));
      setEdits({});
      toast.success("Site text saved");
    } catch (error) {
      toast.error(errorMessage(error, "Could not save settings"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel icon={<Type size={18} />} title="Site text" description="Names and headings shown across the site.">
      <form className="form" onSubmit={save}>
        <div className="form-grid form-grid-6">
          {TEXT_FIELDS.map(({ key, label, span }) => (
            <Field key={key} label={label} style={{ "--span": span } as React.CSSProperties}>
              <Input value={edits[key] ?? settings[key]} onChange={(e) => setEdits((current) => ({ ...current, [key]: e.target.value }))} />
            </Field>
          ))}
        </div>
        <div className="form-actions">
          {dirty && <Button type="button" variant="ghost" onClick={() => setEdits({})}>Discard</Button>}
          <Button type="submit" disabled={!dirty || saving}>{saving ? "Saving…" : "Save changes"}</Button>
        </div>
      </form>
    </Panel>
  );
}

function HomeSectionsPanel({ settings, setSettings }: { settings: SiteSettings; setSettings: React.Dispatch<React.SetStateAction<SiteSettings>> }) {
  const toast = useToast();

  async function toggle(key: HomeSectionKey, next: boolean) {
    setSettings((current) => ({ ...current, [key]: next }));
    try {
      await api.updateSettings({ [key]: next });
    } catch (error) {
      setSettings((current) => ({ ...current, [key]: !next }));
      toast.error(errorMessage(error, "Could not update section visibility"));
    }
  }

  return (
    <Panel icon={<LayoutDashboard size={18} />} title="Home sections" description="Choose what visitors see on the home page.">
      <ul className="toggle-list">
        {SECTIONS.map(({ key, label, description }) => (
          <li key={key} className="toggle-row">
            <div>
              <span className="toggle-label" id={`section-${key}`}>{label}</span>
              <span className="toggle-description" id={`section-${key}-desc`}>
                {description}
                {key === "showHero" && !settings.bannerUrl && " No banner uploaded yet."}
              </span>
            </div>
            <Switch
              checked={settings[key]}
              onCheckedChange={(next) => void toggle(key, next)}
              aria-labelledby={`section-${key}`}
              aria-describedby={`section-${key}-desc`}
            />
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function AssetSlot({ assetKey, label, hint, url, shape, accept = "image/*", onChanged }: {
  assetKey: AssetKey;
  label: string;
  hint: string;
  url: string;
  shape: "square" | "wide";
  accept?: string;
  onChanged: () => Promise<void>;
}) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    try {
      // Banners are big photos; shrink them. Logos/icons are uploaded as-is.
      const value = assetKey === "banner" ? await prepareImageUpload(file) : await readFile(file);
      await api.uploadAsset(assetKey, value);
      await onChanged();
      toast.success(`${label} updated`);
    } catch (error) {
      toast.error(errorMessage(error, `Could not upload ${label.toLowerCase()}`));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("asset-slot", `asset-${shape}`)}>
      <div className="asset-preview">
        {url ? <img src={url} alt={`Current ${label.toLowerCase()}`} /> : <ImageIcon size={26} aria-hidden="true" />}
      </div>
      <div className="asset-meta">
        <strong>{label}</strong>
        <span>{hint}</span>
        <div className="asset-actions">
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.currentTarget.value = "";
              if (file) void upload(file);
            }}
          />
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
            <Upload size={14} /> {busy ? "Uploading…" : url ? "Replace" : "Upload"}
          </Button>
          {url && (
            <ConfirmDialog
              title={`Remove ${label.toLowerCase()}?`}
              description="The image is deleted from the server."
              confirmLabel="Remove"
              onConfirm={async () => {
                await api.deleteAsset(assetKey);
                await onChanged();
                toast.success(`${label} removed`);
              }}
            >
              <Button type="button" size="sm" variant="ghost" disabled={busy}>Remove</Button>
            </ConfirmDialog>
          )}
        </div>
      </div>
    </div>
  );
}
