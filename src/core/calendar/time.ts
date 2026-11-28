/** Date helpers for the calendar. Everything works in the browser's local time (Delaware for the team). */

export const MINUTES_PER_DAY = 24 * 60;
/** Drags and resizes snap to this many minutes. */
export const SNAP_MINUTES = 15;

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function addMinutes(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 60_000);
}

/** Weeks start on Monday, matching the crews' work week. */
export function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const offset = (x.getDay() + 6) % 7;
  return addDays(x, -offset);
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "2026-11-30" in local time, for URLs and date inputs. */
export function toDateKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Parses "2026-11-30" as local midnight. Returns null for anything else. */
export function fromDateKey(key: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key ?? "");
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "09:30" for time inputs. */
export function toTimeValue(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Combines a "2026-11-30" date and a "09:30" time into a local Date. */
export function combine(dateKey: string, time: string): Date | null {
  const day = fromDateKey(dateKey);
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!day || !m) return null;
  day.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return day;
}

export function snap(minutes: number, step = SNAP_MINUTES): number {
  return Math.round(minutes / step) * step;
}

/** Wall-clock minutes since local midnight. */
export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** "9 AM", "9:30 AM" */
export function formatTime(d: Date): string {
  const h = d.getHours() % 12 || 12;
  const m = d.getMinutes();
  const ampm = d.getHours() < 12 ? "AM" : "PM";
  return m ? `${h}:${String(m).padStart(2, "0")} ${ampm}` : `${h} ${ampm}`;
}

export function formatTimeRange(start: Date, end: Date): string {
  return `${formatTime(start)} – ${formatTime(end)}`;
}

export function formatHour(h: number): string {
  if (h === 0) return "12 AM";
  if (h === 12) return "Noon";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

const MONTH = new Intl.DateTimeFormat("en-US", { month: "short" });
const LONG_DAY = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

/** Title for the toolbar: "Monday, November 30, 2026" or "Nov 30 – Dec 6, 2026". */
export function formatRangeTitle(view: "day" | "week", anchor: Date): string {
  if (view === "day") return LONG_DAY.format(anchor);
  const from = startOfWeek(anchor);
  const to = addDays(from, 6);
  const left = `${MONTH.format(from)} ${from.getDate()}`;
  const right = from.getMonth() === to.getMonth() ? `${to.getDate()}` : `${MONTH.format(to)} ${to.getDate()}`;
  const year = from.getFullYear() === to.getFullYear() ? `, ${to.getFullYear()}` : ` ${to.getFullYear()}`;
  return from.getFullYear() === to.getFullYear() ? `${left} – ${right}${year}` : `${left}, ${from.getFullYear()} – ${right}${year}`;
}

/** Where an event sits inside one day column. */
export interface Placement<T> {
  item: T;
  /** Minutes from midnight to the top and bottom of the block (clipped to the day). */
  top: number;
  bottom: number;
  /** Side-by-side position when events overlap: lane index out of `lanes`. */
  lane: number;
  lanes: number;
  /** Whether the block shows the real start / end (false when the event runs past midnight). */
  startsToday: boolean;
  endsToday: boolean;
}

/**
 * Lays out the events that touch `day` so overlapping ones sit side by side.
 * Events that cross midnight are clipped to the part inside this day.
 */
export function layoutDay<T extends { start: string; end: string }>(items: readonly T[], day: Date): Placement<T>[] {
  const dayStart = startOfDay(day);
  const dayEnd = addDays(dayStart, 1);
  const segs = items
    .map((item) => ({ item, s: new Date(item.start), e: new Date(item.end) }))
    .filter(({ s, e }) => s < dayEnd && e > dayStart)
    .map(({ item, s, e }) => ({
      item,
      top: s <= dayStart ? 0 : minutesOfDay(s),
      bottom: e >= dayEnd ? MINUTES_PER_DAY : minutesOfDay(e) || MINUTES_PER_DAY,
      startsToday: s >= dayStart,
      endsToday: e <= dayEnd,
    }))
    .sort((a, b) => a.top - b.top || b.bottom - a.bottom);

  const out: Placement<T>[] = [];
  let cluster: Placement<T>[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;
  const close = () => {
    cluster.forEach((p) => (p.lanes = laneEnds.length));
    cluster = [];
    laneEnds = [];
  };
  for (const seg of segs) {
    if (seg.top >= clusterEnd) close();
    let lane = laneEnds.findIndex((end) => end <= seg.top);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(seg.bottom);
    } else laneEnds[lane] = seg.bottom;
    const p: Placement<T> = { ...seg, lane, lanes: 1 };
    cluster.push(p);
    out.push(p);
    clusterEnd = Math.max(clusterEnd, seg.bottom);
  }
  close();
  return out;
}

/** New times after dragging an event by whole days and minutes. Length is kept. */
export function moveTimes(start: Date, end: Date, dayDelta: number, minuteDelta: number): { start: Date; end: Date } {
  const length = end.getTime() - start.getTime();
  const s = addMinutes(addDays(start, dayDelta), minuteDelta);
  return { start: s, end: new Date(s.getTime() + length) };
}

/** New end after dragging the bottom edge. Never shorter than one snap step. */
export function resizeEnd(start: Date, end: Date, minuteDelta: number, step = SNAP_MINUTES): Date {
  const e = addMinutes(end, minuteDelta);
  return e.getTime() - start.getTime() < step * 60_000 ? addMinutes(start, step) : e;
}
