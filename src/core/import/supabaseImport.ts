import type { SupabaseClient } from "@supabase/supabase-js";
import { CRM_IMPORT_SOURCE } from "./types";
import type { ApplyFailure, ImportAction, ImportBackend, ImportSnapshot, SnapshotContact, SnapshotLink, SnapshotProperty } from "./types";

type Row = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" ? v : "");
const PAGE = 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(error: { message: string; code?: string } | null): void {
  if (!error) return;
  const m = error.message;
  if (/row-level security|permission denied|Only an admin/i.test(m)) throw new Error("Only an admin can import.");
  throw new Error(m);
}

const orNull = (v: string) => (v.trim() ? v.trim() : null);

async function pages(sb: SupabaseClient, table: string, columns: string, eq: Record<string, string> = {}, notNull = ""): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = sb.from(table).select(columns);
    for (const [key, value] of Object.entries(eq)) query = query.eq(key, value);
    if (notNull) query = query.not(notNull, "is", null);
    const { data, error } = await query.range(from, from + PAGE - 1);
    fail(error);
    rows.push(...((data ?? []) as unknown as Row[]));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

/** Writes the import through the signed-in admin's Supabase session. Row-level security still applies. */
export function supabaseImport(sb: SupabaseClient): ImportBackend {
  return {
    async snapshot(): Promise<ImportSnapshot> {
      const [contacts, properties, links, tickets, notes] = await Promise.all([
        pages(sb, "contacts", "id, first_name, last_name, company, phone, phone_alt, email, import_key"),
        pages(sb, "properties", "id, contact_id, street, city, zip, unit, is_primary, import_key"),
        pages(sb, "import_links", "entity, import_key, record_id", { source: CRM_IMPORT_SOURCE }),
        pages(sb, "tickets", "import_key", { import_source: CRM_IMPORT_SOURCE }, "import_key"),
        pages(sb, "ticket_events", "import_key", { import_source: CRM_IMPORT_SOURCE }, "import_key"),
      ]);
      return {
        contacts: contacts.map((c): SnapshotContact => ({
          id: s(c.id),
          firstName: s(c.first_name),
          lastName: s(c.last_name),
          company: s(c.company),
          name: `${s(c.first_name)} ${s(c.last_name)}`.trim() || s(c.company),
          phone: s(c.phone),
          phoneAlt: s(c.phone_alt),
          email: s(c.email),
          importKey: s(c.import_key) || null,
        })),
        properties: properties.map((p): SnapshotProperty => ({
          id: s(p.id),
          contactId: s(p.contact_id),
          street: s(p.street),
          city: s(p.city),
          zip: s(p.zip),
          unit: s(p.unit),
          isPrimary: !!p.is_primary,
          importKey: s(p.import_key) || null,
        })),
        ticketKeys: tickets.map((t) => s(t.import_key)).filter(Boolean),
        noteKeys: notes.map((n) => s(n.import_key)).filter(Boolean),
        links: links.map((l): SnapshotLink => ({
          entity: s(l.entity) as SnapshotLink["entity"],
          importKey: s(l.import_key),
          recordId: s(l.record_id),
        })),
      };
    },

    async apply(actions: ImportAction[], actorId: string | null): Promise<ApplyFailure[]> {
      const actor = actorId && UUID.test(actorId) ? actorId : null;
      const contacts = new Map<string, string>();
      const properties = new Map<string, string>();
      const tickets = new Map<string, string>();
      const failures: ApplyFailure[] = [];
      const record = (op: ApplyFailure["op"], key: string, err: { message: string }) => {
        failures.push({ op, key, message: /row-level security|Only an admin/i.test(err.message) ? "Only an admin can import." : err.message });
      };

      async function lookup(table: string, key: string): Promise<string | null> {
        const { data, error } = await sb.from(table).select("id").eq("import_source", CRM_IMPORT_SOURCE).eq("import_key", key).maybeSingle();
        if (error) return null;
        return data ? s((data as Row).id) : null;
      }

      async function link(entity: string, key: string, recordId: string, matchedExisting: boolean) {
        const { error } = await sb.from("import_links").insert({
          source: CRM_IMPORT_SOURCE,
          entity,
          import_key: key,
          record_id: recordId,
          matched_existing: matchedExisting,
        });
        if (error && error.code !== "23505") record(entity as ApplyFailure["op"], key, error);
      }

      for (const action of actions) {
        if (action.op === "contact" && action.mode === "match") {
          const recordId = action.recordId.startsWith("new:") ? contacts.get(action.recordId.slice(4)) ?? action.recordId : action.recordId;
          contacts.set(action.key, recordId);
          await link("contact", action.key, recordId, true);
        } else if (action.op === "contact" && action.mode === "create") {
          const fields = action.fields;
          const { data, error } = await sb
            .from("contacts")
            .insert({
              first_name: fields.firstName,
              last_name: fields.lastName,
              company: orNull(fields.company),
              phone: orNull(fields.phone),
              phone_alt: orNull(fields.phoneAlt),
              email: orNull(fields.email),
              preferred_contact: fields.preferredContact,
              lead_source: orNull(fields.leadSource),
              notes: orNull(fields.notes),
              import_source: CRM_IMPORT_SOURCE,
              import_key: action.key,
              created_by: actor,
            })
            .select("id")
            .single();
          let id = data ? s((data as Row).id) : "";
          if (error?.code === "23505") id = (await lookup("contacts", action.key)) ?? "";
          else if (error) {
            record("contact", action.key, error);
            continue;
          }
          if (!id) continue;
          contacts.set(action.key, id);
          await link("contact", action.key, id, false);
        } else if (action.op === "property" && action.mode === "match") {
          const recordId = action.recordId.startsWith("new:") ? properties.get(action.recordId.slice(4)) ?? action.recordId : action.recordId;
          properties.set(action.key, recordId);
          await link("property", action.key, recordId, true);
        } else if (action.op === "property" && action.mode === "create") {
          const contactId = contacts.get(action.contactKey);
          if (!contactId) {
            failures.push({ op: "property", key: action.key, message: "The customer for this property was not imported." });
            continue;
          }
          const f = action.fields;
          const { data, error } = await sb
            .from("properties")
            .insert({
              contact_id: contactId,
              label: orNull(f.label),
              street: f.street,
              unit: orNull(f.unit),
              city: f.city,
              state: f.state,
              zip: orNull(f.zip),
              county: f.county || null,
              access_notes: orNull(f.accessNotes),
              is_primary: f.isPrimary,
              import_source: CRM_IMPORT_SOURCE,
              import_key: action.key,
            })
            .select("id")
            .single();
          let id = data ? s((data as Row).id) : "";
          if (error?.code === "23505") id = (await lookup("properties", action.key)) ?? "";
          else if (error) {
            record("property", action.key, error);
            continue;
          }
          if (!id) continue;
          properties.set(action.key, id);
          await link("property", action.key, id, false);
        } else if (action.op === "ticket") {
          const contactId = contacts.get(action.contactKey);
          if (!contactId) {
            failures.push({ op: "ticket", key: action.key, message: "The customer for this job was not imported." });
            continue;
          }
          const f = action.fields;
          const { data, error } = await sb
            .from("tickets")
            .insert({
              contact_id: contactId,
              property_id: action.propertyKey ? properties.get(action.propertyKey) ?? null : null,
              title: f.title,
              trade: orNull(f.trade),
              scope: orNull(f.scope),
              stage: f.stage,
              lost_reason: f.stage === "lost" ? f.lostReason : orNull(f.lostReason),
              lead_source: orNull(f.leadSource),
              estimated_value: f.estimatedValue,
              import_source: CRM_IMPORT_SOURCE,
              import_key: action.key,
              created_by: actor,
            })
            .select("id")
            .single();
          let id = data ? s((data as Row).id) : "";
          if (error?.code === "23505") id = (await lookup("tickets", action.key)) ?? "";
          else if (error) {
            record("ticket", action.key, error);
            continue;
          }
          if (!id) continue;
          tickets.set(action.key, id);
          await link("ticket", action.key, id, false);
        } else if (action.op === "note") {
          const ticketId = tickets.get(action.ticketKey);
          if (!ticketId) {
            failures.push({ op: "note", key: action.key, message: "The job for this note was not imported." });
            continue;
          }
          const row: Row = {
            ticket_id: ticketId,
            kind: "note",
            data: { text: action.text },
            actor_id: null,
            import_source: CRM_IMPORT_SOURCE,
            import_key: action.key,
          };
          if (action.createdAt) row.created_at = action.createdAt;
          const { data, error } = await sb.from("ticket_events").insert(row).select("id").single();
          if (error?.code === "23505") continue;
          if (error) {
            record("note", action.key, error);
            continue;
          }
          const id = data ? s((data as Row).id) : "";
          if (id) await link("note", action.key, id, false);
        }
      }
      return failures;
    },
  };
}
