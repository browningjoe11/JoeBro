import { createContext, useContext, type ReactNode } from "react";
import type { GeoBackend } from "./types";

const GeoContext = createContext<GeoBackend | null>(null);

export function GeoProvider({ backend, children }: { backend: GeoBackend; children: ReactNode }) {
  return <GeoContext.Provider value={backend}>{children}</GeoContext.Provider>;
}

export function useGeo(): GeoBackend {
  const ctx = useContext(GeoContext);
  if (!ctx) throw new Error("useGeo must be used inside <GeoProvider>");
  return ctx;
}
