import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { PriceBookBackend, PriceItem } from "./types";

interface PriceBookState {
  backend: PriceBookBackend;
  /** Every item, retired ones included. Null until the first load finishes. */
  items: PriceItem[] | null;
  error: string | null;
  refresh: () => Promise<void>;
}

const PriceBookContext = createContext<(PriceBookState & { ensureLoaded: () => void }) | null>(null);

/** Holds the price book for every screen that prices work. It loads the first time a screen asks for it. */
export function PriceBookProvider({ backend, children }: { backend: PriceBookBackend; children: ReactNode }) {
  const [items, setItems] = useState<PriceItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const refresh = useCallback(async () => {
    try {
      setItems(await backend.list());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [backend]);

  const ensureLoaded = useCallback(() => {
    if (started.current) return;
    started.current = true;
    void refresh();
  }, [refresh]);

  const value = useMemo(() => ({ backend, items, error, refresh, ensureLoaded }), [backend, items, error, refresh, ensureLoaded]);
  return <PriceBookContext.Provider value={value}>{children}</PriceBookContext.Provider>;
}

export function usePriceBook(): PriceBookState {
  const ctx = useContext(PriceBookContext);
  if (!ctx) throw new Error("usePriceBook must be used inside <PriceBookProvider>");
  const { ensureLoaded, ...state } = ctx;
  useEffect(ensureLoaded, [ensureLoaded]);
  return state;
}
