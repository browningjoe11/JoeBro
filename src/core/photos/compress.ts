import type { PreparedPhoto } from "./types";

/**
 * Photos are shrunk on the phone before upload (chunk M3), so they go up in a
 * few seconds on cell service and the free Storage allowance (1 GB) holds
 * thousands of them. A 12-megapixel phone photo (3-6 MB) becomes a JPEG of
 * about 200-400 KB at 1600px on the long edge, plus a ~20 KB thumbnail.
 * Re-drawing the picture also drops its hidden details (EXIF), such as the
 * GPS position of the customer's home.
 */
export const FULL_EDGE = 1600;
export const THUMB_EDGE = 360;
/** Aim to stay under this; quality steps down until it fits. */
export const TARGET_BYTES = 450 * 1024;
/** Hard ceiling, matching the bucket's limit. */
export const MAX_BYTES = 2 * 1024 * 1024;
const QUALITIES = [0.78, 0.68, 0.58, 0.48];

/** Size that fits inside a square of `edge`, keeping the shape. Never enlarges. */
export function fitWithin(width: number, height: number, edge: number): { width: number; height: number } {
  if (!(width > 0 && height > 0)) return { width: 0, height: 0 };
  const scale = Math.min(1, edge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** True for files a phone or PC can hand us as a photo. HEIC opens only where the browser can decode it (Safari). */
export function looksLikeImage(file: File): boolean {
  return file.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif|gif)$/i.test(file.name);
}

type Source = { width: number; height: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; close: () => void };

/** Decodes the file, turned the right way up (phones store sideways pictures with a rotate flag). */
async function decode(file: File): Promise<Source> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { width: bmp.width, height: bmp.height, draw: (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h), close: () => bmp.close() };
    } catch {
      // Fall through to an <img>, which some browsers decode more formats with.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
      close: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error("This phone or browser can't open that picture. Try a JPEG, or take the photo with the camera here.");
  }
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't shrink the picture."))), "image/jpeg", quality),
  );
}

async function render(src: Source, edge: number, qualities: number[], target: number): Promise<{ blob: Blob; width: number; height: number }> {
  const size = fitWithin(src.width, src.height, edge);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't shrink the picture.");
  // White under any transparent parts (PNG screenshots), since JPEG has no transparency.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.imageSmoothingQuality = "high";
  src.draw(ctx, size.width, size.height);
  let blob = await toBlob(canvas, qualities[0]);
  for (const q of qualities.slice(1)) {
    if (blob.size <= target) break;
    blob = await toBlob(canvas, q);
  }
  return { blob, ...size };
}

/** Shrinks a photo from the camera or the photo library into an upload-ready photo and thumbnail. */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  if (!looksLikeImage(file)) throw new Error(`${file.name || "That file"} isn't a picture.`);
  const src = await decode(file);
  try {
    const full = await render(src, FULL_EDGE, QUALITIES, TARGET_BYTES);
    if (full.blob.size > MAX_BYTES) throw new Error("That picture is still too big after shrinking.");
    const thumb = await render(src, THUMB_EDGE, [0.7], Infinity);
    const taken = file.lastModified ? new Date(file.lastModified) : null;
    return { full: full.blob, thumb: thumb.blob, width: full.width, height: full.height, takenAt: taken && !isNaN(+taken) ? taken.toISOString() : null };
  } finally {
    src.close();
  }
}

/** "312 KB", "1.2 MB" */
export function formatBytes(n: number | null): string {
  if (!n) return "";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
