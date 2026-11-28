import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  addMinutes,
  formatHour,
  formatTimeRange,
  layoutDay,
  MINUTES_PER_DAY,
  minutesOfDay,
  moveTimes,
  resizeEnd,
  sameDay,
  snap,
  SNAP_MINUTES,
  startOfDay,
} from "./time";
import { eventColor, type CalendarEvent, type EventColor } from "./types";

/** One column of the grid: a day now; a day for one crew on the scheduling board (O2). */
export interface GridColumn {
  key: string;
  day: Date;
  label: ReactNode;
  /** Accessible name, e.g. "Tuesday, December 1". */
  name: string;
}

export interface TimeGridProps {
  columns: readonly GridColumn[];
  events: readonly CalendarEvent[];
  /** Which events go in a column. Default: every event on that column's day. */
  eventsFor?: (column: GridColumn, events: readonly CalendarEvent[]) => readonly CalendarEvent[];
  /** Turns on drag to create, move and resize. */
  editable: boolean;
  /** Empty time picked: a click (one hour) or a drag over the range. */
  onCreate?: (start: Date, end: Date, column: GridColumn) => void;
  /** Event clicked or opened with the keyboard. */
  onOpen?: (event: CalendarEvent) => void;
  /** Event dropped at new times (and maybe another column). */
  onChange?: (event: CalendarEvent, times: { start: Date; end: Date }, column: GridColumn) => void;
  /** Color for an event; defaults to its own color, then its kind's. */
  colorFor?: (event: CalendarEvent) => EventColor;
  /** Height of one hour in pixels. */
  hourHeight?: number;
  /** Hour scrolled into view when the grid first appears. */
  startHour?: number;
}

type Drag =
  | { type: "move" | "resize"; event: CalendarEvent; col: number; x: number; y: number; curCol: number; curY: number; moved: boolean; pointerId: number }
  | { type: "create"; col: number; x: number; y: number; curCol: number; curY: number; moved: boolean; pointerId: number; touch: boolean };

const DAY_MS = 86_400_000;
const dayDiff = (a: Date, b: Date) => Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / DAY_MS);
/** Pixels a pointer must travel before a press becomes a drag. */
const SLOP = 4;
/** On touch screens a press must be held this long before an event can be dragged, so swipes still scroll. */
const TOUCH_HOLD_MS = 300;

/**
 * Hours down the side, one column per day (or per crew and day). Drag empty
 * space to book a time, drag a booking to move it, drag its bottom edge to
 * change its length. Times snap to 15 minutes. On phones, hold a booking for a
 * moment before dragging it; a tap on empty space books an hour.
 */
export function TimeGrid({
  columns,
  events,
  eventsFor,
  editable,
  onCreate,
  onOpen,
  onChange,
  colorFor = (e) => eventColor(e),
  hourHeight = 48,
  startHour = 7,
}: TimeGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const colRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const holdTimer = useRef<number | undefined>(undefined);
  const now = useNow();

  const update = (d: Drag | null) => {
    dragRef.current = d;
    setDrag(d);
  };

  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = startHour * hourHeight;
  }, [startHour, hourHeight]);

  // While dragging on a touch screen, stop the page from scrolling under the finger.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const block = (e: TouchEvent) => {
      const d = dragRef.current;
      if (d && d.type !== "create") e.preventDefault();
    };
    el.addEventListener("touchmove", block, { passive: false });
    return () => el.removeEventListener("touchmove", block);
  }, []);

  useEffect(() => () => window.clearTimeout(holdTimer.current), []);

  const pxToMin = (px: number) => (px / hourHeight) * 60;

  /** Column under the pointer (nearest one when outside the grid). */
  const colAt = (clientX: number): number => {
    let best = 0;
    let bestDist = Infinity;
    colRefs.current.forEach((el, i) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      const dist = clientX < r.left ? r.left - clientX : clientX > r.right ? clientX - r.right : 0;
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    });
    return best;
  };

  /** Minutes from midnight at a pointer position inside column `col`. */
  const minuteAt = (clientY: number, col: number) => {
    const r = colRefs.current[col]?.getBoundingClientRect();
    const y = r ? clientY - r.top : 0;
    return Math.min(MINUTES_PER_DAY, Math.max(0, pxToMin(y)));
  };

  /** The times an in-progress move or resize would give. */
  const preview = (d: Extract<Drag, { type: "move" | "resize" }>) => {
    const s = new Date(d.event.start);
    const e = new Date(d.event.end);
    const minuteDelta = snap(pxToMin(d.curY - d.y));
    if (d.type === "resize") return { start: s, end: resizeEnd(s, e, minuteDelta) };
    return moveTimes(s, e, dayDiff(columns[d.curCol].day, columns[d.col].day), minuteDelta);
  };

  /** Range a create drag covers, snapped. A plain click gives one hour. */
  const createRange = (d: Extract<Drag, { type: "create" }>) => {
    const day = startOfDay(columns[d.col].day);
    const a = minuteAt(d.y, d.col);
    if (!d.moved) {
      const start = Math.min(Math.floor(a / 30) * 30, MINUTES_PER_DAY - 60);
      return { start: addMinutes(day, start), end: addMinutes(day, start + 60) };
    }
    const b = minuteAt(d.curY, d.col);
    let lo = Math.floor(Math.min(a, b) / SNAP_MINUTES) * SNAP_MINUTES;
    let hi = Math.round(Math.max(a, b) / SNAP_MINUTES) * SNAP_MINUTES;
    if (hi - lo < SNAP_MINUTES) hi = lo + SNAP_MINUTES;
    if (hi > MINUTES_PER_DAY) [lo, hi] = [MINUTES_PER_DAY - SNAP_MINUTES, MINUTES_PER_DAY];
    return { start: addMinutes(day, lo), end: addMinutes(day, hi) };
  };

  // ---- pointer handling ----

  // The grid itself captures the pointer, so a booking can be re-drawn in another column mid-drag.
  const capture = (pointerId: number) => {
    try {
      rootRef.current?.setPointerCapture?.(pointerId);
    } catch {
      // Pointer already gone.
    }
  };

  const begin = (e: ReactPointerEvent, d: Drag) => {
    capture(e.pointerId);
    update(d);
  };

  const onEventDown = (e: ReactPointerEvent, event: CalendarEvent, col: number, type: "move" | "resize") => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const d: Drag = { type, event, col, x: e.clientX, y: e.clientY, curCol: col, curY: e.clientY, moved: false, pointerId: e.pointerId };
    if (!editable) {
      update(d); // still track the press so a click opens the event
      return;
    }
    if (e.pointerType === "touch") {
      // Wait for a hold before dragging so a swipe that starts on an event still scrolls.
      const pointerId = e.pointerId;
      update({ ...d, moved: false });
      window.clearTimeout(holdTimer.current);
      holdTimer.current = window.setTimeout(() => {
        if (dragRef.current?.pointerId !== pointerId) return;
        capture(pointerId);
        update({ ...dragRef.current, moved: true } as Drag);
        navigator.vibrate?.(10);
      }, TOUCH_HOLD_MS);
      return;
    }
    begin(e, d);
  };

  const onColumnDown = (e: ReactPointerEvent, col: number) => {
    if (!editable || !onCreate || e.button !== 0) return;
    const touch = e.pointerType === "touch";
    const d: Drag = { type: "create", col, x: e.clientX, y: e.clientY, curCol: col, curY: e.clientY, moved: false, pointerId: e.pointerId, touch };
    // On touch, empty space only takes taps; dragging there scrolls the page.
    if (touch) update(d);
    else begin(e, d);
  };

  const onMove = (e: ReactPointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const far = Math.abs(e.clientX - d.x) > SLOP || Math.abs(e.clientY - d.y) > SLOP;
    if (e.pointerType === "touch" && !d.moved) {
      // Moved before the hold finished: it's a scroll or swipe, not a drag or tap.
      if (Math.abs(e.clientX - d.x) > 8 || Math.abs(e.clientY - d.y) > 8) cancel();
      return;
    }
    if (!editable) {
      if (far) update({ ...d, moved: true });
      return;
    }
    const curCol = d.type === "move" ? colAt(e.clientX) : d.col;
    update({ ...d, curCol, curY: e.clientY, moved: d.moved || far });
  };

  const cancel = () => {
    window.clearTimeout(holdTimer.current);
    update(null);
  };

  const onUp = (e: ReactPointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    window.clearTimeout(holdTimer.current);
    update(null);
    if (d.type === "create") {
      if (d.touch && d.moved) return;
      const r = createRange(d);
      onCreate?.(r.start, r.end, columns[d.col]);
      return;
    }
    if (!d.moved || !editable) {
      onOpen?.(d.event);
      return;
    }
    const t = preview(d);
    if (t.start.getTime() === new Date(d.event.start).getTime() && t.end.getTime() === new Date(d.event.end).getTime()) return;
    onChange?.(d.event, t, columns[d.curCol]);
  };

  // ---- rendering ----

  const dragging = drag && drag.type !== "create" && drag.moved && editable ? drag : null;
  const draggedTimes = dragging ? preview(dragging) : null;
  const shown = dragging && draggedTimes ? events.map((ev) => (ev.id === dragging.event.id ? { ...ev, start: draggedTimes.start.toISOString(), end: draggedTimes.end.toISOString() } : ev)) : events;
  const creating = drag && drag.type === "create" && drag.moved && !drag.touch ? createRange(drag) : null;

  const style = { "--hour-h": `${hourHeight}px`, "--cols": columns.length } as CSSProperties;

  return (
    <div className="tg-scroll" ref={scrollRef} style={style}>
      <div
        className={`tg${drag?.moved && editable ? " tg--dragging" : ""}`}
        ref={rootRef}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={cancel}
        onLostPointerCapture={(e) => {
          // Only the grid's own capture matters; touch screens also hand an implicit capture from the event to the grid.
          if (e.target === rootRef.current && dragRef.current?.pointerId === e.pointerId && dragRef.current.moved) cancel();
        }}
      >
        <div className="tg-corner" aria-hidden="true" />
        {columns.map((c) => (
          <div key={c.key} className={`tg-colhead${sameDay(c.day, now) ? " is-today" : ""}`}>
            {c.label}
          </div>
        ))}
        <div className="tg-hours" aria-hidden="true">
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="tg-hour">
              {h > 0 && <span>{formatHour(h)}</span>}
            </div>
          ))}
        </div>
        {columns.map((c, i) => {
          // While moving, the dragged event follows the pointer into its new column.
          const own = (eventsFor ? eventsFor(c, shown) : shown).filter((ev) => !dragging || ev.id !== dragging.event.id || dragging.curCol === i);
          const extra = dragging && dragging.curCol === i && !own.some((ev) => ev.id === dragging.event.id) ? shown.filter((ev) => ev.id === dragging.event.id) : [];
          const placed = layoutDay([...own, ...extra], c.day);
          return (
            <div
              key={c.key}
              className="tg-col"
              role="group"
              aria-label={c.name}
              ref={(el) => {
                colRefs.current[i] = el;
              }}
              onPointerDown={(e) => onColumnDown(e, i)}
            >
              {sameDay(c.day, now) && <div className="tg-now" style={{ top: `calc(${minutesOfDay(now) / 60} * var(--hour-h))` }} aria-hidden="true" />}
              {placed.map((p) => {
                const ev = p.item;
                const start = new Date(ev.start);
                const end = new Date(ev.end);
                const minutes = p.bottom - p.top;
                const short = minutes <= 45;
                const medium = !short && minutes <= 90;
                const isDragged = dragging?.event.id === ev.id;
                const label = `${ev.title}, ${formatTimeRange(start, end)}${ev.status === "tentative" ? ", tentative" : ""}`;
                return (
                  <div
                    key={ev.id}
                    className={[
                      "ev",
                      `ev--${colorFor(ev)}`,
                      ev.status === "tentative" ? "ev--tentative" : "",
                      short ? "ev--short" : "",
                      medium ? "ev--medium" : "",
                      isDragged ? "is-dragging" : "",
                      editable ? "ev--editable" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={{
                      top: `calc(${p.top / 60} * var(--hour-h))`,
                      height: `calc(${(p.bottom - p.top) / 60} * var(--hour-h) - 2px)`,
                      left: `calc(${(p.lane / p.lanes) * 100}% + 2px)`,
                      width: `calc(${100 / p.lanes}% - 4px)`,
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={label}
                    title={label}
                    onPointerDown={(e) => onEventDown(e, ev, i, "move")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onOpen?.(ev);
                      }
                    }}
                  >
                    <span className="ev-title">{ev.title}</span>
                    <span className="ev-time">{formatTimeRange(start, end)}</span>
                    {!short && !medium && ev.site && <span className="ev-meta">{ev.site}</span>}
                    {editable && p.endsToday && (
                      <span
                        className="ev-resize"
                        aria-hidden="true"
                        onPointerDown={(e) => onEventDown(e, ev, i, "resize")}
                      />
                    )}
                  </div>
                );
              })}
              {creating && drag?.col === i && (
                <div
                  className="ev ev--ghost"
                  style={{
                    top: `calc(${minutesOfDay(creating.start) / 60} * var(--hour-h))`,
                    height: `calc(${((creating.end.getTime() - creating.start.getTime()) / 60_000) / 60} * var(--hour-h) - 2px)`,
                  }}
                  aria-hidden="true"
                >
                  <span className="ev-time">{formatTimeRange(creating.start, creating.end)}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Current time, refreshed every minute, for the "now" line. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}
