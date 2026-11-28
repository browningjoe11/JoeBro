import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { addDays, formatRangeTitle, formatTimeRange, fromDateKey, sameDay, startOfDay, toDateKey, useCalendar, type CalendarEvent } from "../../core/calendar";
import { CrewChip, useCrews } from "../../core/crews";
import { Icon } from "../../core/Icon";
import { crewDays, needsLookup, onMap, stopColor, useGeo, type GeoPoint } from "../../core/map";
import { ModulePage } from "../../core/ModulePage";
import { Button } from "../../ui";
import { ViewSwitch } from "./ViewSwitch";
import "./map-view.css";

const JobMap = lazy(() => import("../../core/map/JobMap"));

/**
 * One day on the map: every booking at a job site as a numbered pin in its
 * crew's color, with the same stops listed by crew beside it. Addresses without
 * a saved position are looked up (free OpenStreetMap Nominatim, one a second)
 * and saved on the property, so each is looked up once.
 */
export function MapView() {
  const calendar = useCalendar();
  const geo = useGeo();
  const { crews, loading: crewsLoading } = useCrews();
  const [params, setParams] = useSearchParams();
  const day = useMemo(() => fromDateKey(params.get("date")) ?? startOfDay(new Date()), [params]);
  const dayKey = toDateKey(day);

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  /** Positions found this session (or null = not found), by property id. */
  const [found, setFound] = useState<Map<string, GeoPoint | null>>(() => new Map());
  const [looking, setLooking] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    const from = fromDateKey(dayKey)!;
    setLoading(true);
    try {
      setEvents(await calendar.list(from, addDays(from, 1)));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [calendar, dayKey]);

  useEffect(() => {
    void load();
  }, [load]);

  // Look up job sites that have no saved position yet, one after another.
  useEffect(() => {
    const todo = needsLookup(events.filter(onMap), found);
    if (todo.length === 0) return;
    let stop = false;
    setLooking(todo.length);
    void (async () => {
      for (const place of todo) {
        if (stop) return;
        let point: GeoPoint | null = null;
        try {
          point = await geo.locate(place);
          if (point) await geo.save(place.propertyId, point).catch(() => {});
        } catch (e) {
          if (!stop) setError(e instanceof Error ? e.message : String(e));
          // Leave it untried so the next visit tries again.
          setLooking((n) => n - 1);
          continue;
        }
        if (stop) return;
        setFound((prev) => new Map(prev).set(place.propertyId, point));
        setLooking((n) => n - 1);
      }
    })();
    return () => {
      stop = true;
      setLooking(0);
    };
    // `found` is read for what's already tried; re-running on every hit would restart the queue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, geo]);

  const days = useMemo(() => crewDays(events, crews, day, found), [events, crews, day, found]);
  const stops = days.reduce((n, d) => n + d.stops.length, 0);
  const pinned = days.reduce((n, d) => n + d.stops.filter((s) => s.point).length, 0);
  const others = events.filter((e) => !onMap(e) && sameDay(new Date(e.start), day));

  const go = (date: Date) => {
    const p = new URLSearchParams(params);
    p.set("date", toDateKey(date));
    setParams(p, { replace: true });
    setSelected(null);
  };

  return (
    <ModulePage title="Job map" description="Every job for the day on the map, in its crew's color.">
      <div className="cal-toolbar">
        <div className="cal-nav">
          <Button size="sm" onClick={() => go(new Date())}>
            Today
          </Button>
          <button type="button" className="icon-btn" onClick={() => go(addDays(day, -1))} aria-label="Previous day">
            <Icon name="collapse" />
          </button>
          <button type="button" className="icon-btn" onClick={() => go(addDays(day, 1))} aria-label="Next day">
            <Icon name="next" />
          </button>
          <h2 className="cal-title" aria-live="polite">
            {formatRangeTitle("day", day)}
          </h2>
          <label className="map-date">
            <span className="visually-hidden">Pick a day</span>
            <input type="date" value={dayKey} onChange={(e) => fromDateKey(e.target.value) && go(fromDateKey(e.target.value)!)} />
          </label>
        </div>
        <div className="cal-actions">
          <ViewSwitch view="map" />
          <Link className="btn btn--secondary btn--sm" to={`/calendar?view=day&date=${dayKey}`}>
            Open in calendar
          </Link>
        </div>
      </div>

      {error && (
        <p className="settings-error" role="alert">
          {error}
        </p>
      )}

      <div className="map-layout">
        <aside className="map-side" aria-label="Stops by crew">
          <p className="map-count muted" aria-live="polite">
            {loading || crewsLoading
              ? "Loading…"
              : stops === 0
                ? "Nothing booked at a job site this day."
                : `${stops} stop${stops === 1 ? "" : "s"} · ${pinned} on the map${looking > 0 ? ` · finding ${looking} address${looking === 1 ? "" : "es"}…` : ""}`}
          </p>
          {days.map((d) => (
            <section key={d.key} className="map-crew" aria-label={d.crew?.name ?? "No crew"}>
              <h3 className="map-crew-head">
                {d.crew ? <CrewChip name={d.crew.name} color={d.crew.color} retired={!d.crew.active} /> : <strong>No crew</strong>}
                <small className="muted">
                  {d.stops.length} stop{d.stops.length === 1 ? "" : "s"}
                </small>
              </h3>
              <ol className="map-stops">
                {d.stops.map((s) => {
                  const e = s.event;
                  const tried = e.place ? found.has(e.place.propertyId) : false;
                  return (
                    <li key={e.id} className={`map-stop${selected === e.id ? " is-selected" : ""}`} aria-label={`${s.n}. ${e.ticketLabel || e.title}`}>
                      <button type="button" className={`map-stop-n map-pin ev--${stopColor(s, d)}${e.status === "tentative" ? " is-soft" : ""}`} onClick={() => setSelected(e.id)} aria-label={`Show stop ${s.n} on the map`} disabled={!s.point}>
                        {s.n}
                      </button>
                      <div className="map-stop-body">
                        {e.ticketNumber !== null ? (
                          <Link className="map-stop-title" to={`/tickets/${e.ticketNumber}`}>
                            {e.ticketLabel}
                          </Link>
                        ) : (
                          <span className="map-stop-title">{e.title}</span>
                        )}
                        <span className="map-stop-meta">
                          {formatTimeRange(new Date(e.start), new Date(e.end))}
                          {e.status === "tentative" ? " · soft" : ""}
                          {e.kind === "site_visit" ? " · site visit" : ""}
                        </span>
                        <span className="map-stop-meta">{e.site || "No address on the ticket"}</span>
                        {!s.point && e.place && tried && <span className="map-stop-warn">Couldn't find this address on the map. Check it on the ticket.</span>}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
          {others.length > 0 && (
            <p className="map-others muted">
              {others.length} other booking{others.length === 1 ? "" : "s"} without a job site (not on the map).
            </p>
          )}
        </aside>
        <div className="map-main">
          <Suspense fallback={<div className="job-map-loading muted">Loading map…</div>}>
            <JobMap days={days} selected={selected} onSelect={setSelected} />
          </Suspense>
        </div>
      </div>
    </ModulePage>
  );
}
