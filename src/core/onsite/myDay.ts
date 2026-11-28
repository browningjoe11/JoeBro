import type { CalendarEvent } from "../calendar/types";
import type { Technician } from "../crews/types";

/**
 * Pure rules for the tech's My Day screen (chunk M1). The screen shows one
 * person's (or one crew's) bookings for a day, in the order they're driven.
 */

/** Whose day is on screen: a crew, and optionally the login of the tech looking at it. */
export interface DayOwner {
  crewId: string | null;
  /** Bookings assigned to this login show too (a tech can be booked personally). */
  profileId: string | null;
}

/** The technician record linked to a login, when it's active. */
export function techForLogin(techs: readonly Technician[], profileId: string | null): Technician | null {
  if (!profileId) return null;
  return techs.find((t) => t.active && t.profileId === profileId) ?? null;
}

/**
 * Bookings for the owner that overlap the day, in route order. Until route
 * planning (O4) saves a stop order, route order is start time, then the
 * booking's title so the list never jumps around.
 */
export function dayStops(events: readonly CalendarEvent[], owner: DayOwner, dayStart: Date, dayEnd: Date): CalendarEvent[] {
  return events
    .filter((e) => new Date(e.start) < dayEnd && new Date(e.end) > dayStart)
    .filter(
      (e) => (owner.crewId !== null && e.crewId === owner.crewId) || (owner.profileId !== null && e.assignedTo === owner.profileId),
    )
    .slice()
    .sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
}

/** One line a map app can find: street, unit, city, state, zip. Adds "DE" when no state is given. */
export function fullAddress(p: { street?: string; unit?: string; city?: string; state?: string; zip?: string } | string): string {
  if (typeof p === "string") {
    const s = p.trim();
    if (!s) return "";
    return /\b(DE|Delaware|MD|Maryland|PA|NJ|VA)\b/i.test(s) || /\d{5}$/.test(s) ? s : `${s}, DE`;
  }
  const street = [p.street, p.unit].map((x) => (x ?? "").trim()).filter(Boolean).join(" ");
  const stateZip = [(p.state ?? "").trim() || "DE", (p.zip ?? "").trim()].filter(Boolean).join(" ");
  return [street, (p.city ?? "").trim(), street || p.city ? stateZip : ""].filter(Boolean).join(", ");
}

/**
 * Turn-by-turn directions link. Google's universal maps URL opens the Maps app
 * on Android and iPhone (or the website when it isn't installed), needs no key
 * and starts from the phone's location.
 */
export function directionsUrl(address: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

/** tel: link for a phone number as typed ("(302) 555-0142" → "tel:+13025550142"). Empty when there's no number. */
export function telHref(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `tel:+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `tel:+${digits}`;
  return digits.length >= 7 ? `tel:${digits}` : "";
}
