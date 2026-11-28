import { eventColor, sameDay, type CalendarEvent, type EventColor } from "../calendar";
import type { Crew } from "../crews";
import type { GeoPoint, SiteAddress } from "./types";

/** Kent and Sussex counties, roughly. Lookups prefer results inside it, and an empty day centers on it. */
export const SERVICE_AREA = { south: 38.45, west: -75.8, north: 39.4, east: -75.04 } as const;

/** One address per line, as the lookup and the list show it: "118 Fox Hall Dr, Dover, DE 19904". */
export function addressLine(a: SiteAddress): string {
  const tail = [a.state, a.zip].filter((x) => x.trim()).join(" ");
  return [a.street, a.city, tail].map((x) => x.trim()).filter(Boolean).join(", ");
}

/** Cache key for an address, so "118 Fox Hall Dr" and "118 fox hall dr " are one lookup. */
export function addressKey(a: SiteAddress): string {
  return addressLine(a).toLowerCase().replace(/\s+/g, " ");
}

/** OpenStreetMap Nominatim search URL for a US street address, preferring the service area. */
export function nominatimUrl(a: SiteAddress): string {
  const q = new URLSearchParams({
    format: "jsonv2",
    limit: "1",
    countrycodes: "us",
    street: a.street.trim(),
    city: a.city.trim(),
    state: a.state.trim() || "DE",
    viewbox: `${SERVICE_AREA.west},${SERVICE_AREA.north},${SERVICE_AREA.east},${SERVICE_AREA.south}`,
  });
  if (a.zip.trim()) q.set("postalcode", a.zip.trim().slice(0, 5));
  return `https://nominatim.openstreetmap.org/search?${q.toString()}`;
}

/** The first result's position from a Nominatim answer, or null for no (or a malformed) result. */
export function parseNominatim(body: unknown): GeoPoint | null {
  if (!Array.isArray(body) || body.length === 0) return null;
  const first = body[0] as { lat?: unknown; lon?: unknown };
  const lat = Number(first.lat);
  const lng = Number(first.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/** One booking on the map day, numbered in its crew's order. */
export interface MapStop {
  event: CalendarEvent;
  /** 1, 2, 3… in start-time order within the crew. */
  n: number;
  /** Where to draw the pin; null until looked up, or when the address can't be found or is missing. */
  point: GeoPoint | null;
}

/** One crew's day (or the "No crew" group), in start-time order. */
export interface CrewDay {
  key: string;
  crew: Crew | null;
  /** Pin and route color: the crew's palette color, or teal for jobs with no crew. */
  color: EventColor;
  stops: MapStop[];
}

/** Bookings that belong on the map: anything at a ticket's job site (jobs and site visits). */
export function onMap(e: Pick<CalendarEvent, "ticketId">): boolean {
  return e.ticketId !== null;
}

/**
 * Groups the day's bookings by crew, in the crews' saved order with "No crew"
 * last, numbers each crew's stops by start time and attaches known positions.
 * `points` holds positions found this session, by property id.
 */
export function crewDays(
  events: readonly CalendarEvent[],
  crews: readonly Crew[],
  day: Date,
  points: ReadonlyMap<string, GeoPoint | null> = new Map(),
): CrewDay[] {
  const todays = events.filter((e) => onMap(e) && sameDay(new Date(e.start), day)).sort((a, b) => a.start.localeCompare(b.start));
  const known = new Set(crews.map((c) => c.id));
  const groups = new Map<string, CalendarEvent[]>();
  for (const e of todays) {
    const key = e.crewId && known.has(e.crewId) ? e.crewId : "none";
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const out: CrewDay[] = [];
  for (const crew of crews) {
    const list = groups.get(crew.id);
    if (list) out.push({ key: crew.id, crew, color: crew.color, stops: number(list, points) });
  }
  const none = groups.get("none");
  if (none) out.push({ key: "none", crew: null, color: "teal", stops: number(none, points) });
  return out;
}

function number(list: CalendarEvent[], points: ReadonlyMap<string, GeoPoint | null>): MapStop[] {
  return list.map((event, i) => ({ event, n: i + 1, point: pointOf(event, points) }));
}

/** A booking's position: saved on the property, else found this session. */
export function pointOf(e: Pick<CalendarEvent, "place">, points: ReadonlyMap<string, GeoPoint | null> = new Map()): GeoPoint | null {
  const p = e.place;
  if (!p) return null;
  if (p.lat !== null && p.lng !== null) return { lat: p.lat, lng: p.lng };
  return points.get(p.propertyId) ?? null;
}

/** Job sites that still need a lookup: have an address, no saved position, not tried this session. One per property. */
export function needsLookup(events: readonly Pick<CalendarEvent, "place">[], tried: ReadonlyMap<string, unknown>): NonNullable<CalendarEvent["place"]>[] {
  const seen = new Set<string>();
  const out: NonNullable<CalendarEvent["place"]>[] = [];
  for (const { place } of events) {
    if (!place || place.lat !== null || seen.has(place.propertyId) || tried.has(place.propertyId)) continue;
    if (!place.street.trim() || !place.city.trim()) continue;
    seen.add(place.propertyId);
    out.push(place);
  }
  return out;
}

/** The pin color for one stop: the booking's own color, then its crew's, then its kind's (same as the calendar). */
export function stopColor(stop: MapStop, day: CrewDay): EventColor {
  return eventColor(stop.event, day.crew?.color ?? null);
}

/** Box around every point, or null when there are none. */
export function boundsOf(points: readonly GeoPoint[]): { south: number; west: number; north: number; east: number } | null {
  if (points.length === 0) return null;
  return {
    south: Math.min(...points.map((p) => p.lat)),
    north: Math.max(...points.map((p) => p.lat)),
    west: Math.min(...points.map((p) => p.lng)),
    east: Math.max(...points.map((p) => p.lng)),
  };
}
