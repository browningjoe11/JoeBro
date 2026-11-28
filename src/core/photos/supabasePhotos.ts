import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeCaption, type PhotoTag, type PhotosBackend, type TicketPhoto } from "./types";

export const PHOTO_BUCKET = "ticket-photos";
/** Signed links last an hour: long enough for a visit to the ticket, short enough not to matter if one leaks. */
const LINK_SECONDS = 60 * 60;
const COLUMNS = "id, ticket_id, tag, caption, path, thumb_path, width, height, bytes, taken_at, uploaded_by, created_at";

type Row = {
  id: string;
  ticket_id: string;
  tag: PhotoTag;
  caption: string | null;
  path: string;
  thumb_path: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  taken_at: string | null;
  uploaded_by: string | null;
  created_at: string;
};

function fail(error: { message: string } | null, what: string): void {
  if (!error) return;
  const m = error.message;
  if (/row-level security|permission denied|unauthorized/i.test(m)) throw new Error(`You can't ${what} on this ticket.`);
  if (/ticket_photos_caption_short/.test(m)) throw new Error("The caption is too long.");
  if (/ticket_photos_size|exceeded the maximum allowed size|payload too large/i.test(m)) throw new Error("That photo is too big to upload.");
  throw new Error(m);
}

/** Photos in the private ticket-photos bucket, shown through signed links. */
export function supabasePhotos(sb: SupabaseClient): PhotosBackend {
  const bucket = () => sb.storage.from(PHOTO_BUCKET);

  async function withLinks(rows: Row[]): Promise<TicketPhoto[]> {
    if (rows.length === 0) return [];
    const paths = rows.flatMap((r) => [r.path, r.thumb_path]);
    const { data, error } = await bucket().createSignedUrls(paths, LINK_SECONDS);
    if (error) throw new Error(`Couldn't load the photos: ${error.message}`);
    const links = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
    return rows.map((r) => ({
      id: r.id,
      ticketId: r.ticket_id,
      tag: r.tag,
      caption: r.caption ?? "",
      url: links.get(r.path) ?? "",
      thumbUrl: links.get(r.thumb_path) ?? links.get(r.path) ?? "",
      width: r.width,
      height: r.height,
      bytes: r.bytes,
      takenAt: r.taken_at,
      uploadedBy: r.uploaded_by,
      createdAt: r.created_at,
    }));
  }

  async function pathsOf(id: string): Promise<string[]> {
    const { data, error } = await sb.from("ticket_photos").select("path, thumb_path").eq("id", id).maybeSingle();
    fail(error, "remove photos");
    return data ? [data.path as string, data.thumb_path as string] : [];
  }

  return {
    async list(ticketId) {
      const { data, error } = await sb.from("ticket_photos").select(COLUMNS).eq("ticket_id", ticketId).order("created_at");
      fail(error, "see photos");
      return withLinks((data ?? []) as Row[]);
    },

    async add(ticketId, photo) {
      const id = crypto.randomUUID();
      const path = `${ticketId}/${id}.jpg`;
      const thumbPath = `${ticketId}/${id}-thumb.jpg`;
      const opts = { contentType: photo.full.type || "image/jpeg", cacheControl: "31536000", upsert: false };
      const [full, thumb] = await Promise.all([bucket().upload(path, photo.full, opts), bucket().upload(thumbPath, photo.thumb, opts)]);
      const uploadError = full.error ?? thumb.error;
      if (uploadError) {
        await bucket().remove([path, thumbPath]);
        fail(uploadError, "add photos");
      }
      const { data, error } = await sb
        .from("ticket_photos")
        .insert({
          id,
          ticket_id: ticketId,
          tag: photo.tag,
          caption: normalizeCaption(photo.caption) || null,
          path,
          thumb_path: thumbPath,
          width: photo.width,
          height: photo.height,
          bytes: photo.full.size,
          taken_at: photo.takenAt,
        })
        .select(COLUMNS)
        .single();
      if (error) {
        await bucket().remove([path, thumbPath]);
        fail(error, "add photos");
      }
      return (await withLinks([data as Row]))[0];
    },

    async update(photo, patch) {
      const changes: Record<string, unknown> = {};
      if (patch.tag) changes.tag = patch.tag;
      if (patch.caption !== undefined) changes.caption = normalizeCaption(patch.caption) || null;
      const { data, error } = await sb.from("ticket_photos").update(changes).eq("id", photo.id).select(COLUMNS).maybeSingle();
      fail(error, "change photos");
      if (!data) throw new Error("You can only change photos you took.");
      // The files didn't change, so the links already on screen still work.
      const r = data as Row;
      return { ...photo, tag: r.tag, caption: r.caption ?? "" };
    },

    async remove(photo) {
      // Files first: once the row is gone, only office roles could clear them.
      const paths = await pathsOf(photo.id);
      if (paths.length) {
        const { error: storageError } = await bucket().remove(paths);
        if (storageError) fail(storageError, "remove photos");
      }
      const { data, error } = await sb.from("ticket_photos").delete().eq("id", photo.id).select("id");
      fail(error, "remove photos");
      if (!data?.length) throw new Error("You can only remove photos you took.");
    },
  };
}
