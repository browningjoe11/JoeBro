import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AuthClient, Profile, Session } from "./types";

export type AuthStatus = "loading" | "signed-out" | "signed-in";

interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  /** The signed-in person's profile; null if none was found or it couldn't load. */
  profile: Profile | null;
  profileError: string | null;
  signInWithPassword: AuthClient["signInWithPassword"];
  sendSignInLink: AuthClient["sendSignInLink"];
  signOut: () => Promise<void>;
  retryProfile: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface LoadedProfile {
  userId: string;
  profile: Profile | null;
  error: string | null;
}

export function AuthProvider({ client, children }: { client: AuthClient; children: ReactNode }) {
  // undefined = still checking for a saved session
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [loaded, setLoaded] = useState<LoadedProfile | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    client.getSession().then((s) => live && setSession((cur) => (cur === undefined ? s : cur)), () => live && setSession(null));
    const off = client.onChange((s) => setSession(s));
    return () => {
      live = false;
      off();
    };
  }, [client]);

  const userId = session?.userId;
  useEffect(() => {
    if (!userId) return;
    let live = true;
    client.loadProfile(userId).then(
      (profile) => live && setLoaded({ userId, profile, error: null }),
      (e: unknown) => live && setLoaded({ userId, profile: null, error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      live = false;
    };
  }, [client, userId, attempt]);

  const signOut = useCallback(async () => {
    await client.signOut();
    setSession(null);
    setLoaded(null);
  }, [client]);

  const value = useMemo<AuthContextValue>(() => {
    const ready = session && loaded?.userId === session.userId;
    return {
      status: session === undefined || (session && !ready) ? "loading" : session ? "signed-in" : "signed-out",
      session: session ?? null,
      profile: ready ? loaded.profile : null,
      profileError: ready ? loaded.error : null,
      signInWithPassword: (email, password) => client.signInWithPassword(email, password),
      sendSignInLink: (email) => client.sendSignInLink(email),
      signOut,
      retryProfile: () => {
        setLoaded(null);
        setAttempt((n) => n + 1);
      },
    };
  }, [client, session, loaded, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
