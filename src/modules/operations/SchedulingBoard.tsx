import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  addDays,
  eventColor,
  formatRangeTitle,
  formatTimeRange,
  fromDateKey,
  startOfDay,
  startOfWeek,
  toDateKey,
  useCalendar,
  type CalendarEvent,
  type NewCalendarEvent,
} from "../../core/calendar";
import { CrewChip, formatHours, useCrews, type Crew } from "../../core/crews";
import { useCurrentUser } from "../../core/currentUser";
import { Icon } from "../../core/Icon";
import { ModulePage } from "../../core/ModulePage";
import type { Role } from "../../core/modules";
import {
  bookedSummary,
  boardDays,
  buildQueue,
  cellEvents,
  crewDayHours,
  crewFits,
  dropTimes,
  hoursOn,
  moveToDay,
  onBoard,
  worksOn,
  type QueueItem,
} from "../../core/schedule/board";
import { STAGE_LABELS, useTickets, type Person, type TicketSummary } from "../../core/tickets";
import { Badge, Button, Section } from "../../ui";
import { EventSheet, type SheetState } from "../calendar/EventSheet";
import { ViewSwitch } from "./ViewSwitch";
import "./board.css";

/** Roles that may plan the board (the database lets the same roles change bookings and these ticket stages). */
export const canPlan = (role: Role) => role === "admin" || role === "operations";

type Payload = { type: "ticket"; ticketId: string } | { type: "booking"; id: string };

/** One row of the board: a crew, or the catch-all for jobs with no crew yet. */
interface Lane {
  key: string;
  crew: Crew | null;
}

const WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "short" });
const LONG = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" });
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const MIME = "application/x-joebro-board";

/**
 * Week planner for the crews. Signed jobs wait in the queue at the top; drag one
 * onto a crew's day to pencil it in (soft), drag bookings between days and crews,
 * then confirm the job once the customer and crew are set.
 */
export function SchedulingBoard() {
  const calendar = useCalendar();
  const ticketsApi = useTickets();
  const { id: userId, role } = useCurrentUser();
  const editable = canPlan(role);
  const { crews, crewById, colorOf, loading: crewsLoading } = useCrews();
  const [params, setParams] = useSearchParams();

  const anchor = useMemo(() => fromDateKey(params.get("date")) ?? startOfDay(new Date()), [params]);
  const monday = startOfWeek(anchor);
  const mondayKey = toDateKey(monday);

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [queueBookings, setQueueBookings] = useState<CalendarEvent[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sheet, setSheet] = useState<SheetState>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [dragging, setDragging] = useState<Payload | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const dragRef = useRef<Payload | null>(null);

  const load = useCallback(async () => {
    const from = fromDateKey(mondayKey)!;
    try {
      const [week, list] = await Promise.all([calendar.list(from, addDays(from, 7)), ticketsApi.list()]);
      const ready = buildQueue(list, []).map((q) => q.ticket.id);
      setEvents(week);
      setTickets(list);
      setQueueBookings(await calendar.forTickets(ready));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [calendar, ticketsApi, mondayKey]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    ticketsApi
      .people()
      .then(setPeople)
      .catch(() => {});
  }, [ticketsApi]);

  const go = (date: Date) => {
    const p = new URLSearchParams(params);
    p.set("date", toDateKey(date));
    setParams(p, { replace: true });
  };

  const queue = useMemo(() => buildQueue(tickets, queueBookings), [tickets, queueBookings]);
  const boardEvents = useMemo(() => events.filter(onBoard), [events]);
  const days = useMemo(() => boardDays(fromDateKey(mondayKey)!, crews, boardEvents), [mondayKey, crews, boardEvents]);
  const lanes: Lane[] = useMemo(() => {
    const shown = crews.filter((c) => c.active || boardEvents.some((e) => e.crewId === c.id));
    const out: Lane[] = shown.map((c) => ({ key: c.id, crew: c }));
    // Bookings whose crew isn't loaded (or have none) land in "No crew" so nothing goes missing.
    if (boardEvents.some((e) => e.crewId === null || !crewById(e.crewId)) || shown.length === 0) out.push({ key: "none", crew: null });
    return out;
  }, [crews, boardEvents, crewById]);
  const laneEvents = (lane: Lane, day: Date) =>
    lane.crew ? cellEvents(boardEvents, lane.crew.id, day) : cellEvents(boardEvents.map((e) => (e.crewId && !crewById(e.crewId) ? { ...e, crewId: null } : e)), null, day);
  const draggedTicket = dragging?.type === "ticket" ? tickets.find((t) => t.id === dragging.ticketId) : undefined;

  /** Runs one change, shows what happened, and reloads the board. */
  const act = async (key: string, work: () => Promise<string | void>) => {
    setBusy(key);
    setError("");
    try {
      const msg = await work();
      setNotice(msg ?? "");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  /** A signed job gets its first booking: move the ticket on to Scheduling. */
  const startScheduling = async (ticket: TicketSummary) => {
    if (ticket.stage === "signed") await ticketsApi.move(ticket.id, "scheduling");
  };

  const placeTicket = (ticket: TicketSummary, lane: Lane, day: Date) =>
    act(`drop-${ticket.id}`, async () => {
      const { start, end } = dropTimes(lane.crew ?? undefined, day);
      await calendar.create(
        { kind: "job", status: "tentative", title: ticket.title, start: start.toISOString(), end: end.toISOString(), ticketId: ticket.id, crewId: lane.crew?.id ?? null },
        userId,
      );
      await startScheduling(ticket);
      return `Pencilled in #${ticket.number} for ${lane.crew?.name ?? "no crew"} on ${LONG.format(day)}.`;
    });

  const moveBooking = (event: CalendarEvent, lane: Lane, day: Date) => {
    const { start, end } = moveToDay(event, day);
    const crewId = lane.crew?.id ?? null;
    if (crewId === event.crewId && start.toISOString() === event.start) return;
    // Show the move right away; the reload after saving settles it.
    setEvents((list) => list.map((e) => (e.id === event.id ? { ...e, crewId, start: start.toISOString(), end: end.toISOString() } : e)));
    void act(`move-${event.id}`, async () => {
      await calendar.update(event.id, { crewId, start: start.toISOString(), end: end.toISOString() });
      return `Moved ${event.title} to ${lane.crew?.name ?? "no crew"} on ${LONG.format(day)}.`;
    });
  };

  const confirmJob = (item: QueueItem) =>
    act(`confirm-${item.ticket.id}`, async () => {
      for (const b of item.bookings) if (b.status === "tentative") await calendar.update(b.id, { status: "confirmed" });
      await startScheduling(item.ticket);
      await ticketsApi.move(item.ticket.id, "scheduled");
      return `#${item.ticket.number} is confirmed and scheduled.`;
    });

  /** "Schedule…" without dragging (phones, keyboards): the booking form with the job filled in. */
  const scheduleWithForm = (ticket: TicketSummary) => {
    const crew = crews.find((c) => c.active && crewFits(c, ticket.trade)) ?? crews.find((c) => c.active);
    const today = startOfDay(new Date());
    const first = days.find((d) => d >= today && (!crew || worksOn(crew, d))) ?? days[0];
    const { start, end } = dropTimes(crew, first);
    setSheet({ mode: "new", start, end, preset: { kind: "job", status: "tentative", title: ticket.title, ticketId: ticket.id, crewId: crew?.id ?? null } });
  };

  const saveSheet = async (input: NewCalendarEvent, existing?: CalendarEvent) => {
    if (existing) await calendar.update(existing.id, input);
    else {
      await calendar.create(input, userId);
      const t = tickets.find((x) => x.id === input.ticketId);
      if (t) await startScheduling(t);
    }
    setSheet(null);
    await load();
  };

  const removeBooking = async (event: CalendarEvent) => {
    await calendar.remove(event.id);
    setSheet(null);
    await load();
  };

  // ---- drag and drop ----

  const startDrag = (e: DragEvent, payload: Payload) => {
    dragRef.current = payload;
    setDragging(payload);
    e.dataTransfer?.setData(MIME, JSON.stringify(payload));
    e.dataTransfer?.setData("text/plain", payload.type === "ticket" ? payload.ticketId : payload.id);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
  };

  const endDrag = () => {
    dragRef.current = null;
    setDragging(null);
    setOver(null);
  };

  const readPayload = (e: DragEvent): Payload | null => {
    if (dragRef.current) return dragRef.current;
    try {
      const raw = e.dataTransfer?.getData(MIME);
      return raw ? (JSON.parse(raw) as Payload) : null;
    } catch {
      return null;
    }
  };

  const dropOn = (e: DragEvent, lane: Lane, day: Date) => {
    e.preventDefault();
    const p = readPayload(e);
    endDrag();
    if (!p || !editable) return;
    if (p.type === "ticket") {
      const t = tickets.find((x) => x.id === p.ticketId);
      if (t) void placeTicket(t, lane, day);
    } else {
      const ev = events.find((x) => x.id === p.id);
      if (ev) moveBooking(ev, lane, day);
    }
  };

  const softCount = boardEvents.filter((e) => e.status === "tentative").length;
  const confirmedCount = boardEvents.length - softCount;
  const style = { "--days": days.length } as CSSProperties;

  return (
    <ModulePage title="Scheduling board" description="Drag signed jobs onto crew lanes. They stay soft until you confirm them.">
      <div className="cal-toolbar">
        <div className="cal-nav">
          <Button size="sm" onClick={() => go(new Date())}>
            This week
          </Button>
          <button type="button" className="icon-btn" onClick={() => go(addDays(monday, -7))} aria-label="Previous week">
            <Icon name="collapse" />
          </button>
          <button type="button" className="icon-btn" onClick={() => go(addDays(monday, 7))} aria-label="Next week">
            <Icon name="next" />
          </button>
          <h2 className="cal-title" aria-live="polite">
            {formatRangeTitle("week", monday)}
          </h2>
        </div>
        <div className="cal-actions">
          <ViewSwitch view="board" />
          <Link className="btn btn--secondary btn--sm" to={`/calendar?view=week&date=${mondayKey}`}>
            Open in calendar
          </Link>
        </div>
      </div>

      {error && (
        <p className="settings-error" role="alert">
          {error}
        </p>
      )}
      <p className="visually-hidden" aria-live="polite">
        {notice}
      </p>

      <Section title={`Waiting to be scheduled (${queue.length})`} storageKey="board-queue" defaultOpen>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : queue.length === 0 ? (
          <p className="muted">Nothing waiting. Jobs show up here once their ticket is marked Signed.</p>
        ) : (
          <>
            {editable && <p className="board-hint muted">Drag a job onto a crew's day to pencil it in for the crew's hours. On a phone, use Schedule.</p>}
            <ul className="board-queue" aria-label="Jobs waiting to be scheduled">
              {queue.map((item) => (
                <QueueCard
                  key={item.ticket.id}
                  item={item}
                  editable={editable}
                  busy={busy === `confirm-${item.ticket.id}` || busy === `drop-${item.ticket.id}`}
                  dragging={dragging?.type === "ticket" && dragging.ticketId === item.ticket.id}
                  onDragStart={(e) => startDrag(e, { type: "ticket", ticketId: item.ticket.id })}
                  onDragEnd={endDrag}
                  onSchedule={() => scheduleWithForm(item.ticket)}
                  onConfirm={() => void confirmJob(item)}
                />
              ))}
            </ul>
          </>
        )}
      </Section>

      <div className="cal-legend" aria-label="Legend">
        <span className="cal-key">
          <i className="ev-swatch ev--teal ev--tentative" /> Soft (pencilled in)
        </span>
        <span className="cal-key">
          <i className="ev-swatch ev--teal" /> Confirmed
        </span>
        <span className="cal-count muted">
          {loading ? "Loading…" : `${confirmedCount} confirmed · ${softCount} soft`}
        </span>
      </div>

      {!crewsLoading && crews.filter((c) => c.active).length === 0 && (
        <p className="pb-note">
          No crews yet. <Link to="/settings">Add crews in Settings</Link> to get a lane for each one.
        </p>
      )}

      <div className="board-scroll">
        <div className={`board${dragging ? " board--dragging" : ""}`} style={style} role="grid" aria-label="Crew lanes for the week">
          <div className="board-row board-row--head" role="row">
            <div className="board-corner" role="columnheader">
              Crew
            </div>
            {days.map((d) => (
              <div key={toDateKey(d)} role="columnheader" className={`board-dayhead${toDateKey(d) === toDateKey(new Date()) ? " is-today" : ""}`}>
                <Link className="tg-daylink" to={`/calendar?view=day&date=${toDateKey(d)}`} aria-label={`Open ${LONG.format(d)} in the calendar`}>
                  <span className="tg-dow">{WEEKDAY.format(d)}</span>
                  <span className="tg-dom">{d.getDate()}</span>
                </Link>
              </div>
            ))}
          </div>
          {lanes.map((lane) => {
            const fits = draggedTicket && lane.crew ? crewFits(lane.crew, draggedTicket.trade) : false;
            return (
              <div key={lane.key} className={`board-row${fits ? " is-match" : ""}`} role="row">
                <div className="board-lane" role="rowheader">
                  {lane.crew ? (
                    <>
                      <CrewChip name={lane.crew.name} color={lane.crew.color} retired={!lane.crew.active} />
                      <small className="muted">{formatHours(lane.crew.dayStart, lane.crew.dayEnd)}</small>
                      {fits && <small className="board-fit">Does {draggedTicket?.trade}</small>}
                    </>
                  ) : (
                    <>
                      <strong>No crew</strong>
                      <small className="muted">Jobs not given to a crew yet</small>
                    </>
                  )}
                </div>
                {days.map((d) => {
                  const key = `${lane.key}|${toDateKey(d)}`;
                  const list = laneEvents(lane, d);
                  const off = lane.crew ? !worksOn(lane.crew, d) : false;
                  const hours = hoursOn(list, d);
                  const full = lane.crew ? crewDayHours(lane.crew) : 0;
                  return (
                    <div
                      key={key}
                      role="gridcell"
                      aria-label={`${lane.crew?.name ?? "No crew"}, ${LONG.format(d)}`}
                      className={["board-cell", off ? "is-off" : "", over === key ? "is-over" : "", lane.crew ? `ev--${lane.crew.color}` : ""].filter(Boolean).join(" ")}
                      onDragOver={(e) => {
                        if (!editable) return;
                        e.preventDefault();
                        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
                        if (over !== key) setOver(key);
                      }}
                      onDragLeave={() => setOver((o) => (o === key ? null : o))}
                      onDrop={(e) => dropOn(e, lane, d)}
                    >
                      {off && list.length === 0 && <span className="board-off">Off</span>}
                      {list.map((ev) => (
                        <BookingCard
                          key={ev.id}
                          event={ev}
                          color={eventColor(ev, colorOf(ev.crewId))}
                          editable={editable}
                          dragging={dragging?.type === "booking" && dragging.id === ev.id}
                          onDragStart={(e) => startDrag(e, { type: "booking", id: ev.id })}
                          onDragEnd={endDrag}
                          onOpen={() => setSheet({ mode: "edit", event: ev })}
                        />
                      ))}
                      {lane.crew && hours > 0 && (
                        <span className={`board-hours${hours > full ? " is-over-time" : ""}`}>
                          {hours} of {full} h
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <EventSheet state={sheet} editable={editable} people={people} onClose={() => setSheet(null)} onSave={saveSheet} onDelete={removeBooking} />
    </ModulePage>
  );
}

function QueueCard({
  item,
  editable,
  busy,
  dragging,
  onDragStart,
  onDragEnd,
  onSchedule,
  onConfirm,
}: {
  item: QueueItem;
  editable: boolean;
  busy: boolean;
  dragging: boolean;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
  onSchedule: () => void;
  onConfirm: () => void;
}) {
  const t = item.ticket;
  const booked = item.soft + item.confirmed > 0;
  return (
    <li
      className={`board-job${dragging ? " is-dragging" : ""}${editable ? " is-draggable" : ""}`}
      draggable={editable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      aria-label={`#${t.number} ${t.title}`}
    >
      <div className="board-job-head">
        <Link to={`/tickets/${t.number}`} className="board-job-title" draggable={false}>
          #{t.number} {t.title}
        </Link>
        <Badge tone={t.stage === "signed" ? "good" : "warn"}>{STAGE_LABELS[t.stage]}</Badge>
      </div>
      <p className="board-job-meta">
        {[t.customer, t.site].filter(Boolean).join(" · ")}
        <br />
        {[t.trade, t.estimatedValue !== null ? money.format(t.estimatedValue) : ""].filter(Boolean).join(" · ")}
      </p>
      <p className={`board-job-booked${booked ? "" : " muted"}`}>{bookedSummary(item)}</p>
      {editable && (
        <div className="board-job-actions">
          <Button size="sm" onClick={onSchedule} disabled={busy}>
            Schedule…
          </Button>
          {booked && (
            <Button size="sm" variant="primary" onClick={onConfirm} disabled={busy}>
              {busy ? "Saving…" : "Confirm schedule"}
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

function BookingCard({
  event,
  color,
  editable,
  dragging,
  onDragStart,
  onDragEnd,
  onOpen,
}: {
  event: CalendarEvent;
  color: string;
  editable: boolean;
  dragging: boolean;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
  onOpen: () => void;
}) {
  const soft = event.status === "tentative";
  const time = formatTimeRange(new Date(event.start), new Date(event.end));
  const label = `${event.title}, ${time}, ${soft ? "soft" : "confirmed"}`;
  return (
    <div
      className={`ev board-card ev--${color}${soft ? " ev--tentative" : ""}${dragging ? " is-dragging" : ""}${editable ? " ev--editable" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={label}
      title={label}
      draggable={editable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <span className="ev-title">
        {event.ticketNumber ? `#${event.ticketNumber} ` : ""}
        {event.title}
      </span>
      <span className="ev-time">{time}</span>
      {event.site && <span className="ev-meta">{event.site}</span>}
      <span className={`board-status${soft ? "" : " is-confirmed"}`}>{soft ? "Soft" : "Confirmed"}</span>
    </div>
  );
}
