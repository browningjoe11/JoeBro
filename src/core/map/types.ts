import type { SitePlace } from "../calendar/types";

export interface GeoPoint {
  lat: number;
  lng: number;
}

/** The address parts a lookup needs. */
export type SiteAddress = Pick<SitePlace, "street" | "city" | "state" | "zip">;

/**
 * Turns job-site addresses into map positions and remembers them on the property,
 * so each address is looked up once. The live app asks OpenStreetMap's free
 * Nominatim service and saves to `properties.latitude/longitude`; preview mode
 * and tests use `memoryGeo()`.
 */
export interface GeoBackend {
  /** The address's position, or null when it can't be found. */
  locate(address: SiteAddress): Promise<GeoPoint | null>;
  /** Saves a found position on the property so the next load skips the lookup. */
  save(propertyId: string, point: GeoPoint): Promise<void>;
}
