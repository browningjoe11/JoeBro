import { createContext, useContext, type ReactNode } from "react";
import type { CalendarBackend } from "./types";

const CalendarContext = createContext<CalendarBackend | null>(null);

export function CalendarProvider({ backend, children }: { backend: CalendarBackend; children: ReactNode }) {
  return <CalendarContext.Provider value={backend}>{children}</CalendarContext.Provider>;
}

export function useCalendar(): CalendarBackend {
  const ctx = useContext(CalendarContext);
  if (!ctx) throw new Error("useCalendar must be used inside <CalendarProvider>");
  return ctx;
}
