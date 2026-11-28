import type { SupabaseClient } from "@supabase/supabase-js";
import { linesForSaving, normalizeLines, type Estimate, type EstimatesBackend, type EstimateVersion } from "./store";

type Row = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" ? v : "");

/** Turns database errors into wording people can act on. */
function fail(error: { message: string } | null): void {
  if (!error) return;
  const m = error.message;
  if (/estimates_title_present/.test(m)) throw new Error("Give the estimate a name, like “Deck rebuild”.");
  if (/total_positive/.test(m)) throw new Error("The total can't be below $0. Check the lines marked in red.");
  if (/row-level security|permission denied/i.test(m)) throw new Error("Only sales and admins can change estimates.");
  throw new Error(m);
}

const COLUMNS = "id, ticket_id, title, lines, notes, internal_notes, total, version_count, is_example, created_at, updated_at";
const VERSION_COLUMNS = "id, estimate_id, version, title, lines, notes, internal_notes, total, label, created_by, created_at";

function toEstimate(r: Row): Estimate {
  return {
    id: s(r.id),
    ticketId: s(r.ticket_id),
    title: s(r.title),
    lines: normalizeLines(r.lines),
    notes: s(r.notes),
    internalNotes: s(r.internal_notes),
    total: Number(r.total ?? 0),
    versionCount: Number(r.version_count ?? 0),
    isExample: !!r.is_example,
    createdAt: s(r.created_at),
    updatedAt: s(r.updated_at),
  };
}

function toVersion(r: Row): EstimateVersion {
  return {
    id: s(r.id),
    estimateId: s(r.estimate_id),
    version: Number(r.version),
    title: s(r.title),
    lines: normalizeLines(r.lines),
    notes: s(r.notes),
    internalNotes: s(r.internal_notes),
    total: Number(r.total ?? 0),
    label: s(r.label),
    createdBy: (r.created_by as string | null) ?? null,
    createdAt: s(r.created_at),
  };
}

const money = (n: number) => Math.max(0, Math.round(n * 100) / 100);

export function supabaseEstimates(sb: SupabaseClient): EstimatesBackend {
  return {
    async list(opts = {}) {
      let q = sb.from("estimates").select(COLUMNS).order("updated_at", { ascending: false }).limit(500);
      if (opts.ticketId) q = q.eq("ticket_id", opts.ticketId);
      const { data, error } = await q;
      fail(error);
      return ((data ?? []) as Row[]).map(toEstimate);
    },

    async get(id) {
      const { data, error } = await sb.from("estimates").select(COLUMNS).eq("id", id).maybeSingle();
      fail(error);
      return data ? toEstimate(data as Row) : null;
    },

    async create({ ticketId, title }, actorId) {
      const { data, error } = await sb
        .from("estimates")
        .insert({ ticket_id: ticketId, title: title.trim(), created_by: actorId, updated_by: actorId })
        .select("id")
        .single();
      fail(error);
      return s((data as Row).id);
    },

    async saveDraft(id, draft, actorId) {
      const { data, error } = await sb
        .from("estimates")
        .update({
          title: draft.title.trim(),
          lines: linesForSaving(draft.lines),
          notes: draft.notes,
          internal_notes: draft.internalNotes,
          total: money(draft.total),
          updated_by: actorId,
        })
        .eq("id", id)
        .select("id");
      fail(error);
      if (!data || data.length === 0) throw new Error("Only sales and admins can change estimates.");
    },

    async versions(estimateId) {
      const { data, error } = await sb.from("estimate_versions").select(VERSION_COLUMNS).eq("estimate_id", estimateId).order("version", { ascending: false });
      fail(error);
      return ((data ?? []) as Row[]).map(toVersion);
    },

    async saveVersion(estimateId, snap, actorId) {
      // The database numbers the version; 0 is a placeholder.
      const { data, error } = await sb
        .from("estimate_versions")
        .insert({
          estimate_id: estimateId,
          version: 0,
          title: snap.title.trim(),
          lines: linesForSaving(snap.lines),
          notes: snap.notes,
          internal_notes: snap.internalNotes,
          total: money(snap.total),
          label: snap.label.trim(),
          created_by: actorId,
        })
        .select("version")
        .single();
      fail(error);
      return Number((data as Row).version);
    },
  };
}
