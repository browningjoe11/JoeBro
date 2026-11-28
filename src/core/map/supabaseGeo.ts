import type { SupabaseClient } from "@supabase/supabase-js";
import { nominatimLocator } from "./nominatim";
import type { GeoBackend } from "./types";

/** Live lookups: Nominatim finds the address, the position is saved on `properties`. */
export function supabaseGeo(sb: SupabaseClient, locate = nominatimLocator()): GeoBackend {
  return {
    locate,
    async save(propertyId, point) {
      const { error } = await sb.from("properties").update({ latitude: point.lat, longitude: point.lng }).eq("id", propertyId);
      if (error) throw new Error(error.message);
    },
  };
}
