import type { Stage } from "../tickets";
import { displayName, findMatches, normalizeEmail, validateContact, validateProperty } from "./match";
import type { Contact, ContactEvent, ContactInput, ContactSummary, ContactTicket, ContactsBackend, PropertyInput, PropertyRecord } from "./types";

type MemContact = Omit<Contact, "name" | "properties" | "tickets">;
type MemTicket = Omit<ContactTicket, "site"> & { contactId: string };

const day = 86_400_000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * day).toISOString();
const CLOSED: readonly Stage[] = ["paid", "lost"];

/** Same customers, sites and jobs as supabase/seed.sql (and memoryTickets), plus one lookalike record to show duplicate warnings. */
function sample() {
  const person = (id: string, firstName: string, lastName: string, phone: string, email: string, extra: Partial<MemContact> = {}): MemContact => ({
    id,
    firstName,
    lastName,
    company: "",
    phone,
    phoneAlt: "",
    email,
    preferredContact: "phone",
    leadSource: "",
    notes: "",
    isExample: true,
    createdAt: iso(-30),
    updatedAt: iso(-30),
    ...extra,
  });
  const contacts: MemContact[] = [
    person("c1", "Dana", "Whitfield", "(302) 555-0142", "dana.whitfield@example.com", { preferredContact: "text", leadSource: "Google", notes: "Prefers texts after 5 PM." }),
    person("c2", "Marcus", "Reyes", "302-555-0187", "mreyes@example.com", { leadSource: "Referral" }),
    person("c3", "Elaine", "Porter", "302.555.0119", "elaine.porter@example.com", { preferredContact: "email", leadSource: "Repeat customer", notes: "Owns a rental in Rehoboth too." }),
    person("c4", "Tom", "Kowalski", "(302) 555-0163", "", { leadSource: "Yard sign" }),
    person("c5", "D.", "Whitfield", "302-555-0142", "", { notes: "Entered from a voicemail.", createdAt: iso(-3), updatedAt: iso(-3) }),
  ];
  const prop = (id: string, contactId: string, label: string, street: string, city: string, zip: string, county: PropertyRecord["county"], isPrimary: boolean): PropertyRecord => ({
    id,
    contactId,
    label,
    street,
    unit: "",
    city,
    state: "DE",
    zip,
    county,
    accessNotes: "",
    isPrimary,
  });
  const properties: PropertyRecord[] = [
    { ...prop("p1", "c1", "Home", "118 Fox Hall Dr", "Dover", "19904", "Kent", true), accessNotes: "Side gate code 4412. Friendly dog." },
    prop("p2", "c2", "Home", "42 NW Front St", "Milford", "19963", "Sussex", true),
    prop("p3", "c3", "Home", "9 Pilottown Rd", "Lewes", "19958", "Sussex", true),
    prop("p4", "c3", "Rental", "27 Delaware Ave", "Rehoboth Beach", "19971", "Sussex", false),
    prop("p5", "c4", "Home", "310 Walnut Shade Rd", "Camden", "19934", "Kent", true),
  ];
  const ticket = (id: string, number: number, contactId: string, propertyId: string, title: string, trade: string, stage: Stage, estimatedValue: number | null): MemTicket => ({
    id,
    number,
    contactId,
    propertyId,
    title,
    trade,
    stage,
    estimatedValue,
    createdAt: iso(-10),
    stageChangedAt: iso(-2),
    isExample: true,
  });
  const tickets: MemTicket[] = [
    ticket("t1", 1001, "c1", "p1", "Rebuild 12×16 back deck", "Carpentry", "estimate_sent", 12480),
    ticket("t2", 1002, "c2", "p2", "Replace storm-damaged siding", "Siding", "site_visit", null),
    ticket("t3", 1003, "c3", "p4", "Bathroom refresh at rental", "Remodel", "scheduling", 6850),
    ticket("t4", 1004, "c4", "p5", "Fence repair", "Fencing", "lead", null),
    ticket("t5", 1005, "c3", "p3", "Screened porch addition", "Carpentry", "lost", 18900),
  ];
  const events: ContactEvent[] = tickets.flatMap((t) => [
    { id: `e-${t.id}-1`, kind: "created", fromStage: null, toStage: "lead", data: { title: t.title }, actorId: null, createdAt: t.createdAt, ticketNumber: t.number, ticketTitle: t.title },
    ...(t.stage === "lead"
      ? []
      : [
          {
            id: `e-${t.id}-2`,
            kind: "stage_changed" as const,
            fromStage: "lead" as Stage,
            toStage: t.stage,
            data: t.stage === "lost" ? { lost_reason: "Timing: customer postponed to next year." } : {},
            actorId: null,
            createdAt: t.stageChangedAt,
            ticketNumber: t.number,
            ticketTitle: t.title,
          },
        ]),
  ]);
  return { contacts, properties, tickets, events };
}

/** Customers kept in memory for preview mode and tests, following the same rules as the database. */
export function memoryContacts(opts: { empty?: boolean } = {}) {
  const data = opts.empty ? { contacts: [], properties: [], tickets: [], events: [] } : sample();
  const { contacts, properties, tickets, events } = data;
  let n = 0;
  const nextId = (p: string) => `${p}-new-${++n}`;
  const tick = () => new Promise((r) => setTimeout(r, 0));

  const site = (pid: string | null) => {
    const p = properties.find((x) => x.id === pid);
    return p ? `${p.street}, ${p.city}` : "";
  };
  const summary = (c: MemContact): ContactSummary => {
    const theirs = tickets.filter((t) => t.contactId === c.id);
    return {
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      company: c.company,
      name: displayName(c),
      phone: c.phone,
      phoneAlt: c.phoneAlt,
      email: c.email,
      isExample: c.isExample,
      createdAt: c.createdAt,
      places: properties
        .filter((p) => p.contactId === c.id)
        .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
        .map(({ label, street, city, isPrimary }) => ({ label, street, city, isPrimary })),
      ticketCount: theirs.length,
      openTicketCount: theirs.filter((t) => !CLOSED.includes(t.stage)).length,
      lastActivityAt: [c.updatedAt, ...theirs.map((t) => t.stageChangedAt)].reduce((a, b) => (b > a ? b : a)),
    };
  };
  const find = (id: string) => {
    const c = contacts.find((x) => x.id === id);
    if (!c) throw new Error("That customer no longer exists.");
    return c;
  };
  const check = (errs: Record<string, string>) => {
    const first = Object.values(errs)[0];
    if (first) throw new Error(first);
  };
  const clean = (input: ContactInput) => ({
    ...input,
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    company: input.company.trim(),
    phone: input.phone.trim(),
    phoneAlt: input.phoneAlt.trim(),
    email: normalizeEmail(input.email),
    leadSource: input.leadSource.trim(),
    notes: input.notes.trim(),
  });
  const cleanProperty = (p: PropertyInput) => ({
    ...p,
    label: p.label.trim(),
    street: p.street.trim(),
    unit: p.unit.trim(),
    city: p.city.trim(),
    state: p.state.trim().toUpperCase(),
    zip: p.zip.trim(),
    accessNotes: p.accessNotes.trim(),
  });

  const backend: ContactsBackend = {
    async list() {
      await tick();
      return contacts.map(summary);
    },
    async get(id) {
      await tick();
      const c = contacts.find((x) => x.id === id);
      if (!c) return null;
      return {
        ...c,
        name: displayName(c),
        properties: properties.filter((p) => p.contactId === id).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)).map((p) => ({ ...p })),
        tickets: tickets
          .filter((t) => t.contactId === id)
          .map(({ contactId: _, ...t }) => ({ ...t, site: site(t.propertyId) }))
          .sort((a, b) => b.number - a.number),
      };
    },
    async history(contactId) {
      await tick();
      const numbers = new Set(tickets.filter((t) => t.contactId === contactId).map((t) => t.number));
      return events.filter((e) => numbers.has(e.ticketNumber)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async findDuplicates(probe, excludeId) {
      await tick();
      return findMatches(contacts.map(summary), probe, excludeId);
    },
    async create(input, _actorId) {
      await tick();
      check(validateContact(input));
      const id = nextId("c");
      const now = new Date().toISOString();
      contacts.push({ ...clean(input), id, isExample: false, createdAt: now, updatedAt: now });
      return id;
    },
    async update(id, input) {
      await tick();
      check(validateContact(input));
      Object.assign(find(id), clean(input), { updatedAt: new Date().toISOString() });
    },
    async addProperty(contactId, input) {
      await tick();
      find(contactId);
      check(validateProperty(input));
      const theirs = properties.filter((p) => p.contactId === contactId);
      const isPrimary = input.isPrimary || theirs.length === 0;
      if (isPrimary) theirs.forEach((p) => (p.isPrimary = false));
      const id = nextId("p");
      properties.push({ ...cleanProperty(input), id, contactId, isPrimary });
      return id;
    },
    async updateProperty(id, input) {
      await tick();
      const p = properties.find((x) => x.id === id);
      if (!p) throw new Error("That property no longer exists.");
      check(validateProperty(input));
      if (input.isPrimary) properties.filter((x) => x.contactId === p.contactId).forEach((x) => (x.isPrimary = false));
      Object.assign(p, cleanProperty(input));
    },
  };
  return { backend };
}
