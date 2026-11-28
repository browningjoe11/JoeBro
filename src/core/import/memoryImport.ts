import { displayName } from "../contacts";
import { CRM_IMPORT_SOURCE } from "./types";
import type { ApplyFailure, ImportAction, ImportBackend, ImportSnapshot, SnapshotContact, SnapshotProperty } from "./types";

interface MemContact extends SnapshotContact {
  phoneAlt: string;
  preferredContact: string;
  leadSource: string;
  notes: string;
  importSource: string | null;
}

interface MemProperty extends SnapshotProperty {
  label: string;
  state: string;
  county: string;
  accessNotes: string;
  importSource: string | null;
}

interface MemTicket {
  id: string;
  contactId: string;
  propertyId: string | null;
  title: string;
  trade: string;
  scope: string;
  stage: string;
  lostReason: string;
  leadSource: string;
  estimatedValue: number | null;
  importSource: string | null;
  importKey: string;
}

interface MemNote {
  id: string;
  ticketId: string;
  text: string;
  createdAt: string | null;
  importSource: string;
  importKey: string;
}

interface MemLink {
  entity: "contact" | "property" | "ticket" | "note";
  importKey: string;
  recordId: string;
  matchedExisting: boolean;
}

export interface MemoryImportData {
  contacts: MemContact[];
  properties: MemProperty[];
  tickets: MemTicket[];
  notes: MemNote[];
  links: MemLink[];
}

/** Customers already in the app, for a dedupe test or a preview. All fields optional except a name. */
export interface SeedContact {
  id: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  phone?: string;
  phoneAlt?: string;
  email?: string;
  importKey?: string | null;
}

/**
 * In-memory stand-in for the import tables. Starts empty unless `seed` is passed.
 * The same rules as the database: a second apply of the same keys adds nothing.
 */
export function memoryImport(seed: SeedContact[] = []) {
  let n = 0;
  const nextId = () => `imp-${++n}`;
  const data: MemoryImportData = {
    contacts: seed.map((c) => ({
      id: c.id,
      firstName: c.firstName ?? "",
      lastName: c.lastName ?? "",
      company: c.company ?? "",
      name: displayName({ firstName: c.firstName ?? "", lastName: c.lastName ?? "", company: c.company ?? "" }),
      phone: c.phone ?? "",
      phoneAlt: c.phoneAlt ?? "",
      email: (c.email ?? "").trim().toLowerCase(),
      importKey: c.importKey ?? null,
      preferredContact: "phone",
      leadSource: "",
      notes: "",
      importSource: c.importKey ? CRM_IMPORT_SOURCE : null,
    })),
    properties: [],
    tickets: [],
    notes: [],
    links: [],
  };

  const snapshot = (): ImportSnapshot => ({
    contacts: data.contacts.map((c) => ({
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      company: c.company,
      name: c.name,
      phone: c.phone,
      phoneAlt: c.phoneAlt,
      email: c.email,
      importKey: c.importKey,
    })),
    properties: data.properties.map((p) => ({
      id: p.id,
      contactId: p.contactId,
      street: p.street,
      city: p.city,
      zip: p.zip,
      unit: p.unit,
      isPrimary: p.isPrimary,
      importKey: p.importKey,
    })),
    ticketKeys: data.tickets.map((t) => t.importKey),
    noteKeys: data.notes.map((note) => note.importKey),
    links: data.links.map(({ entity, importKey, recordId }) => ({ entity, importKey, recordId })),
  });

  const link = (entity: MemLink["entity"], importKey: string, recordId: string, matchedExisting: boolean) => {
    if (data.links.some((l) => l.entity === entity && l.importKey === importKey)) return;
    data.links.push({ entity, importKey, recordId, matchedExisting });
  };

  const backend: ImportBackend = {
    async snapshot() {
      return snapshot();
    },
    async apply(actions: ImportAction[]): Promise<ApplyFailure[]> {
      const byKey = new Map<string, string>();
      for (const l of data.links) if (l.entity === "contact") byKey.set(l.importKey, l.recordId);
      for (const c of data.contacts) if (c.importKey) byKey.set(c.importKey, c.id);
      const properties = new Map<string, string>();
      for (const l of data.links) if (l.entity === "property") properties.set(l.importKey, l.recordId);
      const tickets = new Map<string, string>();
      for (const t of data.tickets) tickets.set(t.importKey, t.id);
      const failures: ApplyFailure[] = [];
      const fail = (op: ApplyFailure["op"], key: string, message: string) => failures.push({ op, key, message });

      for (const action of actions) {
        if (action.op === "contact" && action.mode === "match") {
          const recordId = action.recordId.startsWith("new:") ? byKey.get(action.recordId.slice(4)) ?? action.recordId : action.recordId;
          link("contact", action.key, recordId, true);
          byKey.set(action.key, recordId);
        } else if (action.op === "contact" && action.mode === "create") {
          if (byKey.has(action.key)) continue;
          const id = nextId();
          const fields = action.fields;
          data.contacts.push({
            id,
            ...fields,
            email: fields.email.toLowerCase(),
            name: displayName(fields),
            importKey: action.key,
            importSource: CRM_IMPORT_SOURCE,
          });
          link("contact", action.key, id, false);
          byKey.set(action.key, id);
        } else if (action.op === "property" && action.mode === "match") {
          const recordId = action.recordId.startsWith("new:") ? properties.get(action.recordId.slice(4)) ?? action.recordId : action.recordId;
          link("property", action.key, recordId, true);
          properties.set(action.key, recordId);
        } else if (action.op === "property" && action.mode === "create") {
          if (properties.has(action.key)) continue;
          const contactId = byKey.get(action.contactKey);
          if (!contactId) {
            fail("property", action.key, "The customer for this property was not imported.");
            continue;
          }
          const id = nextId();
          data.properties.push({
            id,
            contactId,
            ...action.fields,
            importKey: action.key,
            importSource: CRM_IMPORT_SOURCE,
          });
          link("property", action.key, id, false);
          properties.set(action.key, id);
        } else if (action.op === "ticket" && action.mode === "create") {
          if (tickets.has(action.key)) continue;
          const contactId = byKey.get(action.contactKey);
          if (!contactId) {
            fail("ticket", action.key, "The customer for this job was not imported.");
            continue;
          }
          const id = nextId();
          data.tickets.push({
            id,
            contactId,
            propertyId: action.propertyKey ? properties.get(action.propertyKey) ?? null : null,
            ...action.fields,
            importSource: CRM_IMPORT_SOURCE,
            importKey: action.key,
          });
          link("ticket", action.key, id, false);
          tickets.set(action.key, id);
        } else if (action.op === "note") {
          const ticketId = tickets.get(action.ticketKey);
          if (!ticketId) {
            fail("note", action.key, "The job for this note was not imported.");
            continue;
          }
          if (data.notes.some((note) => note.importKey === action.key)) continue;
          data.notes.push({
            id: nextId(),
            ticketId,
            text: action.text,
            createdAt: action.createdAt,
            importSource: CRM_IMPORT_SOURCE,
            importKey: action.key,
          });
          link("note", action.key, data.notes[data.notes.length - 1].id, false);
        }
      }
      return failures;
    },
  };

  return { backend, data };
}
