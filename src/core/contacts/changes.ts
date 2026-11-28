import type { TicketEvent } from "../tickets";
import type { ContactChange, ContactInput, PropertyInput } from "./types";

/** Plain words for each logged column, as the timeline shows them. */
export const CHANGE_LABELS: Record<string, string> = {
  first_name: "first name",
  last_name: "last name",
  company: "company",
  phone: "phone",
  phone_alt: "other phone",
  email: "email",
  preferred_contact: "best way to reach them",
  label: "site name",
  street: "street",
  unit: "unit",
  city: "city",
  state: "state",
  zip: "ZIP",
  county: "county",
  access_notes: "access notes",
};

const CONTACT_COLUMNS: [keyof ContactInput, string][] = [
  ["firstName", "first_name"],
  ["lastName", "last_name"],
  ["company", "company"],
  ["phone", "phone"],
  ["phoneAlt", "phone_alt"],
  ["email", "email"],
  ["preferredContact", "preferred_contact"],
];

const PROPERTY_COLUMNS: [keyof PropertyInput, string][] = [
  ["label", "label"],
  ["street", "street"],
  ["unit", "unit"],
  ["city", "city"],
  ["state", "state"],
  ["zip", "zip"],
  ["county", "county"],
  ["accessNotes", "access_notes"],
];

function diff<T>(before: T, after: T, columns: [keyof T, string][]): ContactChange["changes"] {
  const out: ContactChange["changes"] = {};
  const blank = (v: unknown) => (v === "" || v === undefined ? null : v);
  for (const [key, col] of columns) {
    const from = blank(before[key]);
    const to = blank(after[key]);
    if (from !== to) out[col] = { from, to };
  }
  return out;
}

/** What the database trigger would log for a customer save. Used by the in-memory backend. */
export const contactDiff = (before: ContactInput, after: ContactInput) => diff(before, after, CONTACT_COLUMNS);
/** What the database trigger would log for a job site save. */
export const propertyDiff = (before: PropertyInput, after: PropertyInput) => diff(before, after, PROPERTY_COLUMNS);

/** Shows a change-log entry on a ticket's or customer's timeline. */
export function changeToEvent(c: ContactChange): TicketEvent {
  return {
    id: `cc-${c.id}`,
    kind: "contact_changed",
    fromStage: null,
    toStage: null,
    data: { changes: c.changes, site: c.propertyId !== null },
    actorId: c.actorId,
    createdAt: c.createdAt,
  };
}

/** Newest first, ticket events and contact changes together. */
export function mergeTimeline<E extends TicketEvent>(events: E[], changes: ContactChange[]): (E | TicketEvent)[] {
  return [...events, ...changes.map(changeToEvent)].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
