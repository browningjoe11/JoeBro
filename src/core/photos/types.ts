export type PhotoTag = "before" | "after";

export const PHOTO_TAGS: readonly PhotoTag[] = ["before", "after"];
export const TAG_LABELS: Record<PhotoTag, string> = { before: "Before", after: "After" };
/** Longest caption the table takes. */
export const CAPTION_MAX = 280;

/** One before or after photo on a ticket (a ticket_photos row), with links to show it. */
export interface TicketPhoto {
  id: string;
  ticketId: string;
  tag: PhotoTag;
  caption: string;
  /** Link to the shrunk photo. Signed and short-lived for the real database. */
  url: string;
  /** Link to the small thumbnail used in lists. */
  thumbUrl: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  takenAt: string | null;
  uploadedBy: string | null;
  createdAt: string;
}

/** A photo already shrunk on the device, ready to upload. */
export interface PreparedPhoto {
  full: Blob;
  thumb: Blob;
  width: number;
  height: number;
  /** When the picture was taken, if the file says (its last-modified time). */
  takenAt: string | null;
}

export interface NewPhoto extends PreparedPhoto {
  tag: PhotoTag;
  caption?: string;
}

export interface PhotoPatch {
  tag?: PhotoTag;
  caption?: string;
}

export interface PhotosBackend {
  /** A ticket's photos, oldest first. */
  list(ticketId: string): Promise<TicketPhoto[]>;
  /** Uploads both files, then records the photo. Cleans up the files if recording fails. */
  add(ticketId: string, photo: NewPhoto): Promise<TicketPhoto>;
  update(photo: TicketPhoto, patch: PhotoPatch): Promise<TicketPhoto>;
  /** Removes the files and the record. */
  remove(photo: TicketPhoto): Promise<void>;
}

/** Splits a ticket's photos into before and after, each oldest first. */
export function byTag(photos: TicketPhoto[]): Record<PhotoTag, TicketPhoto[]> {
  const sorted = [...photos].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return { before: sorted.filter((p) => p.tag === "before"), after: sorted.filter((p) => p.tag === "after") };
}

/** "2 before · 3 after", or "" when there are none. */
export function photoSummary(photos: TicketPhoto[]): string {
  const { before, after } = byTag(photos);
  if (!before.length && !after.length) return "";
  return `${before.length} before · ${after.length} after`;
}

export function normalizeCaption(caption: string | undefined): string {
  return (caption ?? "").replace(/\s+/g, " ").trim().slice(0, CAPTION_MAX);
}
