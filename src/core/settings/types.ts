import type { Role } from "../modules";

export interface CompanySettings {
  name: string;
  licenseNumber: string;
  phone: string;
  email: string;
  website: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  /** Small inline image (data: URL), or null for the built-in mark. */
  logoDataUrl: string | null;
  /** Module ids an admin switched off. */
  disabledModules: string[];
}

export type ListName = "lead_source" | "trade";

export const LIST_LABELS: Record<ListName, { title: string; singular: string; info: string }> = {
  lead_source: { title: "Lead sources", singular: "lead source", info: "Where a customer heard about you. Used on new tickets and in reports." },
  trade: { title: "Trades", singular: "trade", info: "The kind of work on a ticket. Used to group jobs and estimates." },
};

export interface ListItem {
  id: string;
  list: ListName;
  label: string;
  sort: number;
  active: boolean;
}

export interface TeamMember {
  id: string;
  email: string | null;
  fullName: string;
  role: Role;
  active: boolean;
  /** Invited but hasn't clicked the email link yet. */
  pending: boolean;
  lastSignInAt: string | null;
}

export interface Invite {
  email: string;
  fullName: string;
  role: Role;
}

/** Everything Settings reads and writes. The real one talks to Supabase; tests and preview mode use memory. */
export interface SettingsBackend {
  loadCompany(): Promise<CompanySettings>;
  saveCompany(next: CompanySettings): Promise<void>;
  loadLists(): Promise<ListItem[]>;
  addListItem(list: ListName, label: string, sort: number): Promise<void>;
  updateListItem(id: string, patch: Partial<Pick<ListItem, "label" | "sort" | "active">>): Promise<void>;
  deleteListItem(id: string): Promise<void>;
  loadTeam(): Promise<TeamMember[]>;
  updateMember(id: string, patch: Partial<Pick<TeamMember, "fullName" | "role" | "active">>): Promise<void>;
  invite(invite: Invite): Promise<void>;
}

export const DEFAULT_COMPANY: CompanySettings = {
  name: "Joebros Contracting Services",
  licenseNumber: "",
  phone: "",
  email: "",
  website: "",
  street: "",
  city: "",
  state: "DE",
  zip: "",
  logoDataUrl: null,
  disabledModules: [],
};

/** Modules that can never be switched off. */
export const CORE_MODULES = new Set(["dashboard", "settings"]);
