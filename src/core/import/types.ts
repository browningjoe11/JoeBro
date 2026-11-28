import type { ContactMethod, County } from "../contacts";
import type { Stage } from "../tickets";

/** Tag written on every row this import creates. The old CRM is the single-page Joebros CRM. */
export const CRM_IMPORT_SOURCE = "joebros-crm";

/** The JSON shape documented on the Import page. Version 1 is what this chunk reads. */
export const CRM_EXPORT_FORMAT = "joebros-crm-export";
export const CRM_EXPORT_VERSION = 1;

export interface ContactFields {
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

export interface PropertyFields {
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

export interface TicketFields {
  title: string;
  trade: string;
  scope: string;
  stage: Stage;
  lostReason: string;
  leadSource: string;
  estimatedValue: number | null;
}

export interface ParsedProperty extends PropertyFields {
  key: string;
  warnings: string[];
}

export interface ParsedContact extends ContactFields {
  key: string;
  /** Name shown in the preview. */
  name: string;
  warnings: string[];
  properties: ParsedProperty[];
}

export interface ParsedNote {
  key: string;
  text: string;
  createdAt: string | null;
}

export interface ParsedTicket extends TicketFields {
  key: string;
  contactKey: string;
  propertyKey: string | null;
  warnings: string[];
  notes: ParsedNote[];
}

export interface ParseIssue {
  entity: "file" | "contact" | "property" | "ticket" | "note";
  label: string;
  message: string;
}

/** A file reduced to the rows worth planning. Invalid rows are listed in `issues` and left out. */
export interface ParsedExport {
  fileError: string | null;
  contacts: ParsedContact[];
  tickets: ParsedTicket[];
  issues: ParseIssue[];
}

export interface SnapshotContact {
  id: string;
  firstName: string;
  lastName: string;
  company: string;
  name: string;
  phone: string;
  phoneAlt: string;
  email: string;
  importKey: string | null;
}

export interface SnapshotProperty {
  id: string;
  contactId: string;
  street: string;
  city: string;
  zip: string;
  unit: string;
  isPrimary: boolean;
  importKey: string | null;
}

export interface SnapshotLink {
  entity: "contact" | "property" | "ticket" | "note";
  importKey: string;
  recordId: string;
}

/** What is already stored, so the plan can match and skip. */
export interface ImportSnapshot {
  contacts: SnapshotContact[];
  properties: SnapshotProperty[];
  ticketKeys: string[];
  noteKeys: string[];
  links: SnapshotLink[];
}

export const EMPTY_SNAPSHOT: ImportSnapshot = { contacts: [], properties: [], ticketKeys: [], noteKeys: [], links: [] };

export type ImportAction =
  | { op: "contact"; mode: "create"; key: string; fields: ContactFields }
  | { op: "contact"; mode: "match"; key: string; recordId: string }
  | { op: "property"; mode: "create"; key: string; contactKey: string; fields: PropertyFields }
  | { op: "property"; mode: "match"; key: string; recordId: string }
  | { op: "ticket"; mode: "create"; key: string; contactKey: string; propertyKey: string | null; fields: TicketFields }
  | { op: "note"; mode: "create"; key: string; ticketKey: string; text: string; createdAt: string | null };

export interface ImportContactRow {
  key: string;
  name: string;
  phone: string;
  email: string;
  status: "create" | "match" | "skip";
  detail: string;
}

export interface ImportTicketRow {
  key: string;
  title: string;
  stage: Stage;
  customer: string;
  status: "create" | "skip";
  detail: string;
}

export interface ImportIssue {
  severity: "skip" | "warning";
  entity: string;
  label: string;
  message: string;
}

export interface ImportCounts {
  create: number;
  match: number;
  skip: number;
  invalid: number;
}

export interface ImportReport {
  dryRun: boolean;
  fileError: string | null;
  contacts: ImportCounts;
  properties: ImportCounts;
  tickets: ImportCounts;
  notes: ImportCounts;
  /** Jobs that will be created, counted by the stage they land in. */
  stages: Record<Stage, number>;
  contactRows: ImportContactRow[];
  ticketRows: ImportTicketRow[];
  issues: ImportIssue[];
  /** Customer-record notes (not ticket timeline notes) that will be saved on new customers. */
  contactNotes: number;
}

export interface ApplyFailure {
  op: ImportAction["op"];
  key: string;
  message: string;
}

/** Reads what is already stored and writes a plan. Preview mode and tests use memoryImport. */
export interface ImportBackend {
  snapshot(): Promise<ImportSnapshot>;
  apply(actions: ImportAction[], actorId: string | null): Promise<ApplyFailure[]>;
}
