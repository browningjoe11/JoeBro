import { createContext, useContext, type ReactNode } from "react";
import type { Role } from "./modules";

export interface CurrentUser {
  /** Null in preview mode (nobody signed in). */
  id: string | null;
  name: string;
  /** Sign-in email, when known. */
  email?: string | null;
  role: Role;
}

const CurrentUserContext = createContext<CurrentUser>({
  id: null,
  name: "Preview",
  role: "admin",
});

/** Who is using the app right now, so screens can show only the actions their role allows. */
export function CurrentUserProvider({ user, children }: { user: CurrentUser; children: ReactNode }) {
  return <CurrentUserContext.Provider value={user}>{children}</CurrentUserContext.Provider>;
}

export function useCurrentUser(): CurrentUser {
  return useContext(CurrentUserContext);
}
