import type { Session as SbSession, SupabaseClient } from "@supabase/supabase-js";
import { ALL_ROLES, type Role } from "../modules";
import type { AuthClient, Profile, Session } from "./types";

const toSession = (s: SbSession | null): Session | null => (s ? { userId: s.user.id, email: s.user.email ?? null } : null);

/** Friendlier wording for the errors people actually hit. */
function explain(message: string): string {
  if (/invalid login credentials/i.test(message)) return "That email and password don't match. Try again or use an email link.";
  if (/email not confirmed/i.test(message)) return "Confirm your email first, using the link we sent you.";
  if (/signups not allowed|user not found/i.test(message)) return "There's no account for that email. Ask an admin to add you.";
  if (/rate limit|too many/i.test(message)) return "Too many tries. Wait a few minutes and try again.";
  return message;
}

export function supabaseAuth(sb: SupabaseClient): AuthClient {
  return {
    async getSession() {
      const { data } = await sb.auth.getSession();
      return toSession(data.session);
    },
    onChange(callback) {
      // Supabase warns against calling it from inside this callback, so only pass the session on.
      const { data } = sb.auth.onAuthStateChange((_event, session) => callback(toSession(session)));
      return () => data.subscription.unsubscribe();
    },
    async signInWithPassword(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      return error ? explain(error.message) : null;
    },
    async sendSignInLink(email) {
      const { error } = await sb.auth.signInWithOtp({
        email,
        // Accounts are added by an admin; the sign-in screen never creates one.
        options: { shouldCreateUser: false, emailRedirectTo: window.location.origin + window.location.pathname },
      });
      return error ? explain(error.message) : null;
    },
    async signOut() {
      await sb.auth.signOut();
    },
    async loadProfile(userId) {
      const { data, error } = await sb.from("profiles").select("id, email, full_name, role, active").eq("id", userId).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data || !ALL_ROLES.includes(data.role as Role)) return null;
      return { id: data.id, email: data.email, fullName: data.full_name, role: data.role as Role, active: data.active } satisfies Profile;
    },
  };
}
