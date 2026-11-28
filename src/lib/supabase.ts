import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_URL = "https://nczrjscihxnssuvrshgy.supabase.co";

let client: SupabaseClient | null | undefined;

/**
 * The shared Supabase client, or null when no publishable key is configured
 * (the app then runs in preview mode with no sign-in and no data).
 */
export function getSupabase(): SupabaseClient | null {
  if (client === undefined) {
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const url = import.meta.env.VITE_SUPABASE_URL || DEFAULT_URL;
    client = key ? createClient(url, key) : null;
  }
  return client;
}
