import type { Role } from "../modules";
import type { AuthClient, Profile, Session } from "./types";

export interface FakeUser {
  email: string;
  password: string;
  role: Role;
  active?: boolean;
  fullName?: string;
}

/** In-memory sign-in service for tests. */
export function fakeAuth(users: FakeUser[], signedInAs?: string) {
  const listeners = new Set<(s: Session | null) => void>();
  const find = (email: string) => users.find((u) => u.email === email.toLowerCase());
  const sessionFor = (u: FakeUser): Session => ({ userId: u.email, email: u.email });
  let current: Session | null = signedInAs && find(signedInAs) ? sessionFor(find(signedInAs)!) : null;
  const emit = () => listeners.forEach((l) => l(current));
  const linksSent: string[] = [];

  const client: AuthClient = {
    getSession: async () => current,
    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    async signInWithPassword(email, password) {
      const u = find(email);
      if (!u || u.password !== password) return "That email and password don't match.";
      current = sessionFor(u);
      emit();
      return null;
    },
    async sendSignInLink(email) {
      if (!find(email)) return "There's no account for that email.";
      linksSent.push(email);
      return null;
    },
    async signOut() {
      current = null;
      emit();
    },
    async loadProfile(userId): Promise<Profile | null> {
      const u = find(userId);
      return u ? { id: userId, email: u.email, fullName: u.fullName ?? "", role: u.role, active: u.active ?? true } : null;
    },
  };
  return { client, linksSent };
}
