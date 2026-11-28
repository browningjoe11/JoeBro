import { addressKey } from "./geo";
import type { GeoBackend, GeoPoint, SiteAddress } from "./types";

/** Rough positions for the sample job sites (town centers), so preview mode can draw pins without the internet. */
const SAMPLE_POINTS: Record<string, GeoPoint> = {
  "118 fox hall dr, dover, de 19904": { lat: 39.1717, lng: -75.5466 },
  "42 nw front st, milford, de 19963": { lat: 38.9146, lng: -75.4302 },
  "9 pilottown rd, lewes, de 19958": { lat: 38.7782, lng: -75.1419 },
  "27 delaware ave, rehoboth beach, de 19971": { lat: 38.7189, lng: -75.0786 },
  "310 walnut shade rd, camden, de 19934": { lat: 39.0946, lng: -75.5593 },
};

/** Lookups for preview mode and tests: a fixed table of addresses, and saved positions kept in memory. */
export function memoryGeo(opts: { points?: Record<string, GeoPoint> } = {}) {
  const table = new Map(Object.entries(opts.points ?? SAMPLE_POINTS).map(([k, v]) => [addressKey({ street: k, city: "", state: "", zip: "" }), v]));
  const saved = new Map<string, GeoPoint>();
  const lookups: string[] = [];
  const backend: GeoBackend = {
    async locate(a: SiteAddress) {
      await new Promise((r) => setTimeout(r, 0));
      lookups.push(addressKey(a));
      return table.get(addressKey(a)) ?? null;
    },
    async save(propertyId, point) {
      saved.set(propertyId, point);
    },
  };
  return { backend, saved, lookups };
}
