export type EventKind = "site_visit" | "job" | "other";
export type EventStatus = "tentative" | "confirmed";

/** Shared color palette. Same names as the --ev-<name> tokens and the database check. */
export const EVENT_COLORS = ["teal", "blue", "green", "amber", "orange", "red", "purple", "slate"] as const;
export type EventColor = (typeof EVENT_COLORS)[number];

export const KIND_LABELS: Record<EventKind, string> = {
  site_visit: "Site visit",
  job: "Job",
  other: "Other",
};

/** Color used when an event has no color of its own and no crew. */
export const KIND_COLORS: Record<EventKind, EventColor> = {
  site_visit: "blue",
  job: "teal",
  other: "slate",
};

export interface CalendarEvent {
  id: string;
  kind: EventKind;
  /** Tentative ("soft") bookings are drawn striped with a dashed edge. */
  status: EventStatus;
  title: string;
  /** ISO timestamps. */
  start: string;
  end: string;
  ticketId: string | null;
  /** "#1003 Bathroom refresh at rental", when linked to a ticket. */
  ticketLabel: string;
  ticketNumber: number | null;
  /** Job-site address from the ticket. */
  site: string;
  /** The ticket's job site with its map position (null coordinates until the address is looked up). Used by the map. */
  place?: SitePlace | null;
  /** Crew doing the work. The booking takes the crew's color unless `color` is set. */
  crewId: string | null;
  assignedTo: string | null;
  /** Override color; null = crew color, then the kind's color. */
  color: EventColor | null;
  notes: string;
  isExample: boolean;
}

/** A ticket's job site as the map needs it. Coordinates are saved on the property once looked up. */
export interface SitePlace {
  propertyId: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  lat: number | null;
  lng: number | null;
}

export interface NewCalendarEvent {
  kind: EventKind;
  status: EventStatus;
  title: string;
  start: string;
  end: string;
  ticketId?: string | null;
  crewId?: string | null;
  assignedTo?: string | null;
  color?: EventColor | null;
  notes?: string;
}

export type CalendarEventPatch = Partial<NewCalendarEvent>;

/** Where calendar events live. The live app uses Supabase; preview mode and tests keep them in memory. */
export interface CalendarBackend {
  /** Events that overlap [from, to). */
  list(from: Date, to: Date): Promise<CalendarEvent[]>;
  /** Every booking linked to these tickets, any date (the scheduling board's queue). */
  forTickets(ticketIds: readonly string[]): Promise<CalendarEvent[]>;
  create(event: NewCalendarEvent, actorId: string | null): Promise<CalendarEvent>;
  update(id: string, patch: CalendarEventPatch): Promise<CalendarEvent>;
  remove(id: string): Promise<void>;
}

/** The color an event is drawn in: its own color, then its crew's (see useCrews().colorOf), then its kind's. */
export function eventColor(e: Pick<CalendarEvent, "color" | "kind">, crewColor?: EventColor | null): EventColor {
  return e.color ?? crewColor ?? KIND_COLORS[e.kind];
}
