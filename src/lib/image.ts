import type { FileValue } from "../types";
import { readFile } from "./helpers";

const RECOMPRESS_OVER_BYTES = 1.5 * 1024 * 1024;
const RESIZABLE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Read an image for upload, shrinking large photos first.
 *
 * Images live as SQLite BLOBs on a small home server and are sent to every
 * visitor, so a 12 MP phone photo (5-10 MB) is scaled down to at most
 * `maxDimension` px on the long edge (2048 for slideshow photos; link
 * thumbnails pass a much smaller size). GIFs and SVGs are passed through
 * untouched so animation and vector data survive.
 */
export async function prepareImageUpload(file: File, { maxDimension = 2048 }: { maxDimension?: number } = {}): Promise<FileValue> {
  if (!RESIZABLE_TYPES.has(file.type)) return readFile(file);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return readFile(file);
  }
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= RECOMPRESS_OVER_BYTES) {
    bitmap.close();
    return readFile(file);
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return readFile(file);
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  // Prefer WebP (keeps transparency); browsers that cannot encode it return PNG,
  // in which case re-encode as JPEG on a white background.
  let base64 = canvas.toDataURL("image/webp", 0.86);
  let extension = "webp";
  if (!base64.startsWith("data:image/webp")) {
    context.globalCompositeOperation = "destination-over";
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    base64 = canvas.toDataURL("image/jpeg", 0.86);
    extension = "jpg";
  }
  const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
  return { name: `${baseName}.${extension}`, base64 };
}
