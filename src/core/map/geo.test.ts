import type { CalendarEvent } from "../calendar";
import type { Crew } from "../crews";
import { addressKey, addressLine, boundsOf, crewDays, needsLookup, nominatimUrl, parseNominatim, stopColor } from "./geo";
import { nominatimLocator } from "./nominatim";

const crew = (id: string, name: string, color: Crew["color"]): Crew => ({ id, name, color, skills: [], workDays: [1, 2, 3, 4, 5], dayStart: "07:00", dayEnd: "15:30", active: true, notes: "", isExample: false }) as unknown as Crew;
const DECK = crew("deck", "Deck crew", "orange");
const SIDING = crew("siding", "Siding crew", "purple");

const place = (propertyId: string, street: string, lat: number | null = null, lng: number | null = null) => ({ propertyId, street, city: "Dover", state: "DE", zip: "19904", lat, lng });
function ev(id: string, start: string, over: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id, kind: "job", status: "confirmed", title: `Job ${id}`, start: new Date(start).toISOString(), end: new Date(new Date(start).getTime() + 3_600_000).toISOString(),
    ticketId: `t-${id}`, ticketLabel: `#1 Job ${id}`, ticketNumber: 1, site: "", crewId: null, assignedTo: null, color: null, notes: "", isExample: false,
    place: place(`p-${id}`, `${id} Main St`), ...over,
  };
}

describe("addresses", () => {
  const a = { street: " 118 Fox Hall Dr ", city: "Dover", state: "DE", zip: "19904" };
  it("writes one line and a normalized key", () => {
    expect(addressLine(a)).toBe("118 Fox Hall Dr, Dover, DE 19904");
    expect(addressKey({ ...a, street: "118  FOX hall dr" })).toBe("118 fox hall dr, dover, de 19904");
  });
  it("builds a structured Nominatim search limited to the US", () => {
    const url = new URL(nominatimUrl({ ...a, zip: "19904-1234" }));
    expect(url.host).toBe("nominatim.openstreetmap.org");
    expect(url.searchParams.get("street")).toBe("118 Fox Hall Dr");
    expect(url.searchParams.get("postalcode")).toBe("19904");
    expect(url.searchParams.get("countrycodes")).toBe("us");
    expect(url.searchParams.get("limit")).toBe("1");
  });
  it("reads the first result and rejects empty or bad answers", () => {
    expect(parseNominatim([{ lat: "39.17", lon: "-75.54" }])).toEqual({ lat: 39.17, lng: -75.54 });
    expect(parseNominatim([])).toBeNull();
    expect(parseNominatim({ error: "x" })).toBeNull();
    expect(parseNominatim([{ lat: "abc", lon: "1" }])).toBeNull();
  });
});

describe("crewDays", () => {
  const day = new Date("2026-12-02T00:00:00");
  it("groups a day's job-site bookings by crew in crew order, numbers them by time, and puts No crew last", () => {
    const events = [
      ev("a", "2026-12-02T13:00:00", { crewId: "deck" }),
      ev("b", "2026-12-02T08:00:00", { crewId: "deck", place: place("p-b", "b St", 39.1, -75.5) }),
      ev("c", "2026-12-02T09:00:00"),
      ev("d", "2026-12-02T09:00:00", { crewId: "siding" }),
      ev("e", "2026-12-03T09:00:00", { crewId: "deck" }), // another day
      ev("f", "2026-12-02T10:00:00", { ticketId: null, place: null }), // no job site
      ev("g", "2026-12-02T11:00:00", { crewId: "gone" }), // crew not loaded
    ];
    const days = crewDays(events, [DECK, SIDING], day, new Map([["p-a", { lat: 39.2, lng: -75.6 }]]));
    expect(days.map((d) => [d.key, d.stops.map((s) => `${s.n}${s.event.id}`)])).toEqual([
      ["deck", ["1b", "2a"]],
      ["siding", ["1d"]],
      ["none", ["1c", "2g"]],
    ]);
    expect(days[0].stops.map((s) => s.point)).toEqual([{ lat: 39.1, lng: -75.5 }, { lat: 39.2, lng: -75.6 }]);
    expect(days[1].stops[0].point).toBeNull();
    expect(days[0].color).toBe("orange");
  });
  it("colors pins like the calendar: own color, then crew, then kind", () => {
    const [deck, none] = crewDays([ev("a", "2026-12-02T08:00:00", { crewId: "deck" }), ev("b", "2026-12-02T09:00:00", { crewId: "deck", color: "red" }), ev("c", "2026-12-02T09:00:00", { kind: "site_visit" })], [DECK], day);
    expect(deck.stops.map((s) => stopColor(s, deck))).toEqual(["orange", "red"]);
    expect(stopColor(none.stops[0], none)).toBe("blue");
  });
  it("lists each unsaved, untried site once", () => {
    const events = [ev("a", "2026-12-02T08:00:00"), ev("b", "2026-12-02T09:00:00", { place: place("p-a", "a Main St") }), ev("c", "2026-12-02T09:00:00", { place: place("p-c", "c", 1, 2) }), ev("d", "2026-12-02T09:00:00")];
    expect(needsLookup(events, new Map([["p-d", null]])).map((p) => p.propertyId)).toEqual(["p-a"]);
  });
  it("boxes the points", () => {
    expect(boundsOf([])).toBeNull();
    expect(boundsOf([{ lat: 1, lng: 5 }, { lat: 3, lng: 2 }])).toEqual({ south: 1, north: 3, west: 2, east: 5 });
  });
});

describe("nominatimLocator", () => {
  const a = { street: "118 Fox Hall Dr", city: "Dover", state: "DE", zip: "19904" };
  it("asks once per address and keeps the answer", async () => {
    const fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => [{ lat: "39.1", lon: "-75.5" }] }));
    const locate = nominatimLocator({ fetch, gapMs: 0 });
    expect(await locate(a)).toEqual({ lat: 39.1, lng: -75.5 });
    expect(await locate({ ...a, street: "118 fox hall dr" })).toEqual({ lat: 39.1, lng: -75.5 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("waits between requests and lets a failed one be tried again", async () => {
    const times: number[] = [];
    let fail = true;
    const fetch = vi.fn(async () => {
      times.push(Date.now());
      if (fail) {
        fail = false;
        return { ok: false, status: 429, json: async () => [] };
      }
      return { ok: true, status: 200, json: async () => [] };
    });
    const locate = nominatimLocator({ fetch, gapMs: 40 });
    await expect(locate(a)).rejects.toThrow("429");
    expect(await locate(a)).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(35);
  });
});
