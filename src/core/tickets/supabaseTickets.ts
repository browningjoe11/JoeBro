import type { SupabaseClient } from "@supabase/supabase-js";
import type { Role } from "../modules";
import type { Stage, Transition } from "./stages";
import type { ContactOption, Person, Ticket, TicketEvent, TicketPatch, TicketSummary, TicketsBackend } from "./types";

type Row = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
const orNull = (v: string | undefined) => (v && v.trim() ? v.trim() : null);

/** Turns database errors into wording people can act on. */
function fail(error: { message: string; code?: string } | null): void {
  if (!error) return;
  const m = error.message;
  if (/tickets_lost_needs_reason/.test(m)) throw new Error("Say why the job was lost.");
  if (/cannot move from/.test(m)) throw new Error("That move isn't allowed from this stage.");
  if (/row-level security|permission denied/i.test(m)) throw new Error("Your role can't make that change.");
  if (/contacts_email_shape/.test(m)) throw new Error("That email address doesn't look right.");
  if (/properties_zip_shape/.test(m)) throw new Error("ZIP should be 5 digits.");
  if (/tickets_title_present/.test(m)) throw new Error("Give the ticket a short title.");
  throw new Error(m);
}

function contactName(c: Row | null | undefined): string {
  if (!c) return "";
  const name = `${s(c.first_name)} ${s(c.last_name)}`.trim();
  return name || s(c.company);
}

function siteLine(p: Row | null | undefined): string {
  return p ? [s(p.street), s(p.city)].filter(Boolean).join(", ") : "";
}

const TICKET_COLUMNS = "id, number, title, stage, stage_changed_at, trade, estimated_value, next_action_at, assigned_to, is_example";
const SUMMARY_COLUMNS = `${TICKET_COLUMNS}, contact:contacts(first_name, last_name, company), property:properties(street, city)`;
const DETAIL_COLUMNS =
  `${TICKET_COLUMNS}, contact_id, property_id, scope, lead_source, lost_reason, created_at, ` +
  "contact:contacts(first_name, last_name, company, phone, email), property:properties(street, city)";

function toSummary(r: Row): TicketSummary {
  return {
    id: s(r.id),
    number: Number(r.number),
    title: s(r.title),
    stage: r.stage as Stage,
    stageChangedAt: s(r.stage_changed_at),
    customer: contactName(r.contact as Row),
    site: siteLine(r.property as Row),
    trade: s(r.trade),
    estimatedValue: num(r.estimated_value),
    nextActionAt: (r.next_action_at as string) ?? null,
    assignedTo: (r.assigned_to as string) ?? null,
    isExample: !!r.is_example,
  };
}

export function supabaseTickets(sb: SupabaseClient): TicketsBackend {
  /** Rows an update or insert actually touched. RLS hides rows silently, so zero means "not allowed". */
  async function touched(
    query: PromiseLike<{
      data: unknown[] | null;
      error: { message: string } | null;
    }>,
  ) {
    const { data, error } = await query;
    fail(error);
    if (!data || data.length === 0)
      throw new Error("Your role can't make that change, or the ticket was moved by someone else. Reload and try again.");
  }

  return {
    async list() {
      const { data, error } = await sb.from("tickets").select(SUMMARY_COLUMNS).order("number", { ascending: false }).limit(500);
      fail(error);
      return ((data ?? []) as unknown as Row[]).map(toSummary);
    },

    async get(number) {
      const { data, error } = await sb.from("tickets").select(DETAIL_COLUMNS).eq("number", number).maybeSingle();
      fail(error);
      if (!data) return null;
      const r = data as unknown as Row;
      const c = (r.contact as Row) ?? {};
      return {
        ...toSummary(r),
        contactId: s(r.contact_id),
        propertyId: (r.property_id as string) ?? null,
        phone: s(c.phone),
        email: s(c.email),
        scope: s(r.scope),
        leadSource: s(r.lead_source),
        lostReason: s(r.lost_reason),
        createdAt: s(r.created_at),
      } satisfies Ticket;
    },

    async events(ticketId) {
      const { data, error } = await sb
        .from("ticket_events")
        .select("id, kind, from_stage, to_stage, data, actor_id, created_at")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: false })
        .limit(500);
      fail(error);
      return ((data ?? []) as Row[]).map<TicketEvent>((e) => ({
        id: s(e.id),
        kind: e.kind as TicketEvent["kind"],
        fromStage: (e.from_stage as Stage) ?? null,
        toStage: (e.to_stage as Stage) ?? null,
        data: (e.data as Record<string, unknown>) ?? {},
        actorId: (e.actor_id as string) ?? null,
        createdAt: s(e.created_at),
      }));
    },

    async transitions() {
      const { data, error } = await sb.from("ticket_stage_transitions").select("from_stage, to_stage, label");
      fail(error);
      return ((data ?? []) as Row[]).map<Transition>((t) => ({
        from: t.from_stage as Stage,
        to: t.to_stage as Stage,
        label: s(t.label),
      }));
    },

    async people() {
      const { data, error } = await sb.from("profiles").select("id, full_name, email, role, active").order("full_name");
      fail(error);
      return ((data ?? []) as Row[]).map<Person>((p) => ({
        id: s(p.id),
        name: s(p.full_name) || s(p.email),
        role: p.role as Role,
        active: !!p.active,
      }));
    },

    async searchContacts(query) {
      const q = query
        .trim()
        .replace(/[,()%]/g, " ")
        .trim();
      let req = sb
        .from("contacts")
        .select("id, first_name, last_name, company, phone, email, properties(id, label, street, city, is_primary)")
        .order("last_name")
        .limit(8);
      if (q) {
        const digits = q.replace(/\D/g, "");
        const parts = q.split(/\s+/).filter(Boolean);
        const ors = parts.flatMap((p) => [`first_name.ilike.%${p}%`, `last_name.ilike.%${p}%`, `company.ilike.%${p}%`, `email.ilike.%${p}%`]);
        if (digits.length >= 3) ors.push(`phone_digits.like.%${digits}%`);
        req = req.or(ors.join(","));
      }
      const { data, error } = await req;
      fail(error);
      return ((data ?? []) as Row[]).map<ContactOption>((c) => ({
        id: s(c.id),
        name: contactName(c),
        phone: s(c.phone),
        email: s(c.email),
        properties: ((c.properties as Row[]) ?? [])
          .map((p) => ({
            id: s(p.id),
            label: [s(p.label), siteLine(p)].filter(Boolean).join(" · "),
            isPrimary: !!p.is_primary,
          }))
          .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)),
      }));
    },

    async create(t, actorId) {
      let contactId = t.contactId;
      if (!contactId) {
        const c = t.newContact;
        const { data, error } = await sb
          .from("contacts")
          .insert({
            first_name: c?.firstName.trim() ?? "",
            last_name: c?.lastName.trim() ?? "",
            phone: orNull(c?.phone),
            email: orNull(c?.email)?.toLowerCase() ?? null,
            lead_source: orNull(t.leadSource),
            created_by: actorId,
          })
          .select("id")
          .single();
        fail(error);
        contactId = s((data as Row).id);
      }
      let propertyId = t.propertyId ?? null;
      if (!propertyId && t.newProperty?.street.trim()) {
        const { count } = await sb.from("properties").select("id", { count: "exact", head: true }).eq("contact_id", contactId);
        const { data, error } = await sb
          .from("properties")
          .insert({
            contact_id: contactId,
            label: count ? null : "Home",
            street: t.newProperty.street.trim(),
            city: t.newProperty.city.trim(),
            zip: orNull(t.newProperty.zip),
            is_primary: !count,
          })
          .select("id")
          .single();
        fail(error);
        propertyId = s((data as Row).id);
      }
      const { data, error } = await sb
        .from("tickets")
        .insert({
          contact_id: contactId,
          property_id: propertyId,
          title: t.title.trim(),
          trade: orNull(t.trade),
          scope: orNull(t.scope),
          lead_source: orNull(t.leadSource),
          estimated_value: t.estimatedValue,
          stage: t.stage,
          created_by: actorId,
        })
        .select("number")
        .single();
      fail(error);
      return Number((data as Row).number);
    },

    async update(ticketId, patch: TicketPatch) {
      const row: Row = {};
      if (patch.title !== undefined) row.title = patch.title.trim();
      if (patch.trade !== undefined) row.trade = orNull(patch.trade);
      if (patch.scope !== undefined) row.scope = orNull(patch.scope);
      if (patch.leadSource !== undefined) row.lead_source = orNull(patch.leadSource);
      if (patch.estimatedValue !== undefined) row.estimated_value = patch.estimatedValue;
      if (patch.nextActionAt !== undefined) row.next_action_at = patch.nextActionAt;
      if (patch.assignedTo !== undefined) row.assigned_to = patch.assignedTo;
      await touched(sb.from("tickets").update(row).eq("id", ticketId).select("id"));
    },

    async move(ticketId, to, lostReason) {
      const row: Row = { stage: to };
      if (to === "lost") row.lost_reason = lostReason?.trim() ?? "";
      await touched(sb.from("tickets").update(row).eq("id", ticketId).select("id"));
    },

    async addNote(ticketId, text, actorId) {
      const { error } = await sb.from("ticket_events").insert({
        ticket_id: ticketId,
        actor_id: actorId,
        kind: "note",
        data: { text: text.trim() },
      });
      fail(error);
    },
  };
}
