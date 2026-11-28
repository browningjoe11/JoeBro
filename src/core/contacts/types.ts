import type { Role } from "../modules";
import type { Stage, TicketEvent } from "../tickets";

export type ContactMethod = "phone" | "text" | "email";
export type County = "Kent" | "Sussex" | "New Castle" | "Other";

/** Roles that may add or edit customers and their properties. Mirrors the contacts RLS policies. */
export const CONTACT_EDITOR_ROLES: readonly Role[] = ["admin", "sales", "operations"];

export interface PropertyRecord {
  id: string;
  contactId: string;
  /** "Home", "Rental on Bay Rd" */
  label: string;
  street: string;
  unit: string;
  city: string;
  state: string;
  zip: string;
  county: County | "";
  accessNotes: string;
  isPrimary: boolean;
}

/** One row of the customer list: enough to search on and to spot duplicates. */
export interface ContactSummary {
  id: string;
  firstName: string;
  lastName: string;
  company: string;
  /** "Dana Whitfield", or the company when there is no name. */
  name: string;
  phone: string;
  phoneAlt: string;
  email: string;
  isExample: boolean;
  createdAt: string;
  /** Every job site, primary first. */
  places: { label: string; street: string; city: string; isPrimary: boolean }[];
  ticketCount: number;
  openTicketCount: number;
  /** Latest change on any of their tickets, or when the customer was added. */
  lastActivityAt: string;
}

export interface ContactTicket {
  id: string;
  number: number;
  title: string;
  stage: Stage;
  trade: string;
  estimatedValue: number | null;
  propertyId: string | null;
  /** "118 Fox Hall Dr, Dover" */
  site: string;
  createdAt: string;
  stageChangedAt: string;
  isExample: boolean;
}

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  company: string;
  name: string;
  phone: string;
  phoneAlt: string;
  email: string;
  preferredContact: ContactMethod;
  leadSource: string;
  notes: string;
  isExample: boolean;
  createdAt: string;
  updatedAt: string;
  properties: PropertyRecord[];
  /** Newest first. */
  tickets: ContactTicket[];
}

/** A timeline entry from one of the customer's tickets. */
export interface ContactEvent extends TicketEvent {
  ticketNumber: number;
  ticketTitle: string;
}

export interface ContactInput {
  firstName: string;
  lastName: string;
  company: string;
  phone: string;
  phoneAlt: string;
  email: string;
  preferredContact: ContactMethod;
  leadSource: string;
  notes: string;
}

export interface PropertyInput {
  label: string;
  street: string;
  unit: string;
  city: string;
  state: string;
  zip: string;
  county: County | "";
  accessNotes: string;
  isPrimary: boolean;
}

export interface DuplicateMatch {
  id: string;
  name: string;
  phone: string;
  email: string;
  /** What they share with the record being checked. */
  reasons: ("phone" | "email")[];
}

/** One save to a customer's details or one of their job sites, from the change log. */
export interface ContactChange {
  id: string;
  contactId: string;
  /** Set when a job site changed. */
  propertyId: string | null;
  actorId: string | null;
  /** Database column names: phone, phone_alt, email, street, zip, ... A new site is {site_added: {from: null, to: "1 Main St, Dover"}}. */
  changes: Record<string, { from: unknown; to: unknown }>;
  createdAt: string;
}

/** Everything the Contacts screens need. The live app uses Supabase; preview mode and tests keep customers in memory. */
export interface ContactsBackend {
  list(): Promise<ContactSummary[]>;
  get(id: string): Promise<Contact | null>;
  /** Timeline of every ticket the customer has had, newest first. */
  history(contactId: string): Promise<ContactEvent[]>;
  /** Change log for the customer's details and job sites, newest first. */
  changes(contactId: string): Promise<ContactChange[]>;
  /** Other customers with the same phone (any format) or email. */
  findDuplicates(probe: { phone?: string; phoneAlt?: string; email?: string }, excludeId?: string): Promise<DuplicateMatch[]>;
  /** Resolves to the new customer's id. */
  create(input: ContactInput, actorId: string | null): Promise<string>;
  update(id: string, input: ContactInput): Promise<void>;
  /** Resolves to the new property's id. */
  addProperty(contactId: string, input: PropertyInput): Promise<string>;
  updateProperty(id: string, input: PropertyInput): Promise<void>;
}
