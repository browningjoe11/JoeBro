import { createContext, useContext, type ReactNode } from "react";
import type { ContactsBackend } from "./types";

const ContactsContext = createContext<ContactsBackend | null>(null);

export function ContactsProvider({ backend, children }: { backend: ContactsBackend; children: ReactNode }) {
  return <ContactsContext.Provider value={backend}>{children}</ContactsContext.Provider>;
}

export function useContacts(): ContactsBackend {
  const ctx = useContext(ContactsContext);
  if (!ctx) throw new Error("useContacts must be used inside <ContactsProvider>");
  return ctx;
}
