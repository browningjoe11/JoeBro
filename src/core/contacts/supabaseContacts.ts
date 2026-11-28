import type { SupabaseClient } from "@supabase/supabase-js";
import type { Stage } from "../tickets";
import { displayName, normalizeEmail, normalizePhone } from "./match";
import type {
  Contact,
  ContactEvent,
  ContactInput,
  ContactMethod,
  ContactSummary,
  ContactTicket,
  ContactsBackend,
  County,
  DuplicateMatch,
  PropertyInput,
  PropertyRecord,
} from "./types";

type Row = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
const orNull = (v: string) => (v.trim() ? v.trim() : null);
const CLOSED: readonly Stage[] = ["paid", "lost"];
const PAGE = 1000;

/** Turns database errors into wording people can act on. */
function fail(error: { message: string } | null): void {
  if (!error) return;
  const m = error.message;
  if (/row-level security|permission denied/i.test(m)) throw new Error("Your role can't make that change.");
  if (/contacts_email_shape/.test(m)) throw new Error("That email address doesn't look right.");
  if (/contacts_has_name/.test(m)) throw new Error("Enter a name or a company.");
  if (/properties_zip_shape/.test(m)) throw new Error("ZIP should be 5 digits.");
  if (/properties_state_code/.test(m)) throw new Error("Use the 2-letter state, like DE.");
  if (/properties_one_primary/.test(m)) throw new Error("Only one property can be the main one. Reload and try again.");
  throw new Error(m);
}

const siteLine = (p: Row | null | undefined) => (p ? [s(p.street), s(p.city)].filter(Boolean).join(", ") : "");
const byPrimary = <T extends { isPrimary: boolean }>(a: T, b: T) => Number(b.isPrimary) - Number(a.isPrimary);

const CONTACT_COLUMNS = "id, first_name, last_name, company, phone, phone_alt, email, is_example, created_at";
const LIST_COLUMNS = `${CONTACT_COLUMNS}, properties(label, street, city, is_primary), tickets(stage, updated_at)`;
const PROPERTY_COLUMNS = "id, contact_id, label, street, unit, city, state, zip, county, access_notes, is_primary";
const DETAIL_COLUMNS =
  `${CONTACT_COLUMNS}, preferred_contact, lead_source, notes, updated_at, properties(${PROPERTY_COLUMNS}), ` +
  "tickets(id, number, title, stage, trade, estimated_value, property_id, created_at, stage_changed_at, is_example, property:properties(street, city))";

function names(r: Row) {
  return { firstName: s(r.first_name), lastName: s(r.last_name), company: s(r.company) };
}

function toProperty(p: Row): PropertyRecord {
  return {
    id: s(p.id),
    contactId: s(p.contact_id),
    label: s(p.label),
    street: s(p.street),
    unit: s(p.unit),
    city: s(p.city),
    state: s(p.state) || "DE",
    zip: s(p.zip),
    county: (s(p.county) as County) || "",
    accessNotes: s(p.access_notes),
    isPrimary: !!p.is_primary,
  };
}

function contactRow(c: ContactInput): Row {
  return {
    first_name: c.firstName.trim(),
    last_name: c.lastName.trim(),
    company: orNull(c.company),
    phone: orNull(c.phone),
    phone_alt: orNull(c.phoneAlt),
    email: orNull(normalizeEmail(c.email)),
    preferred_contact: c.preferredContact,
    lead_source: orNull(c.leadSource),
    notes: orNull(c.notes),
  };
}

function propertyRow(p: PropertyInput): Row {
  return {
    label: orNull(p.label),
    street: p.street.trim(),
    unit: orNull(p.unit),
    city: p.city.trim(),
    state: p.state.trim().toUpperCase() || "DE",
    zip: orNull(p.zip),
    county: p.county || null,
    access_notes: orNull(p.accessNotes),
    is_primary: p.isPrimary,
  };
}

export function supabaseContacts(sb: SupabaseClient): ContactsBackend {
  /** Only one primary property per customer (a unique index), so clear the old one first. */
  async function clearPrimary(contactId: string, exceptId?: string) {
    let q = sb.from("properties").update({ is_primary: false }).eq("contact_id", contactId).eq("is_primary", true);
    if (exceptId) q = q.neq("id", exceptId);
    const { error } = await q;
    fail(error);
  }

  return {
    async list() {
      const rows: Row[] = [];
      // The API returns at most 1000 rows per request; page through the rest.
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await sb
          .from("contacts")
          .select(LIST_COLUMNS)
          .order("last_name")
          .order("first_name")
          .order("id")
          .range(from, from + PAGE - 1);
        fail(error);
        rows.push(...((data ?? []) as Row[]));
        if (!data || data.length < PAGE) break;
      }
      return rows.map<ContactSummary>((r) => {
        const tickets = (r.tickets as Row[]) ?? [];
        const latest = tickets.map((t) => s(t.updated_at)).reduce((a, b) => (b > a ? b : a), s(r.created_at));
        return {
          id: s(r.id),
          ...names(r),
          name: displayName(names(r)),
          phone: s(r.phone),
          phoneAlt: s(r.phone_alt),
          email: s(r.email),
          isExample: !!r.is_example,
          createdAt: s(r.created_at),
          places: ((r.properties as Row[]) ?? [])
            .map((p) => ({ label: s(p.label), street: s(p.street), city: s(p.city), isPrimary: !!p.is_primary }))
            .sort(byPrimary),
          ticketCount: tickets.length,
          openTicketCount: tickets.filter((t) => !CLOSED.includes(t.stage as Stage)).length,
          lastActivityAt: latest,
        };
      });
    },

    async get(id) {
      const { data, error } = await sb.from("contacts").select(DETAIL_COLUMNS).eq("id", id).maybeSingle();
      // A malformed id (someone typed the URL) is "not found", not an error.
      if (error && /invalid input syntax for type uuid/i.test(error.message)) return null;
      fail(error);
      if (!data) return null;
      const r = data as unknown as Row;
      return {
        id: s(r.id),
        ...names(r),
        name: displayName(names(r)),
        phone: s(r.phone),
        phoneAlt: s(r.phone_alt),
        email: s(r.email),
        preferredContact: (s(r.preferred_contact) as ContactMethod) || "phone",
        leadSource: s(r.lead_source),
        notes: s(r.notes),
        isExample: !!r.is_example,
        createdAt: s(r.created_at),
        updatedAt: s(r.updated_at),
        properties: ((r.properties as Row[]) ?? []).map(toProperty).sort(byPrimary),
        tickets: ((r.tickets as Row[]) ?? [])
          .map<ContactTicket>((t) => ({
            id: s(t.id),
            number: Number(t.number),
            title: s(t.title),
            stage: t.stage as Stage,
            trade: s(t.trade),
            estimatedValue: num(t.estimated_value),
            propertyId: (t.property_id as string) ?? null,
            site: siteLine(t.property as Row),
            createdAt: s(t.created_at),
            stageChangedAt: s(t.stage_changed_at),
            isExample: !!t.is_example,
          }))
          .sort((a, b) => b.number - a.number),
      } satisfies Contact;
    },

    async history(contactId) {
      const { data, error } = await sb
        .from("ticket_events")
        .select("id, kind, from_stage, to_stage, data, actor_id, created_at, ticket:tickets!inner(number, title, contact_id)")
        .eq("ticket.contact_id", contactId)
        .order("created_at", { ascending: false })
        .limit(300);
      fail(error);
      return ((data ?? []) as Row[]).map<ContactEvent>((e) => {
        const t = (e.ticket as Row) ?? {};
        return {
          id: s(e.id),
          kind: e.kind as ContactEvent["kind"],
          fromStage: (e.from_stage as Stage) ?? null,
          toStage: (e.to_stage as Stage) ?? null,
          data: (e.data as Record<string, unknown>) ?? {},
          actorId: (e.actor_id as string) ?? null,
          createdAt: s(e.created_at),
          ticketNumber: Number(t.number),
          ticketTitle: s(t.title),
        };
      });
    },

    async findDuplicates(probe, excludeId) {
      const phones = [...new Set([normalizePhone(probe.phone), normalizePhone(probe.phoneAlt)])].filter((p) => p.length >= 7);
      const email = normalizeEmail(probe.email);
      const ors: string[] = phones.map((p) => `phone_digits.eq.${p}`);
      if (/^[^@\s",()]+@[^@\s",()]+\.[^@\s",()]+$/.test(email)) ors.push(`email.eq."${email}"`);
      if (ors.length === 0) return [];
      let q = sb.from("contacts").select("id, first_name, last_name, company, phone, phone_alt, email").or(ors.join(",")).limit(10);
      if (excludeId) q = q.neq("id", excludeId);
      const { data, error } = await q;
      fail(error);
      return ((data ?? []) as Row[]).map<DuplicateMatch>((r) => {
        const reasons: DuplicateMatch["reasons"] = [];
        if (phones.includes(normalizePhone(s(r.phone)))) reasons.push("phone");
        if (email && s(r.email) === email) reasons.push("email");
        return { id: s(r.id), name: displayName(names(r)), phone: s(r.phone), email: s(r.email), reasons: reasons.length ? reasons : ["phone"] };
      });
    },

    async create(input, actorId) {
      const { data, error } = await sb
        .from("contacts")
        .insert({ ...contactRow(input), created_by: actorId })
        .select("id")
        .single();
      fail(error);
      return s((data as Row).id);
    },

    async update(id, input) {
      const { data, error } = await sb.from("contacts").update(contactRow(input)).eq("id", id).select("id");
      fail(error);
      if (!data || data.length === 0) throw new Error("Your role can't make that change.");
    },

    async addProperty(contactId, input) {
      const { count } = await sb.from("properties").select("id", { count: "exact", head: true }).eq("contact_id", contactId);
      const primary = input.isPrimary || !count;
      if (primary && count) await clearPrimary(contactId);
      const { data, error } = await sb
        .from("properties")
        .insert({ ...propertyRow({ ...input, isPrimary: primary }), contact_id: contactId })
        .select("id")
        .single();
      fail(error);
      return s((data as Row).id);
    },

    async updateProperty(id, input) {
      if (input.isPrimary) {
        const { data, error } = await sb.from("properties").select("contact_id").eq("id", id).single();
        fail(error);
        await clearPrimary(s((data as Row).contact_id), id);
      }
      const { data, error } = await sb.from("properties").update(propertyRow(input)).eq("id", id).select("id");
      fail(error);
      if (!data || data.length === 0) throw new Error("Your role can't make that change.");
    },
  };
}
