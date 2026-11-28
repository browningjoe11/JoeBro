import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { useCurrentUser } from "../../core/currentUser";
import type { Role } from "../../core/modules";
import {
  byTag,
  CAPTION_MAX,
  formatBytes,
  PHOTO_TAGS,
  photoSummary,
  preparePhoto,
  TAG_LABELS,
  usePhotos,
  type PhotoTag,
  type PreparedPhoto,
  type TicketPhoto,
} from "../../core/photos";
import { Button, Section, Sheet, TextAreaField } from "../../ui";
import "./photos.css";

/** Roles that can re-tag or remove anyone's photo. Mirrors the ticket_photos rules. */
const PHOTO_MANAGER_ROLES: readonly Role[] = ["admin", "operations"];

type Upload = {
  key: number;
  file: File;
  tag: PhotoTag;
  status: "waiting" | "shrinking" | "uploading" | "failed";
  size?: number;
  error?: string;
};

interface PhotosProps {
  ticketId: string;
  /** Shrinks a picture before upload. Tests pass a stand-in, since there's no canvas outside a browser. */
  prepare?: (file: File) => Promise<PreparedPhoto>;
  /** Tells the parent the photo count changed (for summaries). */
  onChange?: (photos: TicketPhoto[]) => void;
}

/** Photos on the ticket screen, in a collapsible section. */
export function TicketPhotosSection({ ticketId, prepare }: PhotosProps) {
  const [summary, setSummary] = useState<string | undefined>();
  return (
    <Section
      title="Photos"
      storageKey="tickets.photos"
      summary={summary}
      info="Before and after photos from the job site. They're shrunk on the phone before upload, and only people who can see this ticket can open them."
    >
      <PhotoBoard ticketId={ticketId} prepare={prepare} onChange={(p) => setSummary(photoSummary(p) || undefined)} />
    </Section>
  );
}

/**
 * Before and after photos for one ticket (chunk M3): add from the camera or the
 * photo library, watch each one shrink and upload, and tap a photo to see it
 * big, caption it, switch before/after or remove it.
 */
export function PhotoBoard({ ticketId, prepare = preparePhoto, onChange }: PhotosProps) {
  const backend = usePhotos();
  const { id: userId, role } = useCurrentUser();
  const [photos, setPhotos] = useState<TicketPhoto[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const nextKey = useRef(1);
  const busy = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let live = true;
    setPhotos(null);
    setLoadError("");
    backend
      .list(ticketId)
      .then((p) => live && setPhotos(p))
      .catch((e) => live && setLoadError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [backend, ticketId]);

  useEffect(() => {
    if (photos) onChangeRef.current?.(photos);
  }, [photos]);

  const patchUpload = (key: number, patch: Partial<Upload>) => setUploads((list) => list.map((u) => (u.key === key ? { ...u, ...patch } : u)));

  // One at a time: on a weak cell signal, parallel uploads just slow each other down.
  const pump = useCallback(
    async (queue: Upload[]) => {
      if (busy.current) return;
      busy.current = true;
      try {
        for (;;) {
          const next = queue.find((u) => u.status === "waiting");
          if (!next) break;
          next.status = "shrinking";
          patchUpload(next.key, { status: "shrinking", error: undefined });
          try {
            const ready = await prepare(next.file);
            next.status = "uploading";
            patchUpload(next.key, { status: "uploading", size: ready.full.size });
            const saved = await backend.add(ticketId, { ...ready, tag: next.tag });
            setPhotos((p) => [...(p ?? []), saved]);
            setUploads((list) => list.filter((u) => u.key !== next.key));
            queue.splice(queue.indexOf(next), 1);
          } catch (e) {
            next.status = "failed";
            patchUpload(next.key, { status: "failed", error: e instanceof Error ? e.message : String(e) });
          }
        }
      } finally {
        busy.current = false;
      }
    },
    [backend, prepare, ticketId],
  );

  // The live queue the pump walks; React state mirrors it for display.
  const queueRef = useRef<Upload[]>([]);
  const enqueue = (files: File[], tag: PhotoTag) => {
    const added: Upload[] = files.map((file) => ({ key: nextKey.current++, file, tag, status: "waiting" }));
    queueRef.current.push(...added);
    setUploads((list) => [...list, ...added]);
    void pump(queueRef.current);
  };
  const retry = (key: number) => {
    const u = queueRef.current.find((x) => x.key === key);
    if (!u) return;
    u.status = "waiting";
    patchUpload(key, { status: "waiting", error: undefined });
    void pump(queueRef.current);
  };
  const dismiss = (key: number) => {
    const i = queueRef.current.findIndex((u) => u.key === key);
    if (i >= 0) queueRef.current.splice(i, 1);
    setUploads((list) => list.filter((u) => u.key !== key));
  };

  const canManage = (p: TicketPhoto) => PHOTO_MANAGER_ROLES.includes(role) || p.uploadedBy === userId;
  const groups = photos ? byTag(photos) : null;
  const open = photos?.find((p) => p.id === openId) ?? null;

  return (
    <div className="photos">
      <div className="photos-add">
        {PHOTO_TAGS.map((tag) => (
          <AddButton key={tag} tag={tag} onFiles={(files) => enqueue(files, tag)} />
        ))}
      </div>

      {uploads.length > 0 && (
        <ul className="photos-queue" aria-label="Photo uploads">
          {uploads.map((u) => (
            <li key={u.key} className={`photos-up photos-up--${u.status}`}>
              <span className="photos-up-name">
                {TAG_LABELS[u.tag]} · {u.file.name || "photo"}
              </span>
              <span className="photos-up-status" role={u.status === "failed" ? "alert" : "status"}>
                {u.status === "waiting" && "Waiting…"}
                {u.status === "shrinking" && "Shrinking…"}
                {u.status === "uploading" && `Uploading ${formatBytes(u.size ?? null)}…`}
                {u.status === "failed" && `Didn't upload: ${u.error}`}
              </span>
              {u.status === "failed" && (
                <span className="photos-up-actions">
                  <Button size="sm" variant="primary" onClick={() => retry(u.key)}>
                    Try again
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => dismiss(u.key)}>
                    Dismiss
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {loadError ? (
        <p className="settings-error" role="alert">
          Couldn't load photos: {loadError}
        </p>
      ) : !groups ? (
        <p className="settings-help">Loading photos…</p>
      ) : (
        PHOTO_TAGS.map((tag) => (
          <section key={tag} className="photos-group" aria-label={`${TAG_LABELS[tag]} photos`}>
            <h4 className="photos-group-head">
              {TAG_LABELS[tag]} <span className="photos-count">{groups[tag].length}</span>
            </h4>
            {groups[tag].length === 0 ? (
              <p className="photos-none">No {tag} photos yet.</p>
            ) : (
              <ul className="photos-grid">
                {groups[tag].map((p, i) => (
                  <li key={p.id}>
                    <button type="button" className="photos-thumb" onClick={() => setOpenId(p.id)} aria-label={`Open ${tag} photo ${i + 1}${p.caption ? `: ${p.caption}` : ""}`}>
                      <img src={p.thumbUrl} alt="" loading="lazy" />
                      {p.caption && <span className="photos-cap">{p.caption}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))
      )}

      {open && (
        <PhotoSheet
          key={open.id}
          photo={open}
          canManage={canManage(open)}
          onClose={() => setOpenId(null)}
          onSaved={(p) => setPhotos((list) => (list ?? []).map((x) => (x.id === p.id ? p : x)))}
          onRemoved={(p) => {
            setOpenId(null);
            setPhotos((list) => (list ?? []).filter((x) => x.id !== p.id));
          }}
        />
      )}
    </div>
  );
}

/** A big "Add before photos" button. Phones offer the camera or the photo library; several can be picked at once. */
function AddButton({ tag, onFiles }: { tag: PhotoTag; onFiles: (files: File[]) => void }) {
  const id = useId();
  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length) onFiles(files);
  };
  return (
    <span className="photos-add-btn">
      <input id={id} type="file" accept="image/*" multiple className="photos-file" onChange={pick} />
      <label htmlFor={id} className={`photos-btn${tag === "after" ? " photos-btn--after" : ""}`}>
        Add {tag} photos
      </label>
    </span>
  );
}

function PhotoSheet({
  photo,
  canManage,
  onClose,
  onSaved,
  onRemoved,
}: {
  photo: TicketPhoto;
  canManage: boolean;
  onClose: () => void;
  onSaved: (p: TicketPhoto) => void;
  onRemoved: (p: TicketPhoto) => void;
}) {
  const backend = usePhotos();
  const [caption, setCaption] = useState(photo.caption);
  const [tag, setTag] = useState<PhotoTag>(photo.tag);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dirty = caption.trim() !== photo.caption || tag !== photo.tag;

  const run = async (fn: () => Promise<void>) => {
    setSaving(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };
  const save = () =>
    run(async () => {
      onSaved(await backend.update(photo, { tag, caption }));
      onClose();
    });
  const remove = () =>
    run(async () => {
      await backend.remove(photo);
      onRemoved(photo);
    });

  return (
    <Sheet
      open
      onClose={onClose}
      title={`${TAG_LABELS[photo.tag]} photo`}
      footer={
        canManage ? (
          confirming ? (
            <>
              <span className="photos-confirm">Remove this photo for good?</span>
              <Button variant="ghost" onClick={() => setConfirming(false)} disabled={saving}>
                Keep it
              </Button>
              <Button className="btn--danger" onClick={() => void remove()} disabled={saving}>
                Remove
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" className="btn--danger-text" onClick={() => setConfirming(true)} disabled={saving}>
                Remove
              </Button>
              <Button variant="ghost" onClick={onClose}>
                Close
              </Button>
              <Button variant="primary" onClick={() => void save()} disabled={saving || !dirty}>
                Save
              </Button>
            </>
          )
        ) : (
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        )
      }
    >
      <div className="photos-view">
        <a href={photo.url} target="_blank" rel="noopener noreferrer" className="photos-big">
          <img src={photo.url} alt={photo.caption || `${TAG_LABELS[photo.tag]} photo`} />
        </a>
        <p className="settings-help">
          {[photo.takenAt && `Taken ${new Date(photo.takenAt).toLocaleString()}`, photo.width && `${photo.width}×${photo.height}`, formatBytes(photo.bytes)]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {canManage ? (
          <>
            <div className="photos-tagpick" role="group" aria-label="Before or after">
              {PHOTO_TAGS.map((t) => (
                <Button key={t} variant={tag === t ? "primary" : "secondary"} aria-pressed={tag === t} onClick={() => setTag(t)}>
                  {TAG_LABELS[t]}
                </Button>
              ))}
            </div>
            <TextAreaField label="Caption" value={caption} maxLength={CAPTION_MAX} rows={2} onChange={(e) => setCaption(e.target.value)} />
          </>
        ) : (
          photo.caption && <p>{photo.caption}</p>
        )}
        {error && (
          <p className="settings-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}
