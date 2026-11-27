import type { Role } from "../modules";

export interface Session {
  userId: string;
  email: string | null;
}

export interface Profile {
  id: string;
  email: string | null;
  fullName: string;
  role: Role;
  active: boolean;
}

/**
 * Everything the app needs from the sign-in service. The real one wraps
 * Supabase Auth; tests pass a fake.
 */
export interface AuthClient {
  getSession(): Promise<Session | null>;
  /** Calls back whenever someone signs in or out. Returns an unsubscribe function. */
  onChange(callback: (session: Session | null) => void): () => void;
  /** Resolves to an error message, or null on success. */
  signInWithPassword(email: string, password: string): Promise<string | null>;
  /** Emails a one-time sign-in link to an existing account. Resolves to an error message, or null. */
  sendSignInLink(email: string): Promise<string | null>;
  signOut(): Promise<void>;
  loadProfile(userId: string): Promise<Profile | null>;
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  sales: "Sales",
  operations: "Operations",
  technician: "Technician",
  reviewer: "Reviewer",
};
