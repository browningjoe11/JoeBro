import type { SupabaseClient } from "@supabase/supabase-js";
import type { CalendarBackend, CalendarEvent, CalendarEventPatch, EventColor, EventKind, EventStatus } from "./types";

type Row = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" ? v : "");

const COLUMNS =
  "id, kind, status, title, starts_at, ends_at, ticket_id, crew_id, assigned_to, color, notes, is_example, " +
  "ticket:tickets(number, title, property:properties(street, city))";

function fail(error: { message: string } | null): void {
  if (!error) return;
  const m = error.message;
  if (/calendar_events_title_present/.test(m)) throw new Error("Give the booking a short title.");
  if (/calendar_events_ends_after_start/.test(m)) throw new Error("The end time must be after the start.");
  if (/row-level security|permission denied/i.test(m)) throw new Error("Your role can't change the calendar.");
  throw new Error(m);
}

function toEvent(r: Row): CalendarEvent {
  const t = r.ticket as Row | null;
  const p = (t?.property as Row | null) ?? null;
  return {
    id: s(r.id),
    kind: r.kind as EventKind,
    status: r.status as EventStatus,
    title: s(r.title),
    start: new Date(s(r.starts_at)).toISOString(),
    end: new Date(s(r.ends_at)).toISOString(),
    ticketId: (r.ticket_id as string) ?? null,
    ticketNumber: t ? Number(t.number) : null,
    ticketLabel: t ? `#${t.number} ${s(t.title)}` : "",
    site: p ? [s(p.street), s(p.city)].filter(Boolean).join(", ") : "",
    crewId: (r.crew_id as string) ?? null,
    assignedTo: (r.assigned_to as string) ?? null,
    color: (r.color as EventColor) ?? null,
    notes: s(r.notes),
    isExample: !!r.is_example,
  };
}

function toRow(p: CalendarEventPatch): Row {
  const row: Row = {};
  if (p.kind !== undefined) row.kind = p.kind;
  if (p.status !== undefined) row.status = p.status;
  if (p.title !== undefined) row.title = p.title.trim();
  if (p.start !== undefined) row.starts_at = p.start;
  if (p.end !== undefined) row.ends_at = p.end;
  if (p.ticketId !== undefined) row.ticket_id = p.ticketId;
  if (p.crewId !== undefined) row.crew_id = p.crewId;
  if (p.assignedTo !== undefined) row.assigned_to = p.assignedTo;
  if (p.color !== undefined) row.color = p.color;
  if (p.notes !== undefined) row.notes = p.notes.trim() || null;
  return row;
}

export function supabaseCalendar(sb: SupabaseClient): CalendarBackend {
  return {
    async list(from, to) {
      const { data, error } = await sb
        .from("calendar_events")
        .select(COLUMNS)
        .lt("starts_at", to.toISOString())
        .gt("ends_at", from.toISOString())
        .order("starts_at")
        .limit(1000);
      fail(error);
      return ((data ?? []) as unknown as Row[]).map(toEvent);
    },
    async forTickets(ids) {
      if (ids.length === 0) return [];
      const { data, error } = await sb.from("calendar_events").select(COLUMNS).in("ticket_id", [...ids]).order("starts_at").limit(1000);
      fail(error);
      return ((data ?? []) as unknown as Row[]).map(toEvent);
    },
    async create(e, actorId) {
      const { data, error } = await sb
        .from("calendar_events")
        .insert({ ...toRow(e), created_by: actorId })
        .select(COLUMNS)
        .single();
      fail(error);
      return toEvent(data as unknown as Row);
    },
    async update(id, patch) {
      const { data, error } = await sb.from("calendar_events").update(toRow(patch)).eq("id", id).select(COLUMNS);
      fail(error);
      const row = (data as unknown as Row[] | null)?.[0];
      // Row-level security hides rows silently, so nothing back means "not allowed" or "gone".
      if (!row) throw new Error("Your role can't change that booking, or it was deleted. Reload and try again.");
      return toEvent(row);
    },
    async remove(id) {
      const { error } = await sb.from("calendar_events").delete().eq("id", id);
      fail(error);
    },
  };
}
