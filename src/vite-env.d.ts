/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL. Defaults to the Joebros project. */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase publishable (public) key. Without it the app runs in preview mode with no sign-in. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
