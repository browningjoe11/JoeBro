import { createContext, useContext, type ReactNode } from "react";
import type { TicketsBackend } from "./types";

const TicketsContext = createContext<TicketsBackend | null>(null);

export function TicketsProvider({ backend, children }: { backend: TicketsBackend; children: ReactNode }) {
  return <TicketsContext.Provider value={backend}>{children}</TicketsContext.Provider>;
}

export function useTickets(): TicketsBackend {
  const ctx = useContext(TicketsContext);
  if (!ctx) throw new Error("useTickets must be used inside <TicketsProvider>");
  return ctx;
}
