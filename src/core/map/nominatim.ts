import { addressKey, nominatimUrl, parseNominatim } from "./geo";
import type { GeoPoint, SiteAddress } from "./types";

type Fetch = (url: string, init?: RequestInit) => Promise<Pick<Response, "ok" | "status" | "json">>;

/**
 * Address lookups through OpenStreetMap's free Nominatim service. Its usage
 * policy allows at most one request a second and asks for results to be kept,
 * so lookups queue one at a time with a gap, answers are cached for the
 * session, and the map saves every hit on the property.
 */
export function nominatimLocator(opts: { fetch?: Fetch; gapMs?: number } = {}) {
  const doFetch: Fetch = opts.fetch ?? ((url, init) => fetch(url, init));
  const gap = opts.gapMs ?? 1100;
  const cache = new Map<string, Promise<GeoPoint | null>>();
  let queue: Promise<unknown> = Promise.resolve();
  let last = 0;

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function ask(a: SiteAddress): Promise<GeoPoint | null> {
    const since = Date.now() - last;
    if (last && since < gap) await wait(gap - since);
    last = Date.now();
    const res = await doFetch(nominatimUrl(a), { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`The map lookup service answered ${res.status}. Try again in a minute.`);
    return parseNominatim(await res.json());
  }

  return function locate(a: SiteAddress): Promise<GeoPoint | null> {
    const key = addressKey(a);
    const hit = cache.get(key);
    if (hit) return hit;
    const next = queue.then(() => ask(a));
    queue = next.catch(() => {});
    cache.set(key, next);
    // A failed request (offline, rate limited) can be tried again later; "not found" is kept.
    next.catch(() => cache.delete(key));
    return next;
  };
}
