import { useEffect, useId, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft, ArrowRight, ImagePlus, Images, Link as LinkIcon, Pencil, Trash2, Upload, X } from "lucide-react";
import { api, type PhotoInput } from "../../api";
import type { Photo } from "../../types";
import { errorMessage } from "../../lib/helpers";
import { prepareImageUpload } from "../../lib/image";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, Panel } from "../../components/ui/card";
import { Field, Input } from "../../components/ui/input";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { PHOTO_INTERVAL_MS } from "../../components/home/PhotoCarousel";
import { useToast } from "../../components/toast";

export const PHOTO_CAPTION_MAX = 140;

export function PhotosTab({ photos, onChanged }: { photos: Photo[]; onChanged: () => Promise<void> }) {
  const toast = useToast();

  async function move(index: number, delta: -1 | 1) {
    const ids = photos.map((photo) => photo.id);
    const target = index + delta;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    try {
      await api.reorderPhotos(ids);
      await onChanged();
    } catch (error) {
      toast.error(errorMessage(error, "Could not reorder photos"));
    }
  }

  return (
    <div className="admin-grid admin-grid-photos">
      <Panel icon={<ImagePlus size={18} />} title="Add a photo" description="Upload a picture or link to one online.">
        <PhotoForm
          submitLabel="Add photo"
          onSubmit={async (input) => {
            await api.createPhoto(input);
            await onChanged();
            toast.success("Photo added");
          }}
        />
      </Panel>

      <Panel
        icon={<Images size={18} />}
        title={`Slideshow${photos.length ? ` (${photos.length})` : ""}`}
        description={`Plays in this order on the home page, ${PHOTO_INTERVAL_MS / 1000} seconds per photo.`}
      >
        {photos.length ? (
          <ol className="photo-library">
            {photos.map((photo, index) => (
              <li key={photo.id} className="photo-tile">
                <div className="photo-thumb">
                  <img src={photo.imageUrl} alt="" loading="lazy" />
                  <span className="photo-order">{index + 1}</span>
                  <Badge className="photo-source">{photo.source === "upload" ? <><Upload size={11} /> Uploaded</> : <><LinkIcon size={11} /> URL</>}</Badge>
                </div>
                <p className="photo-caption">{photo.caption || <span className="muted-text">No caption</span>}</p>
                <div className="photo-actions">
                  <Button variant="ghost" size="icon-sm" aria-label="Move earlier" disabled={index === 0} onClick={() => void move(index, -1)}><ArrowLeft size={15} /></Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Move later" disabled={index === photos.length - 1} onClick={() => void move(index, 1)}><ArrowRight size={15} /></Button>
                  <span className="flex-1" />
                  <EditPhotoDialog photo={photo} onChanged={onChanged} />
                  <ConfirmDialog
                    title="Delete photo?"
                    description={photo.caption ? `"${photo.caption}" will be removed from the slideshow.` : "This photo will be removed from the slideshow."}
                    onConfirm={async () => {
                      await api.deletePhoto(photo.id);
                      await onChanged();
                      toast.success("Photo deleted");
                    }}
                  >
                    <Button variant="ghost" size="icon-sm" aria-label="Delete photo"><Trash2 size={15} /></Button>
                  </ConfirmDialog>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <Card className="empty-state">No photos yet. Add your first one to start the slideshow.</Card>
        )}
      </Panel>
    </div>
  );
}

function EditPhotoDialog({ photo, onChanged }: { photo: Photo; onChanged: () => Promise<void> }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild><Button variant="ghost" size="icon-sm" aria-label="Edit photo"><Pencil size={15} /></Button></Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content">
          <div className="dialog-header">
            <div>
              <Dialog.Title className="dialog-title">Edit photo</Dialog.Title>
              <Dialog.Description className="dialog-description">Change the caption or swap the image.</Dialog.Description>
            </div>
            <Dialog.Close asChild><Button variant="ghost" size="icon-sm" aria-label="Close"><X size={16} /></Button></Dialog.Close>
          </div>
          <PhotoForm
            photo={photo}
            submitLabel="Save changes"
            onCancel={() => setOpen(false)}
            onSubmit={async (input) => {
              await api.updatePhoto(photo.id, input);
              await onChanged();
              setOpen(false);
              toast.success("Photo updated");
            }}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PhotoForm({ photo, submitLabel, onSubmit, onCancel }: {
  photo?: Photo;
  submitLabel: string;
  onSubmit: (input: PhotoInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const toast = useToast();
  const id = useId();
  const [mode, setMode] = useState<"upload" | "url">(photo?.source ?? "upload");
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState("");
  const [url, setUrl] = useState(photo?.source === "url" ? photo.sourceUrl : "");
  const [caption, setCaption] = useState(photo?.caption ?? "");
  const [dragging, setDragging] = useState(false);
  const [previewBroken, setPreviewBroken] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!file) {
      setFilePreview("");
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setFilePreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  // Wait for typing to pause before previewing, otherwise every keystroke
  // ("http://l", "http://lo", ...) fires a request for a half-typed URL.
  const [previewUrl, setPreviewUrl] = useState(url.trim());
  useEffect(() => {
    const timer = window.setTimeout(() => setPreviewUrl(url.trim()), 450);
    return () => window.clearTimeout(timer);
  }, [url]);

  const keepsUpload = photo?.source === "upload";
  const previewSrc = mode === "upload"
    ? filePreview || (keepsUpload ? photo.imageUrl : "")
    : /^https?:\/\/[^\s/]+\/\S+$/i.test(previewUrl) ? previewUrl : "";

  useEffect(() => setPreviewBroken(false), [previewSrc]);

  function pickFile(next: File | undefined | null) {
    if (!next) return;
    if (!next.type.startsWith("image/")) {
      toast.error("That file is not an image.");
      return;
    }
    setFile(next);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedUrl = url.trim();
    if (mode === "upload" && !file && !keepsUpload) return toast.error("Choose an image to upload.");
    if (mode === "url" && !trimmedUrl) return toast.error("Paste an image URL.");
    setSaving(true);
    try {
      const input: PhotoInput = { caption: caption.trim() };
      if (mode === "upload" && file) input.file = await prepareImageUpload(file);
      // Only send the URL when it changed, so a caption edit doesn't rewrite the image.
      if (mode === "url" && !(photo?.source === "url" && trimmedUrl === photo.sourceUrl)) input.url = trimmedUrl;
      await onSubmit(input);
      if (!photo) {
        setFile(null);
        setUrl("");
        setCaption("");
      }
    } catch (error) {
      toast.error(errorMessage(error, "Could not save photo"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="segmented" role="radiogroup" aria-label="Photo source">
        <button type="button" role="radio" aria-checked={mode === "upload"} onClick={() => setMode("upload")}><Upload size={14} /> Upload</button>
        <button type="button" role="radio" aria-checked={mode === "url"} onClick={() => setMode("url")}><LinkIcon size={14} /> Image URL</button>
      </div>

      {mode === "upload" ? (
        <label
          htmlFor={`${id}-file`}
          className="dropzone"
          data-dragging={dragging}
          data-has-preview={Boolean(previewSrc)}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pickFile(e.dataTransfer.files?.[0]);
          }}
        >
          {previewSrc ? (
            <img src={previewSrc} alt="Selected photo preview" />
          ) : (
            <span className="dropzone-empty">
              <ImagePlus size={26} aria-hidden="true" />
              <strong>Drop an image here or click to browse</strong>
              <span>JPG, PNG, WebP or GIF. Large photos are resized automatically.</span>
            </span>
          )}
          {previewSrc && <span className="dropzone-change">{file ? file.name : "Click to replace"}</span>}
          <input id={`${id}-file`} type="file" accept="image/*" className="sr-only" onChange={(e) => { pickFile(e.target.files?.[0]); e.currentTarget.value = ""; }} />
        </label>
      ) : (
        <>
          <Field label="Image URL" hint="A direct link to a .jpg, .png, .webp or .gif image.">
            <Input type="url" inputMode="url" placeholder="https://example.com/photo.jpg" value={url} onChange={(e) => setUrl(e.target.value)} />
          </Field>
          {previewSrc && (
            <div className="url-preview">
              {previewBroken
                ? <span className="muted-text">Couldn't load a preview from that URL. Check that it points straight to an image.</span>
                : <img src={previewSrc} alt="Image URL preview" onError={() => setPreviewBroken(true)} />}
            </div>
          )}
        </>
      )}

      <Field label="Caption" hint={`${caption.length}/${PHOTO_CAPTION_MAX} · Shown at the bottom of the slide.`}>
        <Input value={caption} maxLength={PHOTO_CAPTION_MAX} placeholder="Summer at the lake, 2025" onChange={(e) => setCaption(e.target.value)} />
      </Field>

      <div className="form-actions">
        {onCancel && <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" disabled={saving}>{saving ? "Saving…" : submitLabel}</Button>
      </div>
    </form>
  );
}
