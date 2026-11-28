import { addDays, combine, moveTimes, sameDay, startOfDay, toDateKey, type CalendarEvent } from "../calendar";
import type { Crew } from "../crews";
import type { Stage, TicketSummary } from "../tickets";

/**
 * Ticket stages that put a job in the scheduling queue. E-sign (S6) isn't built
 * yet, so "signed" is the stage someone sets by hand with "Mark signed".
 * "scheduling" means bookings are pencilled in but not confirmed yet.
 */
export const READY_STAGES: readonly Stage[] = ["signed", "scheduling"];

/** Hours a booking gets when it's dropped on a lane with no crew. */
export const DEFAULT_DAY = { start: "07:00", end: "15:30" } as const;

export interface QueueItem {
  ticket: TicketSummary;
  /** Every booking linked to the ticket, any week, oldest first. */
  bookings: CalendarEvent[];
  soft: number;
  confirmed: number;
}

/** Jobs waiting to be scheduled, oldest signed first, with what's already pencilled in for each. */
export function buildQueue(tickets: readonly TicketSummary[], bookings: readonly CalendarEvent[]): QueueItem[] {
  return tickets
    .filter((t) => READY_STAGES.includes(t.stage))
    .map((ticket) => {
      const own = bookings.filter((b) => b.ticketId === ticket.id).sort((a, b) => a.start.localeCompare(b.start));
      return {
        ticket,
        bookings: own,
        soft: own.filter((b) => b.status === "tentative").length,
        confirmed: own.filter((b) => b.status === "confirmed").length,
      };
    })
    .sort((a, b) => a.ticket.stageChangedAt.localeCompare(b.ticket.stageChangedAt) || a.ticket.number - b.ticket.number);
}

/** "Not booked yet", "2 days pencilled in", "1 day confirmed, 1 pencilled in". */
export function bookedSummary(item: Pick<QueueItem, "soft" | "confirmed">): string {
  const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
  if (item.soft === 0 && item.confirmed === 0) return "Not booked yet";
  if (item.confirmed === 0) return `${days(item.soft)} pencilled in`;
  if (item.soft === 0) return `${days(item.confirmed)} confirmed`;
  return `${days(item.confirmed)} confirmed, ${item.soft} pencilled in`;
}

/** Whether the crew normally works on this day of the week. */
export function worksOn(crew: Pick<Crew, "workDays">, day: Date): boolean {
  return crew.workDays.includes(day.getDay());
}

/** A booking dropped on a crew's day fills the crew's working hours. */
export function dropTimes(crew: Pick<Crew, "dayStart" | "dayEnd"> | undefined, day: Date): { start: Date; end: Date } {
  const key = toDateKey(day);
  const start = combine(key, crew?.dayStart ?? DEFAULT_DAY.start)!;
  const end = combine(key, crew?.dayEnd ?? DEFAULT_DAY.end)!;
  return { start, end };
}

/** A booking moved to another day keeps its time of day and length. */
export function moveToDay(event: Pick<CalendarEvent, "start" | "end">, day: Date): { start: Date; end: Date } {
  const start = new Date(event.start);
  const delta = Math.round((startOfDay(day).getTime() - startOfDay(start).getTime()) / 86_400_000);
  return moveTimes(start, new Date(event.end), delta, 0);
}

/** Bookings that belong on the board: anything for a crew, plus jobs that have no crew yet. */
export function onBoard(e: Pick<CalendarEvent, "crewId" | "kind">): boolean {
  return e.crewId !== null || e.kind === "job";
}

/** Bookings in one lane (a crew, or null for "No crew") that start on `day`. */
export function cellEvents<T extends Pick<CalendarEvent, "crewId" | "kind" | "start">>(events: readonly T[], crewId: string | null, day: Date): T[] {
  return events.filter((e) => onBoard(e) && e.crewId === crewId && sameDay(new Date(e.start), day)).sort((a, b) => a.start.localeCompare(b.start));
}

/**
 * Days the board shows for the week starting `monday`: Monday to Friday, plus
 * Saturday or Sunday when a crew works it or something is booked then.
 */
export function boardDays(monday: Date, crews: readonly Pick<Crew, "workDays" | "active">[], events: readonly Pick<CalendarEvent, "start">[]): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i)).filter((d) => {
    const dow = d.getDay();
    if (dow >= 1 && dow <= 5) return true;
    return crews.some((c) => c.active && c.workDays.includes(dow)) || events.some((e) => sameDay(new Date(e.start), d));
  });
}

/** Hours booked, e.g. 8.5. Only the part of each booking inside `day` counts. */
export function hoursOn(events: readonly Pick<CalendarEvent, "start" | "end">[], day: Date): number {
  const from = startOfDay(day).getTime();
  const to = addDays(startOfDay(day), 1).getTime();
  const ms = events.reduce((sum, e) => sum + Math.max(0, Math.min(to, new Date(e.end).getTime()) - Math.max(from, new Date(e.start).getTime())), 0);
  return Math.round((ms / 3_600_000) * 4) / 4;
}

/** Length of the crew's working day in hours. */
export function crewDayHours(crew: Pick<Crew, "dayStart" | "dayEnd">): number {
  const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  return (mins(crew.dayEnd) - mins(crew.dayStart)) / 60;
}

/** Crews whose skills include the job's trade, for highlighting lanes while a job is dragged. */
export function crewFits(crew: Pick<Crew, "skills">, trade: string): boolean {
  const t = trade.trim().toLowerCase();
  return !!t && crew.skills.some((s) => s.trim().toLowerCase() === t);
}
