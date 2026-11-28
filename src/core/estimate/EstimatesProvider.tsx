import { createContext, useContext, type ReactNode } from "react";
import type { EstimatesBackend } from "./store";

const EstimatesContext = createContext<EstimatesBackend | null>(null);

/** Gives every screen that shows estimates (the builder, the Sales list, tickets) the same store. */
export function EstimatesProvider({ backend, children }: { backend: EstimatesBackend; children: ReactNode }) {
  return <EstimatesContext.Provider value={backend}>{children}</EstimatesContext.Provider>;
}

export function useEstimates(): EstimatesBackend {
  const ctx = useContext(EstimatesContext);
  if (!ctx) throw new Error("useEstimates must be used inside <EstimatesProvider>");
  return ctx;
}
