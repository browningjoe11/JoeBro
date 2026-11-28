import { DEFAULT_TRANSITIONS, START_STAGES, type Stage } from "./stages";
import type { ContactOption, Person, Ticket, TicketEvent, TicketPatch, TicketsBackend } from "./types";

interface MemContact {
  id: string;
  name: string;
  phone: string;
  email: string;
}
interface MemProperty {
  id: string;
  contactId: string;
  label: string;
  street: string;
  city: string;
  isPrimary: boolean;
}

const day = 86_400_000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * day).toISOString();

/** Same people, sites and jobs as supabase/seed.sql, so preview mode looks like the sample data. */
function sample() {
  const contacts: MemContact[] = [
    {
      id: "c1",
      name: "Dana Whitfield",
      phone: "(302) 555-0142",
      email: "dana.whitfield@example.com",
    },
    {
      id: "c2",
      name: "Marcus Reyes",
      phone: "302-555-0187",
      email: "mreyes@example.com",
    },
    {
      id: "c3",
      name: "Elaine Porter",
      phone: "302.555.0119",
      email: "elaine.porter@example.com",
    },
    { id: "c4", name: "Tom Kowalski", phone: "(302) 555-0163", email: "" },
  ];
  const properties: MemProperty[] = [
    {
      id: "p1",
      contactId: "c1",
      label: "Home",
      street: "118 Fox Hall Dr",
      city: "Dover",
      isPrimary: true,
    },
    {
      id: "p2",
      contactId: "c2",
      label: "Home",
      street: "42 NW Front St",
      city: "Milford",
      isPrimary: true,
    },
    {
      id: "p3",
      contactId: "c3",
      label: "Home",
      street: "9 Pilottown Rd",
      city: "Lewes",
      isPrimary: true,
    },
    {
      id: "p4",
      contactId: "c3",
      label: "Rental",
      street: "27 Delaware Ave",
      city: "Rehoboth Beach",
      isPrimary: false,
    },
    {
      id: "p5",
      contactId: "c4",
      label: "Home",
      street: "310 Walnut Shade Rd",
      city: "Camden",
      isPrimary: true,
    },
  ];
  type Row = Omit<Ticket, "customer" | "site" | "phone" | "email">;
  const base = {
    assignedTo: null,
    isExample: true,
    lostReason: "",
    createdAt: iso(-10),
    stageChangedAt: iso(-2),
  };
  const tickets: Row[] = [
    {
      ...base,
      id: "t1",
      number: 1001,
      contactId: "c1",
      propertyId: "p1",
      title: "Rebuild 12×16 back deck",
      trade: "Carpentry",
      scope: "Remove existing deck boards and rebuild 12×16 deck with composite boards on new joists.",
      stage: "estimate_sent",
      leadSource: "Google",
      estimatedValue: 12480,
      nextActionAt: iso(2),
    },
    {
      ...base,
      id: "t2",
      number: 1002,
      contactId: "c2",
      propertyId: "p2",
      title: "Replace storm-damaged siding",
      trade: "Siding",
      scope: "Replace about 300 sq ft of vinyl siding on the north wall and wrap two windows.",
      stage: "site_visit",
      leadSource: "Referral",
      estimatedValue: null,
      nextActionAt: iso(1),
    },
    {
      ...base,
      id: "t3",
      number: 1003,
      contactId: "c3",
      propertyId: "p4",
      title: "Bathroom refresh at rental",
      trade: "Remodel",
      scope: "New vanity, toilet, LVP flooring and paint in the hall bathroom.",
      stage: "scheduling",
      leadSource: "Repeat customer",
      estimatedValue: 6850,
      nextActionAt: iso(3),
    },
    {
      ...base,
      id: "t4",
      number: 1004,
      contactId: "c4",
      propertyId: "p5",
      title: "Fence repair",
      trade: "Fencing",
      scope: "Replace six rotted fence pickets and one post.",
      stage: "lead",
      leadSource: "Yard sign",
      estimatedValue: null,
      nextActionAt: iso(0),
    },
    {
      ...base,
      id: "t5",
      number: 1005,
      contactId: "c3",
      propertyId: "p3",
      title: "Screened porch addition",
      trade: "Carpentry",
      scope: "Screened porch on existing patio.",
      stage: "lost",
      leadSource: "Repeat customer",
      estimatedValue: 18900,
      nextActionAt: null,
      lostReason: "Timing: customer postponed to next year.",
    },
  ];
  return { contacts, properties, tickets };
}

const LOGGED: [keyof TicketPatch, string][] = [
  ["title", "title"],
  ["scope", "scope"],
  ["trade", "trade"],
  ["assignedTo", "assigned_to"],
  ["estimatedValue", "estimated_value"],
  ["nextActionAt", "next_action_at"],
];

/**
 * Tickets kept in memory for preview mode and tests. Follows the same rules as
 * the database triggers: allowed stage moves only, a reason to mark lost, and
 * every change written to the timeline.
 */
export function memoryTickets(opts: { empty?: boolean; people?: Person[] } = {}) {
  const data = opts.empty ? { contacts: [], properties: [], tickets: [] } : sample();
  const { contacts, properties } = data;
  let tickets = data.tickets;
  type MemEvent = TicketEvent & { ticketId: string };
  const events: MemEvent[] = [];
  const people: Person[] = opts.people ?? [{ id: "preview-admin", name: "Preview admin", role: "admin", active: true }];
  let n = 0;
  const nextId = (p: string) => `${p}-${++n}`;
  let nextNumber = 1001 + tickets.length;
  const tick = () => new Promise((r) => setTimeout(r, 0));
  // Preview mode has nobody signed in; credit changes to the first sample person.
  const actor = (id?: string | null) => id ?? people[0]?.id ?? null;

  const log = (e: Omit<MemEvent, "id" | "createdAt">) => events.push({ ...e, id: nextId("e"), createdAt: new Date().toISOString() });
  tickets.forEach((t) =>
    log({
      kind: "created",
      ticketId: t.id,
      fromStage: null,
      toStage: t.stage,
      data: { title: t.title },
      actorId: null,
    }),
  );

  const site = (pid: string | null) => {
    const p = properties.find((x) => x.id === pid);
    return p ? `${p.street}, ${p.city}` : "";
  };
  const full = (t: (typeof tickets)[number]): Ticket => {
    const c = contacts.find((x) => x.id === t.contactId)!;
    return {
      ...t,
      customer: c.name,
      phone: c.phone,
      email: c.email,
      site: site(t.propertyId),
    };
  };
  const find = (id: string) => {
    const t = tickets.find((x) => x.id === id);
    if (!t) throw new Error("That ticket no longer exists.");
    return t;
  };

  const backend: TicketsBackend = {
    async list() {
      await tick();
      return tickets.map(full).sort((a, b) => b.number - a.number);
    },
    async get(number) {
      await tick();
      const t = tickets.find((x) => x.number === number);
      return t ? full(t) : null;
    },
    async events(ticketId) {
      await tick();
      return events
        .filter((e) => e.ticketId === ticketId)
        .map(({ ticketId: _, ...e }) => e)
        .reverse();
    },
    async transitions() {
      return [...DEFAULT_TRANSITIONS];
    },
    async people() {
      return people.map((p) => ({ ...p }));
    },
    async searchContacts(query) {
      await tick();
      const q = query.trim().toLowerCase();
      const digits = q.replace(/\D/g, "");
      return contacts
        .filter(
          (c) => !q || c.name.toLowerCase().includes(q) || c.email.includes(q) || (digits.length >= 3 && c.phone.replace(/\D/g, "").includes(digits)),
        )
        .slice(0, 8)
        .map<ContactOption>((c) => ({
          ...c,
          properties: properties
            .filter((p) => p.contactId === c.id)
            .map((p) => ({
              id: p.id,
              label: `${p.label} · ${p.street}, ${p.city}`,
              isPrimary: p.isPrimary,
            })),
        }));
    },
    async create(input, actorId) {
      await tick();
      if (!input.title.trim()) throw new Error("Give the ticket a short title.");
      if (!START_STAGES.includes(input.stage)) throw new Error("New tickets start at Lead, Site visit or Estimating.");
      let contactId = input.contactId;
      if (!contactId) {
        const c = input.newContact;
        const name = `${c?.firstName ?? ""} ${c?.lastName ?? ""}`.trim();
        if (!name) throw new Error("Pick a customer or enter a name.");
        contactId = nextId("c");
        contacts.push({
          id: contactId,
          name,
          phone: c?.phone.trim() ?? "",
          email: c?.email.trim().toLowerCase() ?? "",
        });
      }
      let propertyId = input.propertyId ?? null;
      if (!propertyId && input.newProperty?.street.trim()) {
        propertyId = nextId("p");
        const first = !properties.some((p) => p.contactId === contactId);
        properties.push({
          id: propertyId,
          contactId,
          label: first ? "Home" : "",
          street: input.newProperty.street.trim(),
          city: input.newProperty.city.trim(),
          isPrimary: first,
        });
      }
      const t = {
        id: nextId("t"),
        number: nextNumber++,
        contactId,
        propertyId,
        title: input.title.trim(),
        trade: input.trade,
        scope: input.scope.trim(),
        stage: input.stage,
        leadSource: input.leadSource,
        estimatedValue: input.estimatedValue,
        nextActionAt: null,
        assignedTo: null,
        isExample: false,
        lostReason: "",
        createdAt: new Date().toISOString(),
        stageChangedAt: new Date().toISOString(),
      };
      tickets = [...tickets, t];
      log({
        ticketId: t.id,
        kind: "created",
        fromStage: null,
        toStage: t.stage,
        data: { title: t.title },
        actorId: actor(actorId),
      });
      return t.number;
    },
    async update(ticketId, patch) {
      await tick();
      const t = find(ticketId);
      if (patch.title !== undefined && !patch.title.trim()) throw new Error("Give the ticket a short title.");
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      for (const [key, col] of LOGGED) {
        if (patch[key] !== undefined && patch[key] !== t[key]) changes[col] = { from: t[key], to: patch[key] };
      }
      Object.assign(t, patch);
      if (Object.keys(changes).length)
        log({
          ticketId,
          kind: "updated",
          fromStage: null,
          toStage: null,
          data: changes,
          actorId: actor(),
        });
    },
    async move(ticketId, to: Stage, lostReason) {
      await tick();
      const t = find(ticketId);
      if (!DEFAULT_TRANSITIONS.some((x) => x.from === t.stage && x.to === to)) throw new Error("That move isn't allowed from this stage.");
      if (to === "lost" && !lostReason?.trim()) throw new Error("Say why the job was lost.");
      const from = t.stage;
      t.stage = to;
      t.stageChangedAt = new Date().toISOString();
      t.lostReason = to === "lost" ? lostReason!.trim() : from === "lost" ? "" : t.lostReason;
      log({
        ticketId,
        kind: "stage_changed",
        fromStage: from,
        toStage: to,
        data: to === "lost" ? { lost_reason: t.lostReason } : {},
        actorId: actor(),
      });
    },
    async addNote(ticketId, text, actorId) {
      await tick();
      find(ticketId);
      if (!text.trim()) throw new Error("Write a note first.");
      log({
        ticketId,
        kind: "note",
        fromStage: null,
        toStage: null,
        data: { text: text.trim() },
        actorId: actor(actorId),
      });
    },
  };
  return { backend };
}
