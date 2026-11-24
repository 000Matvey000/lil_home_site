import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { FileText, Pencil, Plus, Undo2, X } from "lucide-react";
import { api } from "../../api";
import type { Announcement, LinkRecord } from "../../types";
import { errorMessage, readFile } from "../../lib/helpers";
import { prepareImageUpload } from "../../lib/image";
import { detectBrand, getBrand } from "../../lib/brands";
import { Button } from "../ui/button";
import { Field, Input, Textarea } from "../ui/input";
import { BrandPicker } from "../brand-picker";
import { useToast } from "../toast";

const DEFAULT_ACCENT = "#5b5bf6";

/** Thumbnails render at 52px; 512px leaves headroom for high-DPI screens. */
const THUMBNAIL_MAX_PX = 512;

/**
 * File input that also shows the file already stored on the server, with a
 * Remove/Undo toggle. Picking a new file always wins over "remove".
 */
function StoredFileField({ label, name, accept, current, removed, onRemovedChange }: {
  label: string;
  name: string;
  accept?: string;
  current: { name: string; previewUrl?: string } | null;
  removed: boolean;
  onRemovedChange: (removed: boolean) => void;
}) {
  const [pickedName, setPickedName] = useState("");
  const hint = removed
    ? "Will be removed when you save."
    : current
      ? pickedName ? `Will be replaced by ${pickedName}.` : "Choose a file to replace it."
      : undefined;
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      {current && (
        <div className="stored-file" data-removed={removed}>
          {current.previewUrl ? <img src={current.previewUrl} alt="" /> : <FileText size={18} aria-hidden="true" />}
          <span className="stored-file-name" title={current.name}>{current.name}</span>
          {removed ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => onRemovedChange(false)}><Undo2 size={14} /> Undo</Button>
          ) : (
            <Button type="button" variant="ghost" size="sm" disabled={Boolean(pickedName)} onClick={() => onRemovedChange(true)} aria-label={`Remove ${label.toLowerCase()}`}>
              <X size={14} /> Remove
            </Button>
          )}
        </div>
      )}
      <input
        className="file-input"
        name={name}
        type="file"
        accept={accept}
        aria-label={`${current ? "Replace" : "Choose"} ${label.toLowerCase()}`}
        onChange={(e) => {
          const picked = e.target.files?.[0]?.name ?? "";
          setPickedName(picked);
          if (picked) onRemovedChange(false);
        }}
      />
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

function EditorShell({ open, onOpenChange, trigger, title, description, children }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content">
          <div className="dialog-header">
            <div>
              <Dialog.Title className="dialog-title">{title}</Dialog.Title>
              <Dialog.Description className="dialog-description">{description}</Dialog.Description>
            </div>
            <Dialog.Close asChild><Button variant="ghost" size="icon-sm" aria-label="Close"><X size={16} /></Button></Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function LinkDialog({ item, onSaved, compact = false }: { item?: LinkRecord; onSaved: () => Promise<void>; compact?: boolean }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removeThumbnail, setRemoveThumbnail] = useState(false);
  const [removeAttachment, setRemoveAttachment] = useState(false);
  const [linkType, setLinkType] = useState("");
  // "picked" = chosen by hand (or already saved), so typing a URL won't override it.
  const [typeSource, setTypeSource] = useState<"picked" | "auto">("auto");
  const [color, setColor] = useState(DEFAULT_ACCENT);
  const [colorTouched, setColorTouched] = useState(false);

  function changeOpen(next: boolean) {
    if (next) {
      setRemoveThumbnail(false);
      setRemoveAttachment(false);
      setColor(item?.color || DEFAULT_ACCENT);
      // Existing links keep their colour unless the admin picks a brand.
      setColorTouched(Boolean(item));
      if (item?.linkType) {
        setLinkType(item.linkType);
        setTypeSource("picked");
      } else {
        setLinkType(detectBrand(item?.url ?? "")?.key ?? "");
        setTypeSource("auto");
      }
    }
    setOpen(next);
  }

  function pickType(key: string) {
    setLinkType(key);
    setTypeSource("picked");
    const brand = getBrand(key);
    if (brand) setColor(`#${brand.hex}`);
  }

  function onUrlChange(url: string) {
    if (typeSource === "picked") return;
    const brand = detectBrand(url);
    setLinkType(brand?.key ?? "");
    if (brand && !colorTouched) setColor(`#${brand.hex}`);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const thumbnailFile = form.get("thumbnail") as File | null;
    const attachmentFile = form.get("attachment") as File | null;
    setSaving(true);
    try {
      const value: Record<string, unknown> = {
        title: form.get("title"),
        url: form.get("url"),
        description: form.get("description"),
        department: form.get("department"),
        category: form.get("category"),
        color,
        linkType,
      };
      if (thumbnailFile?.size) value.thumbnail = await prepareImageUpload(thumbnailFile, { maxDimension: THUMBNAIL_MAX_PX });
      else if (removeThumbnail) value.removeThumbnail = true;
      if (attachmentFile?.size) value.attachment = await readFile(attachmentFile);
      else if (removeAttachment) value.removeAttachment = true;
      if (item) await api.updateLink(item.id, value);
      else await api.createLink(value);
      await onSaved();
      setOpen(false);
      toast.success(item ? "Link updated" : "Link added");
    } catch (error) {
      toast.error(errorMessage(error, "Could not save link"));
    } finally {
      setSaving(false);
    }
  }

  const trigger = compact
    ? <Button variant="ghost" size="icon-sm" aria-label={`Edit ${item?.title ?? "link"}`}><Pencil size={15} /></Button>
    : <Button size="sm"><Plus size={15} /> Add link</Button>;

  return (
    <EditorShell open={open} onOpenChange={changeOpen} trigger={trigger} title={item ? "Edit link" : "Add a link"} description="Where it goes, how it's grouped, and optional files.">
      <form className="form" onSubmit={submit}>
        <Field label="Title"><Input name="title" defaultValue={item?.title} required autoFocus /></Field>
        <Field label="URL"><Input name="url" type="url" defaultValue={item?.url} placeholder="https://" onChange={(e) => onUrlChange(e.target.value)} /></Field>
        <BrandPicker value={linkType} onChange={pickType} autoDetected={typeSource === "auto" && Boolean(linkType)} />
        <Field label="Description"><Textarea name="description" defaultValue={item?.description} /></Field>
        <div className="form-grid form-grid-accent">
          <Field label="Group"><Input name="department" defaultValue={item?.department || "General"} /></Field>
          <Field label="Accent">
            <input className="color-input" type="color" value={color} onChange={(e) => { setColor(e.target.value); setColorTouched(true); }} />
          </Field>
        </div>
        <Field label="Categories" hint="Comma-separated, e.g. News, Finance, Video"><Input name="category" defaultValue={item?.category || ""} /></Field>
        <div className="form-grid">
          <StoredFileField
            label="Thumbnail image"
            name="thumbnail"
            accept="image/*"
            current={item?.thumbnail ? { name: item.thumbnail.name, previewUrl: item.thumbnail.url } : null}
            removed={removeThumbnail}
            onRemovedChange={setRemoveThumbnail}
          />
          <StoredFileField
            label="Attachment"
            name="attachment"
            current={item?.attachment ? { name: item.attachment.name } : null}
            removed={removeAttachment}
            onRemovedChange={setRemoveAttachment}
          />
        </div>
        <div className="dialog-actions">
          <Dialog.Close asChild><Button type="button" variant="outline">Cancel</Button></Dialog.Close>
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : item ? "Save changes" : "Add link"}</Button>
        </div>
      </form>
    </EditorShell>
  );
}

export function AnnouncementDialog({ item, onSaved, compact = false }: { item?: Announcement; onSaved: () => Promise<void>; compact?: boolean }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const value = { title: form.get("title"), body: form.get("body"), color: form.get("color"), category: form.get("category") };
    setSaving(true);
    try {
      if (item) await api.updateAnnouncement(item.id, value);
      else await api.createAnnouncement(value);
      await onSaved();
      setOpen(false);
      toast.success(item ? "Announcement updated" : "Announcement posted");
    } catch (error) {
      toast.error(errorMessage(error, "Could not save announcement"));
    } finally {
      setSaving(false);
    }
  }

  const trigger = compact
    ? <Button variant="ghost" size="icon-sm" aria-label={`Edit ${item?.title ?? "announcement"}`}><Pencil size={15} /></Button>
    : <Button size="sm" variant="outline"><Plus size={15} /> Announcement</Button>;

  return (
    <EditorShell open={open} onOpenChange={setOpen} trigger={trigger} title={item ? "Edit announcement" : "New announcement"} description="Shown as a tile on the home page.">
      <form className="form" onSubmit={submit}>
        <Field label="Title"><Input name="title" defaultValue={item?.title} required autoFocus /></Field>
        <Field label="Message"><Textarea name="body" defaultValue={item?.body} /></Field>
        <div className="form-grid form-grid-accent">
          <Field label="Categories" hint="Comma-separated, e.g. General, Alerts"><Input name="category" defaultValue={item?.category || ""} /></Field>
          <Field label="Accent"><input className="color-input" name="color" type="color" defaultValue={item?.color || DEFAULT_ACCENT} /></Field>
        </div>
        <div className="dialog-actions">
          <Dialog.Close asChild><Button type="button" variant="outline">Cancel</Button></Dialog.Close>
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : item ? "Save changes" : "Post"}</Button>
        </div>
      </form>
    </EditorShell>
  );
}
