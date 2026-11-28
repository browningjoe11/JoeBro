import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import { formatTimeRange } from "../calendar";
import { boundsOf, SERVICE_AREA, stopColor, type CrewDay } from "./geo";
import "./map.css";

export interface JobMapProps {
  days: readonly CrewDay[];
  /** Booking id of the highlighted stop. */
  selected: string | null;
  onSelect: (eventId: string) => void;
}

/** Free OpenStreetMap tiles. Their policy asks for the attribution and light use, which one office fits. */
const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/**
 * Leaflet map of one day's stops: a numbered pin per booking in its crew's
 * color, joined in time order by a dashed line (the order of the day, not the
 * drive; real routes arrive with O4). Loaded only when the map view opens.
 */
export default function JobMap({ days, selected, onSelect }: JobMapProps) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const markers = useRef(new Map<string, L.Marker>());
  const select = useRef(onSelect);
  select.current = onSelect;

  useEffect(() => {
    if (!box.current) return;
    const m = L.map(box.current, { scrollWheelZoom: true, zoomControl: true });
    L.tileLayer(TILES, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(m);
    m.fitBounds([
      [SERVICE_AREA.south, SERVICE_AREA.west],
      [SERVICE_AREA.north, SERVICE_AREA.east],
    ]);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    // The box can change size with the sidebar or the window; keep tiles filling it.
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => m.invalidateSize());
    ro?.observe(box.current);
    return () => {
      ro?.disconnect();
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    const group = layer.current;
    if (!m || !group) return;
    group.clearLayers();
    markers.current.clear();
    const all: L.LatLngExpression[] = [];
    for (const day of days) {
      const line: L.LatLngExpression[] = [];
      for (const stop of day.stops) {
        if (!stop.point) continue;
        const at: L.LatLngExpression = [stop.point.lat, stop.point.lng];
        line.push(at);
        all.push(at);
        const color = stopColor(stop, day);
        const soft = stop.event.status === "tentative";
        const icon = L.divIcon({
          className: "map-pin-wrap",
          html: `<span class="map-pin ev--${color}${soft ? " is-soft" : ""}">${stop.n}</span>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
          popupAnchor: [0, -16],
        });
        const who = day.crew?.name ?? "No crew";
        const marker = L.marker(at, { icon, title: `${stop.n}. ${stop.event.title} (${who})`, keyboard: true, riseOnHover: true });
        marker.bindPopup(popup(`${stop.n}. ${stop.event.ticketLabel || stop.event.title}`, `${who} · ${formatTimeRange(new Date(stop.event.start), new Date(stop.event.end))}${soft ? " · soft" : ""}`, stop.event.site));
        marker.on("click", () => select.current(stop.event.id));
        marker.addTo(group);
        markers.current.set(stop.event.id, marker);
      }
      if (line.length > 1) L.polyline(line, { className: `map-route ev--${day.color}`, weight: 3, dashArray: "6 8", interactive: false }).addTo(group);
    }
    const b = boundsOf(all.map((p) => {
      const [lat, lng] = p as [number, number];
      return { lat, lng };
    }));
    if (b) m.fitBounds([[b.south, b.west], [b.north, b.east]], { padding: [40, 40], maxZoom: 14 });
  }, [days]);

  useEffect(() => {
    if (!selected) return;
    const marker = markers.current.get(selected);
    if (!marker || !map.current) return;
    map.current.panTo(marker.getLatLng());
    marker.openPopup();
  }, [selected, days]);

  return <div ref={box} className="job-map" role="region" aria-label="Map of the day's jobs" />;
}

/** Popup built from text nodes, so names and addresses can't inject markup. */
function popup(title: string, when: string, where: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "map-popup";
  for (const [tag, text] of [["strong", title], ["span", when], ["span", where]] as const) {
    if (!text) continue;
    const part = document.createElement(tag);
    part.textContent = text;
    el.appendChild(part);
  }
  return el;
}
