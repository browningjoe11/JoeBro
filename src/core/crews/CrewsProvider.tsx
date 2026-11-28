import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { EventColor } from "../calendar/types";
import type { Crew, CrewsBackend, Technician } from "./types";

interface CrewsState {
  backend: CrewsBackend;
  /** Every crew in saved order, retired ones included. */
  crews: Crew[];
  technicians: Technician[];
  /** True until the first load finishes. */
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  crewById: (id: string | null | undefined) => Crew | undefined;
  /** The crew's palette color, or null when there's no such crew. */
  colorOf: (id: string | null | undefined) => EventColor | null;
}

const CrewsContext = createContext<CrewsState | null>(null);

/** Holds crews and techs for every screen that shows a crew: Settings, the calendar, and later the board, map and onsite. */
export function CrewsProvider({ backend, children }: { backend: CrewsBackend; children: ReactNode }) {
  const [crews, setCrews] = useState<Crew[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await backend.list();
      setCrews(next.crews);
      setTechnicians(next.technicians);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [backend]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<CrewsState>(() => {
    const byId = new Map(crews.map((c) => [c.id, c]));
    return {
      backend,
      crews,
      technicians,
      loading,
      error,
      refresh,
      crewById: (id) => (id ? byId.get(id) : undefined),
      colorOf: (id) => (id ? (byId.get(id)?.color ?? null) : null),
    };
  }, [backend, crews, technicians, loading, error, refresh]);

  return <CrewsContext.Provider value={value}>{children}</CrewsContext.Provider>;
}

export function useCrews(): CrewsState {
  const ctx = useContext(CrewsContext);
  if (!ctx) throw new Error("useCrews must be used inside <CrewsProvider>");
  return ctx;
}
