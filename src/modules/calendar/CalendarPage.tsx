import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  addDays,
  eventColor,
  formatRangeTitle,
  fromDateKey,
  startOfDay,
  startOfWeek,
  TimeGrid,
  toDateKey,
  useCalendar,
  type CalendarEvent,
  type GridColumn,
  type NewCalendarEvent,
} from "../../core/calendar";
import { CrewChip, useCrews } from "../../core/crews";
import { Icon } from "../../core/Icon";
import { ModulePage } from "../../core/ModulePage";
import { useCurrentUser } from "../../core/currentUser";
import type { Role } from "../../core/modules";
import { useTickets, type Person } from "../../core/tickets";
import { Button } from "../../ui";
import { EventSheet, type SheetState } from "./EventSheet";

type View = "day" | "week";

/** Roles that may add, move and resize bookings (mirrors the database rules). */
export const canEditCalendar = (role: Role) => role === "admin" || role === "sales" || role === "operations";

const WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "short" });
const LONG = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" });

/** Phones start on the day view; a week of seven columns is too tight there. */
const narrowScreen = () => typeof window !== "undefined" && !!window.matchMedia?.("(max-width: 700px)").matches;

export function CalendarPage() {
  const backend = useCalendar();
  const ticketsApi = useTickets();
  const { id: userId, role } = useCurrentUser();
  const editable = canEditCalendar(role);
  const { crews, crewById, colorOf } = useCrews();
  const [params, setParams] = useSearchParams();

  const view: View = params.get("view") === "day" || params.get("view") === "week" ? (params.get("view") as View) : narrowScreen() ? "day" : "week";
  const anchor = useMemo(() => fromDateKey(params.get("date")) ?? startOfDay(new Date()), [params]);
  const from = view === "week" ? startOfWeek(anchor) : startOfDay(anchor);
  const days = view === "week" ? 7 : 1;
  const fromKey = toDateKey(from);

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sheet, setSheet] = useState<SheetState>(null);
  const [people, setPeople] = useState<Person[]>([]);

  const go = useCallback(
    (next: { view?: View; date?: Date }) => {
      const p = new URLSearchParams(params);
      p.set("view", next.view ?? view);
      p.set("date", toDateKey(next.date ?? anchor));
      setParams(p, { replace: true });
    },
    [params, setParams, view, anchor],
  );

  const load = useCallback(async () => {
    const start = fromDateKey(fromKey)!;
    try {
      setEvents(await backend.list(start, addDays(start, days)));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [backend, fromKey, days]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    ticketsApi
      .people()
      .then(setPeople)
      .catch(() => {});
  }, [ticketsApi]);

  const columns: GridColumn[] = useMemo(
    () =>
      Array.from({ length: days }, (_, i) => {
        const day = addDays(fromDateKey(fromKey)!, i);
        return {
          key: toDateKey(day),
          day,
          name: LONG.format(day),
          label:
            days > 1 ? (
              <button type="button" className="tg-daylink" onClick={() => go({ view: "day", date: day })} aria-label={`Open ${LONG.format(day)}`}>
                <span className="tg-dow">{WEEKDAY.format(day)}</span>
                <span className="tg-dom">{day.getDate()}</span>
              </button>
            ) : (
              <span className="tg-daylink">
                <span className="tg-dow">{WEEKDAY.format(day)}</span>
                <span className="tg-dom">{day.getDate()}</span>
              </span>
            ),
        };
      }),
    [days, fromKey, go],
  );

  const step = (dir: 1 | -1) => go({ date: addDays(anchor, dir * days) });

  /** Moves or resizes right away on screen, then saves; puts it back if saving fails. */
  const change = async (event: CalendarEvent, times: { start: Date; end: Date }) => {
    const patch = { start: times.start.toISOString(), end: times.end.toISOString() };
    setEvents((list) => list.map((e) => (e.id === event.id ? { ...e, ...patch } : e)));
    try {
      const saved = await backend.update(event.id, patch);
      setEvents((list) => list.map((e) => (e.id === event.id ? saved : e)));
      setError("");
    } catch (e) {
      setEvents((list) => list.map((x) => (x.id === event.id ? event : x)));
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const save = async (input: NewCalendarEvent, existing?: CalendarEvent) => {
    if (existing) await backend.update(existing.id, input);
    else await backend.create(input, userId);
    setSheet(null);
    await load();
  };

  const remove = async (event: CalendarEvent) => {
    await backend.remove(event.id);
    setSheet(null);
    setEvents((list) => list.filter((e) => e.id !== event.id));
  };

  const newAtNextHour = () => {
    const start = new Date(anchor);
    const now = new Date();
    start.setHours(view === "day" && toDateKey(anchor) === toDateKey(now) ? Math.min(now.getHours() + 1, 23) : 9, 0, 0, 0);
    setSheet({ mode: "new", start, end: new Date(start.getTime() + 3_600_000) });
  };

  const count = events.length;
  // Crews in the legend: every active crew, plus a retired one that still has bookings in view.
  const legendCrews = crews.filter((c) => c.active || events.some((e) => e.crewId === c.id));

  return (
    <ModulePage title="Calendar" description="Site visits and jobs on one shared calendar.">
      <div className="cal-toolbar">
        <div className="cal-nav">
          <Button size="sm" onClick={() => go({ date: new Date() })}>
            Today
          </Button>
          <button type="button" className="icon-btn" onClick={() => step(-1)} aria-label={view === "week" ? "Previous week" : "Previous day"}>
            <Icon name="collapse" />
          </button>
          <button type="button" className="icon-btn" onClick={() => step(1)} aria-label={view === "week" ? "Next week" : "Next day"}>
            <Icon name="next" />
          </button>
          <h2 className="cal-title" aria-live="polite">
            {formatRangeTitle(view, anchor)}
          </h2>
        </div>
        <div className="cal-actions">
          <div className="segmented" role="group" aria-label="View">
            {(["day", "week"] as View[]).map((v) => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => go({ view: v })}>
                {v === "day" ? "Day" : "Week"}
              </button>
            ))}
          </div>
          {editable && (
            <Button variant="primary" icon={<Icon name="plus" />} onClick={newAtNextHour}>
              New booking
            </Button>
          )}
        </div>
      </div>

      {error && (
        <p className="settings-error" role="alert">
          {error}
        </p>
      )}

      <div className="cal-legend" aria-label="Legend">
        <span className="cal-key">
          <i className="ev-swatch ev--blue" /> Site visit
        </span>
        <span className="cal-key">
          <i className="ev-swatch ev--teal" /> Job
        </span>
        <span className="cal-key">
          <i className="ev-swatch ev--slate" /> Other
        </span>
        <span className="cal-key">
          <i className="ev-swatch ev--teal ev--tentative" /> Tentative (soft)
        </span>
        {legendCrews.length > 0 && (
          <span className="cal-crews" aria-label="Crew colors">
            {legendCrews.map((c) => (
              <CrewChip key={c.id} name={c.name} color={c.color} retired={!c.active} />
            ))}
          </span>
        )}
        <span className="cal-count muted">{loading ? "Loading…" : `${count} booking${count === 1 ? "" : "s"}`}</span>
        {editable && <span className="cal-hint muted">Drag on empty time to book it. Drag a booking to move it, or its bottom edge to change the length. On a phone, tap empty time to book, and press and hold a booking before dragging it.</span>}
      </div>

      <TimeGrid
        columns={columns}
        events={events}
        editable={editable}
        onCreate={(start, end) => setSheet({ mode: "new", start, end })}
        onOpen={(event) => setSheet({ mode: "edit", event })}
        onChange={(event, times) => void change(event, times)}
        colorFor={(e) => eventColor(e, colorOf(e.crewId))}
        detailFor={(e) => crewById(e.crewId)?.name}
      />

      <EventSheet state={sheet} editable={editable} people={people} onClose={() => setSheet(null)} onSave={save} onDelete={remove} />
    </ModulePage>
  );
}
