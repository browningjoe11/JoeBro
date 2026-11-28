/** Largest side of the stored logo, in pixels. Keeps the saved image small (well under the 300 KB limit). */
const MAX_SIDE = 256;

/** Reads an image file and returns it shrunk to fit 256×256, as a PNG data URL. */
export async function logoFromFile(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Pick an image file (PNG, JPG, SVG or WebP).");
  if (file.size > 8 * 1024 * 1024) throw new Error("That image is over 8 MB. Pick a smaller one.");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("That image couldn't be read."));
      el.src = url;
    });
    const w = img.naturalWidth || MAX_SIDE;
    const h = img.naturalHeight || MAX_SIDE;
    const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser can't resize images.");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/png");
    if (data.length > 300_000) throw new Error("That logo is too detailed to store. Try a simpler image.");
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}
