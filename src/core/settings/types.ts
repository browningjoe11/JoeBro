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
  /**
   * Public web address of the same logo, for emails (Gmail and Outlook block
   * images stored inside an email). Set by publishLogo when an admin saves.
   */
  emailLogoUrl: string | null;
  /** Printed at the bottom of every customer estimate. One paragraph per line. */
  estimateTerms: string;
  /** Days an estimate's price holds after its version is saved. */
  estimateValidDays: number;
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
  /** Copies a logo (data: URL) to a public web address emails can show, and returns that address. */
  publishLogo(dataUrl: string): Promise<string>;
}

/** Same wording as the database default (migration 20261128210000). */
export const DEFAULT_ESTIMATE_TERMS = [
  "The price above covers the labor, materials and cleanup for the work described. Anything not listed is not included.",
  "Changes to the work are priced and agreed in writing before they are done.",
  "Hidden conditions found once work begins (such as rot or damage behind walls) are shown to you and priced before any extra work.",
  "Payment terms are set out when you accept this estimate.",
].join("\n");

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
  emailLogoUrl: null,
  estimateTerms: DEFAULT_ESTIMATE_TERMS,
  estimateValidDays: 30,
  disabledModules: [],
};

/** Modules that can never be switched off. */
export const CORE_MODULES = new Set(["dashboard", "settings"]);
