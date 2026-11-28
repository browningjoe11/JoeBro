import { createContext, useContext, type ReactNode } from "react";
import type { ImportBackend } from "./types";

const ImportContext = createContext<ImportBackend | null>(null);

export function ImportProvider({ backend, children }: { backend: ImportBackend; children: ReactNode }) {
  return <ImportContext.Provider value={backend}>{children}</ImportContext.Provider>;
}

export function useImport(): ImportBackend {
  const ctx = useContext(ImportContext);
  if (!ctx) throw new Error("useImport must be used inside <ImportProvider>");
  return ctx;
}
