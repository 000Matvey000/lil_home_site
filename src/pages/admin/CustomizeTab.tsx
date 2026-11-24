import { useEffect, useRef, useState } from "react";
import { AlertTriangle, GalleryHorizontal, ImageIcon, LayoutDashboard, Paintbrush, Type, Upload } from "lucide-react";
import { api, type AssetKey } from "../../api";
import type { SiteSettings } from "../../types";
import { errorMessage, normalizeSettings, orderedSections, readFile, type HomeSectionKey } from "../../lib/helpers";
import { fontStack, isValidFontName, loadGoogleFont, POPULAR_FONTS } from "../../lib/fonts";
import { prepareImageUpload } from "../../lib/image";
import { cn } from "../../lib/utils";
import { Button } from "../../components/ui/button";
import { Panel } from "../../components/ui/card";
import { Field, Input, Select } from "../../components/ui/input";
import { Switch } from "../../components/ui/switch";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { OrderInput } from "../../components/order-input";
import { useSectionSettings } from "../../components/section-toggles";
import { useToast } from "../../components/toast";

type SetSettings = React.Dispatch<React.SetStateAction<SiteSettings>>;

const TEXT_FIELDS = [
  { key: "siteName", label: "Site name", span: 3 },
  { key: "headerSubtitle", label: "Header subtitle", span: 3 },
  { key: "photosTitle", label: "Photos heading", span: 2 },
  { key: "announcementsTitle", label: "Announcements heading", span: 2 },
  { key: "linksTitle", label: "Links heading", span: 2 },
  { key: "footerText", label: "Footer text", span: 6 },
] as const;

export function CustomizeTab({ settings, setSettings, onSaved }: {
  settings: SiteSettings;
  setSettings: SetSettings;
  onSaved: () => Promise<void>;
}) {
  return (
    <div className="admin-grid">
      <SiteTextPanel settings={settings} setSettings={setSettings} />
      <HomeSectionsPanel settings={settings} setSettings={setSettings} />
      <BannerPanel settings={settings} setSettings={setSettings} onAssetChanged={onSaved} />
      <FontPanel settings={settings} setSettings={setSettings} />
      <Panel className="span-full" icon={<Paintbrush size={18} />} title="Branding" description="Images are saved as soon as you pick them.">
        <div className="asset-grid">
          <AssetSlot assetKey="logo" label="Logo" hint="Square image, shown in the header." url={settings.logoUrl} shape="square" onChanged={onSaved} />
          <AssetSlot assetKey="favicon" label="Tab icon" hint="PNG, SVG or ICO." url={settings.faviconUrl} shape="square" accept="image/x-icon,image/png,image/svg+xml" onChanged={onSaved} />
        </div>
      </Panel>
    </div>
  );
}

/**
 * Local edits for a group of settings with Save/Discard. Only edited keys are
 * held here, so settings that finish loading after the tab opened still show
 * up in untouched inputs.
 */
function useSettingsDraft<K extends keyof SiteSettings>(keys: readonly K[], settings: SiteSettings, setSettings: SetSettings) {
  const toast = useToast();
  const [edits, setEdits] = useState<Partial<Pick<SiteSettings, K>>>({});
  const [saving, setSaving] = useState(false);
  const value = <T extends K>(key: T): SiteSettings[T] => (edits[key] ?? settings[key]) as SiteSettings[T];
  const set = <T extends K>(key: T, next: SiteSettings[T]) => setEdits((current) => ({ ...current, [key]: next }));
  const dirty = keys.some((key) => edits[key] !== undefined && edits[key] !== settings[key]);

  async function save(successMessage: string): Promise<boolean> {
    setSaving(true);
    try {
      const values = Object.fromEntries(keys.map((key) => [key, edits[key] ?? settings[key]])) as Partial<SiteSettings>;
      setSettings(normalizeSettings(await api.updateSettings(values)));
      setEdits({});
      toast.success(successMessage);
      return true;
    } catch (error) {
      toast.error(errorMessage(error, "Could not save settings"));
      return false;
    } finally {
      setSaving(false);
    }
  }

  return { value, set, dirty, saving, save, discard: () => setEdits({}) };
}

function SaveBar({ dirty, saving, onDiscard }: { dirty: boolean; saving: boolean; onDiscard: () => void }) {
  return (
    <div className="form-actions">
      {dirty && <Button type="button" variant="ghost" onClick={onDiscard}>Discard</Button>}
      <Button type="submit" disabled={!dirty || saving}>{saving ? "Saving…" : "Save changes"}</Button>
    </div>
  );
}

function SiteTextPanel({ settings, setSettings }: { settings: SiteSettings; setSettings: SetSettings }) {
  const draft = useSettingsDraft(TEXT_FIELDS.map((field) => field.key), settings, setSettings);
  return (
    <Panel icon={<Type size={18} />} title="Site text" description="Names and headings shown across the site.">
      <form className="form" onSubmit={(e) => { e.preventDefault(); void draft.save("Site text saved"); }}>
        <div className="form-grid form-grid-6">
          {TEXT_FIELDS.map(({ key, label, span }) => (
            <Field key={key} label={label} style={{ "--span": span } as React.CSSProperties}>
              <Input value={draft.value(key)} onChange={(e) => draft.set(key, e.target.value)} />
            </Field>
          ))}
        </div>
        <SaveBar dirty={draft.dirty} saving={draft.saving} onDiscard={draft.discard} />
      </form>
    </Panel>
  );
}

function HomeSectionsPanel({ settings, setSettings }: { settings: SiteSettings; setSettings: SetSettings }) {
  const { toggle, setOrder } = useSectionSettings(setSettings);
  const descriptions: Record<HomeSectionKey, string> = {
    showHero: settings.bannerUrl || settings.bannerTitle || settings.bannerSubtitle ? "Image and text from the Banner panel." : "Add an image or text in the Banner panel first.",
    showPhotos: `Slideshow, ${settings.photoIntervalSeconds} second${settings.photoIntervalSeconds === 1 ? "" : "s"} per photo.`,
    showIntegrations: "Public cards for everyone; private cards for signed-in users.",
    showAnnouncements: "Notice tiles for the household.",
    showLinks: "Searchable link cards grouped by department.",
  };
  return (
    <Panel icon={<LayoutDashboard size={18} />} title="Home sections" description="Order sets the top-to-bottom position (lower is higher). Switches show or hide a section for everyone.">
      <ul className="toggle-list">
        {orderedSections(settings).map(({ key, orderKey, label }) => (
          <li key={key} className="toggle-row toggle-row-ordered">
            <OrderInput value={settings[orderKey]} label={`Order for ${label}`} onCommit={(next) => setOrder(orderKey, next, settings[orderKey])} />
            <div className="toggle-text">
              <span className="toggle-label" id={`section-${key}`}>{label}</span>
              <span className="toggle-description" id={`section-${key}-desc`}>{descriptions[key]}</span>
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

function BannerPanel({ settings, setSettings, onAssetChanged }: { settings: SiteSettings; setSettings: SetSettings; onAssetChanged: () => Promise<void> }) {
  const draft = useSettingsDraft(["bannerTitle", "bannerSubtitle"] as const, settings, setSettings);
  const title = draft.value("bannerTitle");
  const subtitle = draft.value("bannerSubtitle");
  return (
    <Panel icon={<GalleryHorizontal size={18} />} title="Banner" description="Wide image at the top of the home page, with optional text on top.">
      <div className="form">
        <AssetSlot assetKey="banner" label="Banner image" hint="Wide image, about 1600×420." url={settings.bannerUrl} shape="wide" onChanged={onAssetChanged} />
        <form className="form" onSubmit={(e) => { e.preventDefault(); void draft.save("Banner text saved"); }}>
          <Field label="Heading"><Input value={title} maxLength={120} placeholder="Welcome home" onChange={(e) => draft.set("bannerTitle", e.target.value)} /></Field>
          <Field label="Text" hint="Shown under the heading. Leave both empty for an image-only banner.">
            <Input value={subtitle} maxLength={200} placeholder="Everything for the household in one place" onChange={(e) => draft.set("bannerSubtitle", e.target.value)} />
          </Field>
          {(settings.bannerUrl || title || subtitle) && (
            <div className="banner-frame banner-preview" data-has-image={Boolean(settings.bannerUrl)} data-has-text={Boolean(title || subtitle)} aria-label="Banner preview">
              {settings.bannerUrl && <img src={settings.bannerUrl} className="banner-image" alt="" />}
              {(title || subtitle) && (
                <div className="banner-text">
                  {title && <strong className="banner-title">{title}</strong>}
                  {subtitle && <p>{subtitle}</p>}
                </div>
              )}
            </div>
          )}
          <SaveBar dirty={draft.dirty} saving={draft.saving} onDiscard={draft.discard} />
        </form>
      </div>
    </Panel>
  );
}

const CUSTOM_FONT = "__custom__";

function FontPanel({ settings, setSettings }: { settings: SiteSettings; setSettings: SetSettings }) {
  const toast = useToast();
  const draft = useSettingsDraft(["fontFamily"] as const, settings, setSettings);
  const font = draft.value("fontFamily");
  const [customMode, setCustomMode] = useState(false);
  const isPopular = font === "" || POPULAR_FONTS.some((option) => option.name === font);
  const selectValue = customMode || !isPopular ? CUSTOM_FONT : font;
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "missing">("idle");
  const nameValid = font === "" || isValidFontName(font);

  // Load the chosen font into a separate preview slot; the live site keeps its
  // font until you save.
  useEffect(() => {
    if (!font || !isValidFontName(font)) {
      setStatus("idle");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    const timer = window.setTimeout(() => {
      void loadGoogleFont(font, "font-preview").then((ok) => { if (!cancelled) setStatus(ok ? "ok" : "missing"); });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [font]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!nameValid) return toast.error("Font names can only contain letters, numbers and spaces.");
    if (status === "missing") return toast.error(`Google Fonts has no font called "${font}".`);
    void draft.save(font ? `Font changed to ${font}` : "Font reset to the system default").then((ok) => { if (ok) setCustomMode(false); });
  }

  const groups: Array<{ label: string; category: string }> = [
    { label: "Sans serif", category: "sans" },
    { label: "Rounded & display", category: "display" },
    { label: "Serif", category: "serif" },
  ];

  return (
    <Panel icon={<Type size={18} />} title="Font" description="Used for all text on the site. Fonts load from Google Fonts.">
      <form className="form" onSubmit={submit}>
        <Field label="Font">
          <Select
            value={selectValue}
            onChange={(e) => {
              if (e.target.value === CUSTOM_FONT) {
                setCustomMode(true);
                draft.set("fontFamily", "");
              } else {
                setCustomMode(false);
                draft.set("fontFamily", e.target.value);
              }
            }}
          >
            <option value="">System default</option>
            {groups.map((group) => (
              <optgroup key={group.category} label={group.label}>
                {POPULAR_FONTS.filter((option) => option.category === group.category).map((option) => (
                  <option key={option.name} value={option.name}>{option.name}</option>
                ))}
              </optgroup>
            ))}
            <option value={CUSTOM_FONT}>Other Google Font…</option>
          </Select>
        </Field>
        {selectValue === CUSTOM_FONT && (
          <Field
            label="Google Fonts name"
            hint={<>Type it exactly as shown on <a className="text-link" href="https://fonts.google.com" target="_blank" rel="noreferrer">fonts.google.com</a>, e.g. "Josefin Sans".</>}
          >
            <Input value={font} maxLength={60} placeholder="Josefin Sans" aria-invalid={!nameValid || status === "missing"} onChange={(e) => draft.set("fontFamily", e.target.value)} />
          </Field>
        )}
        <div className="font-preview" style={font && status !== "missing" ? { fontFamily: fontStack(font) } : undefined}>
          <span className="font-preview-label">
            {status === "loading" ? "Loading preview…" : status === "missing" ? "Font not found" : `Preview · ${font || "System default"}`}
          </span>
          <strong>{settings.siteName}</strong>
          <p>The quick brown fox jumps over the lazy dog. 0123456789</p>
        </div>
        {(status === "missing" || !nameValid) && (
          <p className="form-error" role="alert">
            <AlertTriangle size={14} aria-hidden="true" />{" "}
            {!nameValid ? "Use letters, numbers and spaces only." : `Google Fonts has no font called "${font}". Check the spelling and capitals.`}
          </p>
        )}
        <SaveBar dirty={draft.dirty} saving={draft.saving} onDiscard={() => { draft.discard(); setCustomMode(false); }} />
      </form>
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
