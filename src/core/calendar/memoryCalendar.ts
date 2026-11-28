import { addDays, startOfWeek } from "./time";
import type { CalendarBackend, CalendarEvent, NewCalendarEvent } from "./types";

/** Ticket details the in-memory calendar can show for linked events (matches the sample tickets). */
const SAMPLE_TICKETS: Record<string, { number: number; title: string; propertyId: string; street: string; city: string; zip: string }> = {
  t1: { number: 1001, title: "Rebuild 12×16 back deck", propertyId: "p1", street: "118 Fox Hall Dr", city: "Dover", zip: "19904" },
  t2: { number: 1002, title: "Replace storm-damaged siding", propertyId: "p2", street: "42 NW Front St", city: "Milford", zip: "19963" },
  t3: { number: 1003, title: "Bathroom refresh at rental", propertyId: "p4", street: "27 Delaware Ave", city: "Rehoboth Beach", zip: "19971" },
  t4: { number: 1004, title: "Fence repair", propertyId: "p5", street: "310 Walnut Shade Rd", city: "Camden", zip: "19934" },
  t5: { number: 1005, title: "Screened porch addition", propertyId: "p3", street: "9 Pilottown Rd", city: "Lewes", zip: "19958" },
};

/** The sample remodel crew in memoryCrews (supabase/seed.sql uses a uuid). */
const REMODEL_CREW = "crew-remodel";

/** Same bookings as supabase/seed.sql, placed in the current week. */
function sample(): CalendarEvent[] {
  const monday = startOfWeek(new Date());
  const at = (day: number, hour: number) => {
    const d = addDays(monday, day);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  };
  const base = { crewId: null, assignedTo: null, color: null, isExample: true, notes: "" } as const;
  const rows: (Omit<CalendarEvent, "ticketLabel" | "ticketNumber" | "site" | "place"> & { ticketId: string | null })[] = [
    { ...base, id: "ev1", kind: "other", status: "confirmed", title: "Supplier pickup at lumber yard", start: at(0, 7), end: at(0, 8), ticketId: null, notes: "Composite boards for the deck." },
    { ...base, id: "ev2", kind: "site_visit", status: "confirmed", title: "Site visit: storm-damaged siding", start: at(1, 9), end: at(1, 10), ticketId: "t2", notes: "Measure the north wall." },
    { ...base, id: "ev3", kind: "job", status: "tentative", title: "Bathroom refresh at rental", start: at(2, 8), end: at(2, 16), ticketId: "t3", crewId: REMODEL_CREW, notes: "Pencilled in, waiting on vanity delivery." },
    { ...base, id: "ev4", kind: "job", status: "tentative", title: "Bathroom refresh at rental", start: at(3, 8), end: at(3, 12), ticketId: "t3", crewId: REMODEL_CREW },
    { ...base, id: "ev5", kind: "site_visit", status: "confirmed", title: "Site visit: fence repair", start: at(3, 13), end: at(3, 14), ticketId: "t4" },
  ];
  return rows.map(withTicket);
}

function withTicket<T extends { ticketId: string | null }>(e: T): T & Pick<CalendarEvent, "ticketLabel" | "ticketNumber" | "site" | "place"> {
  const t = e.ticketId ? SAMPLE_TICKETS[e.ticketId] : undefined;
  return {
    ...e,
    ticketLabel: t ? `#${t.number} ${t.title}` : "",
    ticketNumber: t?.number ?? null,
    site: t ? `${t.street}, ${t.city}` : "",
    // Like a fresh database row: the address is known, its map position is looked up by the map.
    place: t ? { propertyId: t.propertyId, street: t.street, city: t.city, state: "DE", zip: t.zip, lat: null, lng: null } : null,
  };
}

function check(e: { title: string; start: string; end: string }) {
  if (!e.title.trim()) throw new Error("Give the booking a short title.");
  if (new Date(e.end) <= new Date(e.start)) throw new Error("The end time must be after the start.");
}

/** Calendar kept in memory for preview mode and tests. Follows the same rules as the database. */
export function memoryCalendar(opts: { empty?: boolean } = {}) {
  let events: CalendarEvent[] = opts.empty ? [] : sample();
  let n = 0;
  const tick = () => new Promise((r) => setTimeout(r, 0));

  const backend: CalendarBackend = {
    async list(from, to) {
      await tick();
      return events
        .filter((e) => new Date(e.start) < to && new Date(e.end) > from)
        .map((e) => ({ ...e }))
        .sort((a, b) => a.start.localeCompare(b.start));
    },
    async forTickets(ids) {
      await tick();
      return events
        .filter((e) => e.ticketId !== null && ids.includes(e.ticketId))
        .map((e) => ({ ...e }))
        .sort((a, b) => a.start.localeCompare(b.start));
    },
    async create(input: NewCalendarEvent) {
      await tick();
      check(input);
      const e = withTicket({
        id: `ev-new-${++n}`,
        kind: input.kind,
        status: input.status,
        title: input.title.trim(),
        start: input.start,
        end: input.end,
        ticketId: input.ticketId ?? null,
        crewId: input.crewId ?? null,
        assignedTo: input.assignedTo ?? null,
        color: input.color ?? null,
        notes: input.notes?.trim() ?? "",
        isExample: false,
      });
      events = [...events, e];
      return { ...e };
    },
    async update(id, patch) {
      await tick();
      const old = events.find((e) => e.id === id);
      if (!old) throw new Error("That booking no longer exists. Reload and try again.");
      const next = withTicket({ ...old, ...patch, title: (patch.title ?? old.title).trim() });
      check(next);
      events = events.map((e) => (e.id === id ? next : e));
      return { ...next };
    },
    async remove(id) {
      await tick();
      events = events.filter((e) => e.id !== id);
    },
  };
  return { backend, all: () => events.map((e) => ({ ...e })) };
}
