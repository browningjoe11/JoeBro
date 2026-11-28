import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { addDays, formatTimeRange, fromDateKey, KIND_LABELS, sameDay, startOfDay, toDateKey, useCalendar, type CalendarEvent } from "../../core/calendar";
import { useContacts } from "../../core/contacts";
import { CrewChip, useCrews } from "../../core/crews";
import { useCurrentUser } from "../../core/currentUser";
import { ModulePage } from "../../core/ModulePage";
import { dayStops, directionsUrl, fullAddress, techForLogin, telHref, type DayOwner } from "../../core/onsite";
import { useTickets } from "../../core/tickets";
import { Badge, Button, SelectField } from "../../ui";
import "./myDay.css";

/** Everything a tech needs at one stop: the booking, plus the ticket's customer, scope and site. */
export interface Stop {
  event: CalendarEvent;
  title: string;
  customer: string;
  phone: string;
  address: string;
  accessNotes: string;
  scope: string;
  ticketNumber: number | null;
}

const DAY = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" });
const SHORT = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });
/** How far ahead "Next job" looks when the day is empty. */
const LOOK_AHEAD_DAYS = 14;

/**
 * The tech's My Day screen (chunk M1): today's stops in route order, each with
 * big Navigate and Call buttons, the full scope of work and the site notes.
 * A tech sees their own crew's day; office roles pick a crew to see its day.
 */
export function MyDay() {
  const { id: userId, role } = useCurrentUser();
  const calendar = useCalendar();
  const tickets = useTickets();
  const contacts = useContacts();
  const { crews, technicians, crewById, loading: crewsLoading } = useCrews();
  const [params, setParams] = useSearchParams();

  const me = techForLogin(technicians, userId);
  const activeCrews = crews.filter((c) => c.active);
  // A signed-in tech always sees their own day. Office roles, and preview mode, pick a crew.
  const lockedToMe = role === "technician" && userId !== null;
  const pickedCrew = params.get("crew");
  const crewId = lockedToMe ? (me?.crewId ?? null) : (pickedCrew ?? me?.crewId ?? activeCrews[0]?.id ?? null);
  const owner: DayOwner = useMemo(() => ({ crewId, profileId: lockedToMe ? userId : null }), [crewId, lockedToMe, userId]);

  const day = useMemo(() => fromDateKey(params.get("date")) ?? startOfDay(new Date()), [params]);
  const dayKey = toDateKey(day);
  const isToday = sameDay(day, new Date());

  const [stops, setStops] = useState<Stop[] | null>(null);
  const [nextDay, setNextDay] = useState<Date | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (crewsLoading) return;
    let live = true;
    setStops(null);
    setNextDay(null);
    setError("");
    const start = fromDateKey(dayKey)!;
    const end = addDays(start, 1);
    (async () => {
      const events = dayStops(await calendar.list(start, end), owner, start, end);
      const loaded = await Promise.all(events.map((e) => loadStop(e)));
      if (!live) return;
      setStops(loaded);
      if (loaded.length === 0 && (owner.crewId || owner.profileId)) {
        const ahead = dayStops(await calendar.list(end, addDays(end, LOOK_AHEAD_DAYS)), owner, end, addDays(end, LOOK_AHEAD_DAYS));
        if (live && ahead[0]) setNextDay(startOfDay(new Date(ahead[0].start)));
      }
    })().catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };

    /** Fills in the ticket's customer, scope and site. A booking with no ticket shows what the booking itself has. */
    async function loadStop(e: CalendarEvent): Promise<Stop> {
      const base: Stop = {
        event: e,
        title: e.title,
        customer: "",
        phone: "",
        address: fullAddress(e.site),
        accessNotes: "",
        scope: "",
        ticketNumber: e.ticketNumber,
      };
      if (e.ticketNumber === null) return base;
      const t = await tickets.get(e.ticketNumber);
      if (!t) return base;
      const stop: Stop = { ...base, title: t.title, customer: t.customer, phone: t.phone, scope: t.scope, address: fullAddress(t.site || e.site) };
      // Site notes (gate codes, lockbox, dogs) and the full address live on the customer's property.
      try {
        const c = t.propertyId ? await contacts.get(t.contactId) : null;
        const p = c?.properties.find((x) => x.id === t.propertyId);
        if (p) return { ...stop, address: fullAddress(p) || stop.address, accessNotes: p.accessNotes };
      } catch {
        // The ticket's own address is enough to drive there.
      }
      return stop;
    }
  }, [calendar, tickets, contacts, owner, dayKey, crewsLoading]);

  const go = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };
  const crew = crewById(crewId);

  return (
    <ModulePage title="My Day" description="Today's jobs in driving order. Tap Navigate to get directions, or Call to reach the customer.">
      <div className="myday">
        <div className="myday-bar">
          <div className="myday-date">
            <Button aria-label="Previous day" onClick={() => go({ date: toDateKey(addDays(day, -1)) })}>
              ‹
            </Button>
            <h2 className="myday-day">
              {isToday && <span className="myday-today">Today · </span>}
              {DAY.format(day)}
            </h2>
            <Button aria-label="Next day" onClick={() => go({ date: toDateKey(addDays(day, 1)) })}>
              ›
            </Button>
            {!isToday && (
              <Button variant="ghost" onClick={() => go({ date: null })}>
                Back to today
              </Button>
            )}
          </div>
          {lockedToMe ? (
            crew && <CrewChip name={crew.name} color={crew.color} />
          ) : (
            <SelectField
              label="Crew"
              value={crewId ?? ""}
              onChange={(e) => go({ crew: e.target.value || null })}
              disabled={activeCrews.length === 0}
            >
              {activeCrews.length === 0 && <option value="">No crews yet</option>}
              {activeCrews.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
          )}
        </div>

        {error && (
          <p className="myday-error" role="alert">
            Couldn't load the day: {error}
          </p>
        )}

        {lockedToMe && !crewsLoading && !me && (
          <p className="myday-empty">Your login isn't linked to a technician yet. Ask the office to link it in Settings → Crews and techs.</p>
        )}
        {lockedToMe && me && !me.crewId && stops?.length === 0 && (
          <p className="myday-hint">You're not on a crew, so only jobs booked to you personally show here.</p>
        )}

        {stops === null && !error ? (
          <p className="myday-empty" aria-busy="true">
            Loading the day…
          </p>
        ) : stops && stops.length === 0 ? (
          <div className="myday-empty">
            <p>No jobs booked {isToday ? "today" : `for ${DAY.format(day)}`}.</p>
            {nextDay && (
              <Button variant="primary" size="lg" onClick={() => go({ date: toDateKey(nextDay) })}>
                Next job: {SHORT.format(nextDay)}
              </Button>
            )}
          </div>
        ) : (
          <ol className="myday-stops" aria-label="Stops in driving order">
            {stops?.map((s, i) => (
              <li key={s.event.id}>
                <StopCard stop={s} n={i + 1} />
              </li>
            ))}
          </ol>
        )}
      </div>
    </ModulePage>
  );
}

function StopCard({ stop, n }: { stop: Stop; n: number }) {
  const { event: e } = stop;
  const tel = telHref(stop.phone);
  const firstName = stop.customer.split(" ")[0];
  return (
    <article className="stop" aria-labelledby={`stop-${e.id}`}>
      <header className="stop-head">
        <span className="stop-num" aria-label={`Stop ${n}`}>
          {n}
        </span>
        <span className="stop-time">{formatTimeRange(new Date(e.start), new Date(e.end))}</span>
        {e.kind !== "job" && <Badge tone="info">{KIND_LABELS[e.kind]}</Badge>}
        {e.status === "tentative" && <Badge tone="warn">Not confirmed yet</Badge>}
      </header>

      <h3 className="stop-title" id={`stop-${e.id}`}>
        {stop.title}
      </h3>
      {stop.customer && <p className="stop-customer">{stop.customer}</p>}
      {stop.address && <p className="stop-address">{stop.address}</p>}

      <div className="stop-actions">
        {stop.address && (
          <a className="stop-btn stop-btn--go" href={directionsUrl(stop.address)} target="_blank" rel="noopener noreferrer">
            Navigate
          </a>
        )}
        {tel && (
          <a className="stop-btn" href={tel}>
            Call {firstName || "customer"}
          </a>
        )}
      </div>

      {stop.accessNotes && (
        <p className="stop-access">
          <strong>Site notes: </strong>
          {stop.accessNotes}
        </p>
      )}

      <section className="stop-block" aria-label="Scope of work">
        <h4>Scope of work</h4>
        <p className="stop-text">{stop.scope.trim() || "No scope written on the ticket yet. Call the office before starting."}</p>
      </section>

      {e.notes.trim() && (
        <section className="stop-block" aria-label="Booking notes">
          <h4>Notes from the office</h4>
          <p className="stop-text">{e.notes}</p>
        </section>
      )}

      {stop.ticketNumber !== null && (
        <footer className="stop-foot">
          <Link to={`/tickets/${stop.ticketNumber}`}>Open ticket #{stop.ticketNumber}</Link>
          {tel && <span className="stop-phone">{stop.phone}</span>}
        </footer>
      )}
    </article>
  );
}
