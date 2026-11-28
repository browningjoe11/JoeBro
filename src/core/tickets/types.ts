import type { Role } from "../modules";
import type { Stage, Transition } from "./stages";

export interface TicketSummary {
  id: string;
  /** Human-friendly ticket number, e.g. 1001. Used in the URL. */
  number: number;
  title: string;
  stage: Stage;
  stageChangedAt: string;
  customer: string;
  /** "118 Fox Hall Dr, Dover" */
  site: string;
  trade: string;
  estimatedValue: number | null;
  nextActionAt: string | null;
  assignedTo: string | null;
  isExample: boolean;
}

export interface Ticket extends TicketSummary {
  contactId: string;
  propertyId: string | null;
  phone: string;
  email: string;
  scope: string;
  leadSource: string;
  lostReason: string;
  createdAt: string;
}

/** contact_changed comes from the customer's change log (contact_changes), not ticket_events, and shows on all their tickets. */
export type EventKind = "created" | "stage_changed" | "updated" | "note" | "contact_changed";

export interface TicketEvent {
  id: string;
  kind: EventKind;
  fromStage: Stage | null;
  toStage: Stage | null;
  /** created: {title}; stage_changed: {lost_reason?}; updated: {field: {from, to}}; note: {text}; contact_changed: {changes: {field: {from, to}}, site} */
  data: Record<string, unknown>;
  actorId: string | null;
  createdAt: string;
}

export interface Person {
  id: string;
  name: string;
  role: Role;
  active: boolean;
}

export interface PropertyOption {
  id: string;
  /** "Home · 118 Fox Hall Dr, Dover" */
  label: string;
  isPrimary: boolean;
}

export interface ContactOption {
  id: string;
  name: string;
  phone: string;
  email: string;
  properties: PropertyOption[];
}

export interface NewContact {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
}

export interface NewProperty {
  street: string;
  city: string;
  zip: string;
}

export interface NewTicket {
  /** An existing customer, or details for a new one. */
  contactId?: string;
  newContact?: NewContact;
  /** An existing job site, or a new address for this customer. */
  propertyId?: string;
  newProperty?: NewProperty;
  title: string;
  trade: string;
  scope: string;
  leadSource: string;
  estimatedValue: number | null;
  stage: Stage;
}

export interface TicketPatch {
  title?: string;
  trade?: string;
  scope?: string;
  leadSource?: string;
  estimatedValue?: number | null;
  nextActionAt?: string | null;
  assignedTo?: string | null;
}

/** Everything the ticket screens need. The live app uses Supabase; preview mode and tests keep tickets in memory. */
export interface TicketsBackend {
  list(): Promise<TicketSummary[]>;
  get(number: number): Promise<Ticket | null>;
  events(ticketId: string): Promise<TicketEvent[]>;
  transitions(): Promise<Transition[]>;
  people(): Promise<Person[]>;
  searchContacts(query: string): Promise<ContactOption[]>;
  /** Resolves to the new ticket's number. */
  create(ticket: NewTicket, actorId: string | null): Promise<number>;
  update(ticketId: string, patch: TicketPatch): Promise<void>;
  move(ticketId: string, to: Stage, lostReason?: string): Promise<void>;
  addNote(ticketId: string, text: string, actorId: string | null): Promise<void>;
}
