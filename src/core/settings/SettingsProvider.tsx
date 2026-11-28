import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ModuleDefinition } from "../modules";
import { DEFAULT_COMPANY, type CompanySettings, type ListItem, type ListName, type SettingsBackend } from "./types";

interface SettingsContextValue {
  backend: SettingsBackend;
  /** Every module in the app, so Settings can list them without importing the registry. */
  catalog: readonly ModuleDefinition[];
  company: CompanySettings;
  lists: ListItem[];
  /** True until the first load finishes. */
  loading: boolean;
  error: string | null;
  /** Reloads company settings and lists, e.g. after an admin saves a change. */
  refresh: () => Promise<void>;
  /** Active choices for one dropdown list, in order. */
  choices: (list: ListName) => string[];
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({
  backend,
  catalog = [],
  children,
}: {
  backend: SettingsBackend;
  catalog?: readonly ModuleDefinition[];
  children: ReactNode;
}) {
  const [company, setCompany] = useState<CompanySettings>(DEFAULT_COMPANY);
  const [lists, setLists] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [c, l] = await Promise.all([backend.loadCompany(), backend.loadLists()]);
      setCompany(c);
      setLists(l);
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

  const value = useMemo<SettingsContextValue>(
    () => ({
      backend,
      catalog,
      company,
      lists,
      loading,
      error,
      refresh,
      choices: (list) => lists.filter((l) => l.list === list && l.active).map((l) => l.label),
    }),
    [backend, catalog, company, lists, loading, error, refresh],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside <SettingsProvider>");
  return ctx;
}
