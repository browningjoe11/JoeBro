import { createContext, useContext, type ReactNode } from "react";
import type { SignatureBackend } from "./types";

const SignaturesContext = createContext<SignatureBackend | null>(null);

/** Gives screens the signature store: the signature builder now, estimate and invoice emails later. */
export function SignaturesProvider({ backend, children }: { backend: SignatureBackend; children: ReactNode }) {
  return <SignaturesContext.Provider value={backend}>{children}</SignaturesContext.Provider>;
}

export function useSignatures(): SignatureBackend {
  const ctx = useContext(SignaturesContext);
  if (!ctx) throw new Error("useSignatures must be used inside <SignaturesProvider>");
  return ctx;
}
