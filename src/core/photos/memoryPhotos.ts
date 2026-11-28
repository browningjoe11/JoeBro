import { normalizeCaption, type PhotosBackend, type TicketPhoto } from "./types";

function asDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Couldn't read the photo."));
    reader.readAsDataURL(blob);
  });
}

/**
 * Photos kept in memory for preview mode and tests (nothing leaves the browser).
 * `failNext` makes the next upload fail, to try the retry button.
 */
export function memoryPhotos(seed: TicketPhoto[] = []) {
  const store = new Map(seed.map((p) => [p.id, { ...p }]));
  let n = 0;
  const control = { failNext: false };
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const backend: PhotosBackend = {
    async list(ticketId) {
      await tick();
      return [...store.values()].filter((p) => p.ticketId === ticketId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((p) => ({ ...p }));
    },
    async add(ticketId, photo) {
      await tick();
      if (control.failNext) {
        control.failNext = false;
        throw new Error("No signal. Check the connection and try again.");
      }
      n += 1;
      const saved: TicketPhoto = {
        id: `photo-${n}`,
        ticketId,
        tag: photo.tag,
        caption: normalizeCaption(photo.caption),
        url: await asDataUrl(photo.full),
        thumbUrl: await asDataUrl(photo.thumb),
        width: photo.width,
        height: photo.height,
        bytes: photo.full.size,
        takenAt: photo.takenAt,
        uploadedBy: null,
        // Keeps order stable when several are added in the same millisecond.
        createdAt: new Date(Date.now() + n).toISOString(),
      };
      store.set(saved.id, saved);
      return { ...saved };
    },
    async update(photo, patch) {
      await tick();
      const cur = store.get(photo.id);
      if (!cur) throw new Error("That photo was already removed.");
      const next = { ...cur, ...(patch.tag ? { tag: patch.tag } : {}), ...(patch.caption !== undefined ? { caption: normalizeCaption(patch.caption) } : {}) };
      store.set(photo.id, next);
      return { ...next };
    },
    async remove(photo) {
      await tick();
      store.delete(photo.id);
    },
  };
  return { backend, store, control };
}
