import { guessCounty, normalizeEmail, normalizePhone, type ContactMethod, type County } from "../contacts";
import { ALL_STAGES, type Stage } from "../tickets";
import type { ParsedContact, ParsedExport, ParsedNote, ParsedProperty, ParsedTicket, ParseIssue } from "./types";

const MAX_CHARS = 5_000_000;
const MAX_RECORDS = 5_000;

const STAGE_ALIASES: Record<string, Stage> = {
  lead: "lead",
  new: "lead",
  "new lead": "lead",
  inquiry: "lead",
  "site visit": "site_visit",
  visit: "site_visit",
  estimating: "estimating",
  estimate: "estimating",
  quoting: "estimating",
  quote: "estimating",
  "estimate sent": "estimate_sent",
  "proposal sent": "estimate_sent",
  proposed: "estimate_sent",
  signed: "signed",
  approved: "signed",
  won: "signed",
  scheduling: "scheduling",
  "to schedule": "scheduling",
  scheduled: "scheduled",
  onsite: "onsite",
  "on site": "onsite",
  "in progress": "onsite",
  working: "onsite",
  review: "review",
  complete: "review",
  completed: "review",
  invoicing: "invoicing",
  invoice: "invoicing",
  billed: "invoicing",
  paid: "paid",
  closed: "paid",
  lost: "lost",
  cancelled: "lost",
  canceled: "lost",
  dead: "lost",
};

const STREET_SUFFIX: Record<string, string> = {
  street: "st",
  st: "st",
  avenue: "ave",
  ave: "ave",
  road: "rd",
  rd: "rd",
  drive: "dr",
  dr: "dr",
  lane: "ln",
  ln: "ln",
  court: "ct",
  ct: "ct",
  boulevard: "blvd",
  blvd: "blvd",
  place: "pl",
  pl: "pl",
  circle: "cir",
  cir: "cir",
};

type Rec = Record<string, unknown>;

const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);

function text(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

/** First listed key that the row has. Case, spaces, hyphens and underscores don't matter. */
function pick(row: Rec, ...keys: string[]): unknown {
  const norm = (k: string) => k.toLowerCase().replace(/[\s_-]+/g, "");
  const entries = Object.entries(row).map(([k, v]) => [norm(k), v] as const);
  for (const key of keys) {
    const want = norm(key);
    const found = entries.find(([k, v]) => k === want && v !== undefined && v !== null && v !== "");
    if (found) return found[1];
  }
  return undefined;
}

function pickText(row: Rec, ...keys: string[]): string {
  return text(pick(row, ...keys));
}

function arrayOf(row: Rec, ...keys: string[]): unknown[] {
  for (const key of keys) {
    const v = pick(row, key);
    if (Array.isArray(v)) return v;
  }
  return [];
}

function displayName(first: string, last: string, company: string): string {
  return `${first} ${last}`.trim() || company.trim();
}

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

const usableEmail = (email: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);

function cleanEmail(raw: string): { email: string; warning?: string } {
  const email = normalizeEmail(raw);
  if (!email) return { email: "" };
  if (!usableEmail(email)) return { email: "", warning: `Email "${raw.trim()}" doesn't look right, so it was left off and won't be used to match.` };
  return { email };
}

function phoneWarning(label: string, raw: string): string | undefined {
  if (!raw.trim()) return undefined;
  const digits = normalizePhone(raw);
  if (digits.length === 10) return undefined;
  const match = digits.length >= 7 ? " It can still match duplicates." : " It is too short to match duplicates.";
  return `${label} "${raw.trim()}" is not a 10-digit number.${match}`;
}

function mapPreferred(raw: string): { value: ContactMethod; warning?: string } {
  const n = raw.trim().toLowerCase();
  if (!n) return { value: "phone" };
  if (["phone", "call", "mobile", "cell"].includes(n)) return { value: "phone" };
  if (["text", "sms", "txt"].includes(n)) return { value: "text" };
  if (["email", "e-mail"].includes(n)) return { value: "email" };
  return { value: "phone", warning: `Preferred contact "${raw.trim()}" isn't phone, text, or email, so it was saved as phone.` };
}

const COUNTIES: Record<string, County> = {
  kent: "Kent",
  sussex: "Sussex",
  "new castle": "New Castle",
  newcastle: "New Castle",
  other: "Other",
};

function cleanCounty(raw: string, city: string, state: string): { county: County | ""; warning?: string } {
  const key = raw.trim().toLowerCase().replace(/\s+county$/, "").trim();
  if (key && COUNTIES[key]) return { county: COUNTIES[key] };
  if (key) return { county: "", warning: `County "${raw.trim()}" isn't Kent, Sussex, New Castle, or Other, so it was left blank.` };
  if ((state || "DE") === "DE") {
    const guessed = guessCounty(city);
    if (guessed) return { county: guessed };
  }
  return { county: "" };
}

/** "10 Example Lane, Dover, DE 19901" → street, city, state, zip. */
export function parseAddressLine(line: string): { street: string; city: string; state: string; zip: string } {
  const parts = line.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return { street: "", city: "", state: "", zip: "" };
  if (parts.length === 1) return { street: parts[0], city: "", state: "", zip: "" };
  const last = parts[parts.length - 1];
  const stateZip = last.match(/^([A-Za-z]{2})(?:\s+(\d{5}(?:-\d{4})?))?$/);
  const zipOnly = last.match(/^(\d{5}(?:-\d{4})?)$/);
  if (stateZip) {
    const state = stateZip[1].toUpperCase();
    const zip = stateZip[2] ?? "";
    if (parts.length >= 3) return { street: parts.slice(0, -2).join(", "), city: parts[parts.length - 2], state, zip };
    return { street: parts[0], city: "", state, zip };
  }
  if (zipOnly && parts.length >= 3) return { street: parts.slice(0, -2).join(", "), city: parts[parts.length - 2], state: "", zip: zipOnly[1] };
  return { street: parts.slice(0, -1).join(", "), city: parts[parts.length - 1], state: "", zip: "" };
}

/** Same street ignoring case, punctuation, and common suffixes (Drive vs Dr). */
export function addressKey(street: string, city: string, zip: string, unit: string): string {
  const words = street.toLowerCase().replace(/[.,#]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length > 1 && STREET_SUFFIX[words[words.length - 1]]) words[words.length - 1] = STREET_SUFFIX[words[words.length - 1]];
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return [words.join(""), norm(city), norm(zip), norm(unit)].join("|");
}

export function mapStage(raw: string): Stage | null {
  const n = raw.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (!n) return null;
  if (STAGE_ALIASES[n]) return STAGE_ALIASES[n];
  return (ALL_STAGES as readonly string[]).includes(n.replace(/ /g, "_")) ? (n.replace(/ /g, "_") as Stage) : null;
}

function parseMoney(raw: unknown): { value: number | null; error?: string } {
  if (raw === null || raw === undefined || raw === "") return { value: null };
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw < 0) return { value: null, error: "The amount has to be a number that isn't negative." };
    return { value: Math.round(raw * 100) / 100 };
  }
  const s = text(raw).replace(/[$,\s]/g, "");
  if (!s) return { value: null };
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return { value: null, error: `Couldn't read the amount "${text(raw)}".` };
  return { value: Number(s) };
}

function boolish(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  const s = text(v).toLowerCase();
  return s === "true" || s === "yes" || s === "1" || s === "y";
}

function isoOrNull(raw: string): string | null {
  if (!raw) return null;
  const t = Date.parse(raw);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString();
}

function contactKey(rawId: string, phone: string, email: string, name: string, company: string): string {
  if (rawId) return `id:${rawId}`;
  const digits = normalizePhone(phone);
  if (digits.length >= 7) return `phone:${digits}`;
  if (usableEmail(email)) return `email:${email}`;
  return `name:${name.toLowerCase()}|${company.toLowerCase()}`;
}

interface Buckets {
  contacts: Rec[];
  properties: Rec[];
  tickets: Rec[];
  notes: Rec[];
  versionWarning: string | null;
}

function kindOf(row: Rec): string {
  return pickText(row, "record_type", "recordType", "type", "kind").toLowerCase().replace(/[\s-]+/g, "_");
}

function looksLikeContact(row: Rec): boolean {
  return Boolean(pickText(row, "first_name", "firstName", "last_name", "lastName", "name", "full_name", "fullName", "company", "company_name", "phone", "email"));
}

function classify(row: Rec): "contact" | "property" | "ticket" | "note" | "skip" {
  const k = kindOf(row);
  if (["contact", "customer", "client", "person"].includes(k)) return "contact";
  if (["property", "address", "site", "location"].includes(k)) return "property";
  if (["ticket", "job", "project", "work_order"].includes(k)) return "ticket";
  if (["note", "comment"].includes(k)) return "note";
  if (arrayOf(row, "jobs", "tickets", "properties", "addresses").length || (looksLikeContact(row) && !pickText(row, "stage", "status", "title", "job"))) return "contact";
  if (pickText(row, "stage", "status") || pickText(row, "title", "job", "job_name", "summary")) return "ticket";
  if (pickText(row, "street", "address") && pickText(row, "contact_id", "contactId", "customer_id")) return "property";
  if (pickText(row, "text", "body", "note", "comment") && pickText(row, "ticket_id", "ticketId", "job_id")) return "note";
  return "skip";
}

function bucketsFrom(data: unknown): Buckets | string {
  if (Array.isArray(data)) {
    const out: Buckets = { contacts: [], properties: [], tickets: [], notes: [], versionWarning: null };
    for (const item of data) {
      if (!isRec(item)) return "The file is a list, and one of the entries isn't a record.";
      const slot = classify(item);
      if (slot === "skip") return "The file is a list of records, but one of them isn't a customer, property, job, or note.";
      out[slot === "contact" ? "contacts" : slot === "property" ? "properties" : slot === "ticket" ? "tickets" : "notes"].push(item);
    }
    return out;
  }
  if (!isRec(data)) return "The file has to be a JSON object or a CSV table.";
  const version = pick(data, "version");
  let versionWarning: string | null = null;
  if (typeof version === "number" && version > 1) {
    versionWarning = `This file says version ${version}. The importer knows version 1 and will map the fields it recognizes.`;
  }
  const contacts = arrayOf(data, "contacts", "customers", "clients", "people").filter(isRec);
  const properties = arrayOf(data, "properties", "addresses", "sites", "locations").filter(isRec);
  const tickets = arrayOf(data, "tickets", "jobs", "projects", "work_orders", "workOrders").filter(isRec);
  const notes = arrayOf(data, "notes", "comments").filter(isRec);
  if (contacts.length + properties.length + tickets.length + notes.length === 0 && looksLikeContact(data)) {
    return { contacts: [data], properties: [], tickets: [], notes: [], versionWarning };
  }
  return { contacts, properties, tickets, notes, versionWarning };
}

function readProperty(row: Rec, contactKeyValue: string, fallbackId: string): { property: ParsedProperty } | { issue: ParseIssue } {
  const warnings: string[] = [];
  const rawId = pickText(row, "id", "property_id", "propertyId", "site_id");
  let street = pickText(row, "street", "street_address", "address1", "line1", "address_line_1");
  let city = pickText(row, "city", "town");
  let state = pickText(row, "state");
  let zip = pickText(row, "zip", "postal", "postal_code", "zip_code");
  const line = pick(row, "address", "full_address", "fullAddress");
  if ((!street || !city) && typeof line === "string") {
    const parsed = parseAddressLine(line);
    street = street || parsed.street;
    city = city || parsed.city;
    state = state || parsed.state;
    zip = zip || parsed.zip;
  } else if (isRec(line)) {
    street = street || pickText(line, "street", "street_address", "line1");
    city = city || pickText(line, "city", "town");
    state = state || pickText(line, "state");
    zip = zip || pickText(line, "zip", "postal", "postal_code");
  }
  const label = pickText(row, "label", "property_label", "name") || "Property";
  if (!street || !city) {
    return { issue: { entity: "property", label, message: "A property needs a street and a city, so this one was skipped." } };
  }
  const stateWasMissing = !state;
  state = (state || "DE").toUpperCase();
  if (!/^[A-Z]{2}$/.test(state)) {
    return { issue: { entity: "property", label: street, message: `State "${state}" should be 2 letters, like DE, so this property was skipped.` } };
  }
  if (stateWasMissing) warnings.push("State was missing, so it was saved as DE.");
  if (zip && !/^\d{5}(-\d{4})?$/.test(zip)) {
    warnings.push(`ZIP "${zip}" isn't 5 digits, so it was left blank.`);
    zip = "";
  }
  const county = cleanCounty(pickText(row, "county"), city, state);
  if (county.warning) warnings.push(county.warning);
  const key = rawId ? `id:${rawId}` : `addr:${contactKeyValue}|${addressKey(street, city, zip, pickText(row, "unit", "address2")) || fallbackId}`;
  return {
    property: {
      key,
      label: pickText(row, "label", "property_label", "site_label"),
      street,
      unit: pickText(row, "unit", "address2", "apt"),
      city,
      state,
      zip,
      county: county.county,
      accessNotes: pickText(row, "access_notes", "accessNotes", "gate_code", "access"),
      isPrimary: boolish(pick(row, "is_primary", "isPrimary", "primary")),
      warnings,
    },
  };
}

function readNotes(value: unknown, ticketKey: string, issues: ParseIssue[]): ParsedNote[] {
  const items = Array.isArray(value) ? value : value == null || value === "" ? [] : [value];
  const notes: ParsedNote[] = [];
  const seen = new Set<string>();
  items.forEach((item, index) => {
    const row = isRec(item) ? item : { text: item };
    const body = pickText(row, "text", "body", "note", "comment", "content");
    const label = `Note ${index + 1} on ${ticketKey}`;
    if (!body) {
      issues.push({ entity: "note", label, message: "A note was empty, so it was skipped." });
      return;
    }
    const rawId = pickText(row, "id", "note_id", "noteId");
    const when = pickText(row, "created_at", "createdAt", "at", "date", "note_at");
    const createdAt = isoOrNull(when);
    if (when && !createdAt) issues.push({ entity: "note", label, message: `The date "${when}" isn't a real date, so the note will be dated when it is imported.` });
    const key = rawId ? `${ticketKey}|id:${rawId}` : `${ticketKey}|text:${body.toLowerCase().replace(/\s+/g, " ").slice(0, 500)}`;
    if (seen.has(key)) return;
    seen.add(key);
    notes.push({ key, text: body, createdAt });
  });
  return notes;
}

function readContact(row: Rec, issues: ParseIssue[]): ParsedContact | null {
  const warnings: string[] = [];
  let first = pickText(row, "first_name", "firstName", "first");
  let last = pickText(row, "last_name", "lastName", "last");
  const company = pickText(row, "company", "company_name", "companyName", "business");
  if (!first && !last) {
    const full = pickText(row, "name", "full_name", "fullName", "customer", "customer_name");
    const split = splitName(full);
    first = split.first;
    last = split.last;
  }
  const name = displayName(first, last, company);
  if (!name) {
    issues.push({ entity: "contact", label: "Customer", message: "A customer has no name and no company, so that row was skipped." });
    return null;
  }
  const phone = pickText(row, "phone", "phone_number", "phoneNumber", "mobile", "cell");
  const phoneAlt = pickText(row, "phone_alt", "phoneAlt", "alt_phone", "altPhone", "phone2", "secondary_phone");
  const email = cleanEmail(pickText(row, "email", "email_address", "emailAddress"));
  if (email.warning) warnings.push(email.warning);
  for (const w of [phoneWarning("Phone", phone), phoneWarning("Other phone", phoneAlt)]) if (w) warnings.push(w);
  const preferred = mapPreferred(pickText(row, "preferred_contact", "preferredContact", "preferred"));
  if (preferred.warning) warnings.push(preferred.warning);
  let preferredContact = preferred.value;
  if (preferredContact === "email" && !email.email) {
    warnings.push("They prefer email, but no email was usable, so preferred contact was saved as phone.");
    preferredContact = "phone";
  }
  const rawId = pickText(row, "id", "contact_id", "contactId", "customer_id", "customerId");
  const key = contactKey(rawId, phone || phoneAlt, email.email, name, company);
  const properties: ParsedProperty[] = [];
  const propRows = [
    ...arrayOf(row, "properties", "addresses", "sites", "locations").filter(isRec),
  ];
  const inline = pick(row, "address", "full_address");
  if ((typeof inline === "string" && inline.trim()) || isRec(inline)) propRows.push(isRec(inline) ? inline : { address: inline });
  propRows.forEach((p, i) => {
    const read = readProperty(p, key, String(i + 1));
    if ("issue" in read) issues.push(read.issue);
    else properties.push(read.property);
  });
  return {
    key,
    name,
    firstName: first,
    lastName: last,
    company,
    phone,
    phoneAlt,
    email: email.email,
    preferredContact,
    leadSource: pickText(row, "lead_source", "leadSource", "how_heard", "referral_source"),
    notes: pickText(row, "notes", "note", "customer_notes", "contact_notes"),
    warnings,
    properties,
  };
}

function readTicket(row: Rec, contactKeyValue: string, propertyKey: string | null, issues: ParseIssue[]): ParsedTicket | null {
  const warnings: string[] = [];
  const title = pickText(row, "title", "name", "job", "job_name", "job_title", "summary") || "Imported job";
  const named = pickText(row, "title", "name", "job", "job_name", "job_title", "summary");
  if (!named) warnings.push("The job had no title, so it was named \"Imported job\".");
  const stageRaw = pickText(row, "stage", "status");
  const stage = mapStage(stageRaw || "lead");
  if (!stage) {
    issues.push({ entity: "ticket", label: title, message: `Stage "${stageRaw}" isn't one this app uses, so the job was skipped.` });
    return null;
  }
  if (!stageRaw) warnings.push("The job had no stage, so it was saved as Lead.");
  const lostReason = pickText(row, "lost_reason", "lostReason", "reason");
  if (stage === "lost" && !lostReason) {
    issues.push({ entity: "ticket", label: title, message: "A lost job needs a reason, so this one was skipped." });
    return null;
  }
  const money = parseMoney(pick(row, "estimated_value", "estimatedValue", "value", "amount", "estimate", "estimate_amount"));
  if (money.error) {
    issues.push({ entity: "ticket", label: title, message: money.error });
    return null;
  }
  const rawId = pickText(row, "id", "ticket_id", "ticketId", "job_id", "jobId");
  const key = rawId ? `id:${rawId}` : `job:${contactKeyValue}|${title.toLowerCase()}|${stage}`;
  const explicitProperty = pickText(row, "property_id", "propertyId", "site_id");
  const notes = readNotes(pick(row, "notes", "comments", "note"), key, issues);
  return {
    key,
    contactKey: contactKeyValue,
    propertyKey: explicitProperty ? `id:${explicitProperty}` : propertyKey,
    title,
    trade: pickText(row, "trade"),
    scope: pickText(row, "scope", "description", "details"),
    stage,
    lostReason,
    leadSource: pickText(row, "lead_source", "leadSource", "ticket_lead_source"),
    estimatedValue: money.value,
    warnings,
    notes,
  };
}

function parseCsv(text: string): Rec[] | string {
  const sample = text.slice(0, 2000);
  const commas = (sample.match(/,/g) ?? []).length;
  const semis = (sample.match(/;/g) ?? []).length;
  const delim = semis > commas ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const kept = rows.filter((r) => r.some((c) => c.trim()));
  if (kept.length < 2) return "The CSV needs a header row and at least one data row.";
  const headers = kept[0].map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, "_"));
  return kept.slice(1).map((r) => {
    const rec: Rec = {};
    headers.forEach((h, i) => {
      if (h) rec[h] = (r[i] ?? "").trim();
    });
    return rec;
  });
}

/** A CSV row can be a customer, a job, or both on one line. Split those into the JSON shape. */
function csvRecordsToDocument(rows: Rec[]): Rec {
  const contacts: Rec[] = [];
  const properties: Rec[] = [];
  const tickets: Rec[] = [];
  const notes: Rec[] = [];
  const derivedId = (row: Rec) => {
    const phone = normalizePhone(pickText(row, "phone", "mobile", "cell", "phone_number"));
    if (phone.length >= 7) return `phone-${phone}`;
    const email = normalizeEmail(pickText(row, "email", "email_address"));
    if (usableEmail(email)) return `email-${email}`;
    const name = pickText(row, "name", "full_name", "first_name", "company", "company_name") || "customer";
    return `name-${name.toLowerCase()}`;
  };
  for (const row of rows) {
    const k = kindOf(row);
    if (["property", "address", "site", "location"].includes(k)) {
      properties.push(row);
      continue;
    }
    if (["note", "comment"].includes(k)) {
      notes.push(row);
      continue;
    }
    const jobish =
      ["ticket", "job", "project", "work_order"].includes(k) ||
      (!k && Boolean(pickText(row, "title", "job", "job_name", "job_title", "summary", "stage", "status")));
    const explicitContact = pickText(row, "contact_id", "customer_id");
    const bareId = pickText(row, "id");
    const contactId = explicitContact || (jobish ? "" : bareId) || derivedId(row);
    if ((["contact", "customer", "client", "person"].includes(k) || !k || jobish) && looksLikeContact(row)) {
      const contactRow: Rec = { ...row, id: contactId };
      if (jobish) {
        delete contactRow.notes;
        delete contactRow.note;
        delete contactRow.comments;
      }
      contacts.push(contactRow);
    }
    if (jobish) {
      const ticketId = pickText(row, "ticket_id", "job_id") || bareId;
      tickets.push({ ...row, id: ticketId, contact_id: contactId });
    }
  }
  return { contacts, properties, tickets, notes };
}

function emptyParsed(fileError: string): ParsedExport {
  return { fileError, contacts: [], tickets: [], issues: [] };
}

/**
 * Reads a Joebros CRM export. JSON is the preferred file; CSV is accepted too.
 * Field names are matched loosely (customers or contacts, jobs or tickets, a
 * single name, a one-line address). Rows that can't be mapped are reported
 * and left out. Nothing here writes to the database.
 */
export function parseCrmExport(text: string, filename = ""): ParsedExport {
  const raw = text.replace(/^\uFEFF/, "");
  if (!raw.trim()) return emptyParsed("That file is empty.");
  if (raw.length > MAX_CHARS) return emptyParsed("That file is larger than 5 MB. Split it and import the pieces.");
  const looksJson = /^\s*[[{]/.test(raw) || filename.toLowerCase().endsWith(".json");
  let data: unknown;
  if (looksJson && !filename.toLowerCase().endsWith(".csv")) {
    try {
      data = JSON.parse(raw);
    } catch {
      return emptyParsed("That file isn't valid JSON.");
    }
  } else {
    const table = parseCsv(raw);
    if (typeof table === "string") return emptyParsed(table);
    data = csvRecordsToDocument(table);
  }
  const buckets = bucketsFrom(data);
  if (typeof buckets === "string") return emptyParsed(buckets);
  const recordCount = buckets.contacts.length + buckets.properties.length + buckets.tickets.length + buckets.notes.length;
  if (recordCount > MAX_RECORDS) return emptyParsed(`That file has ${recordCount} records. The limit is ${MAX_RECORDS}.`);
  if (recordCount === 0) {
    return emptyParsed("The file has no customers, properties, jobs, or notes.");
  }

  const issues: ParseIssue[] = [];
  if (buckets.versionWarning) issues.push({ entity: "file", label: "File", message: buckets.versionWarning });

  const contacts: ParsedContact[] = [];
  const byKey = new Map<string, ParsedContact>();
  const propertyKeys = new Set<string>();
  const addProperty = (contact: ParsedContact, property: ParsedProperty) => {
    if (propertyKeys.has(property.key) || contact.properties.some((p) => p.key === property.key)) {
      issues.push({ entity: "property", label: property.street, message: "Another property in the file already uses this id, so this copy was skipped." });
      return;
    }
    propertyKeys.add(property.key);
    contact.properties.push(property);
  };
  const remember = (c: ParsedContact): ParsedContact => {
    const prev = byKey.get(c.key);
    const incoming = c.properties.splice(0);
    if (!prev) {
      byKey.set(c.key, c);
      contacts.push(c);
      for (const p of incoming) addProperty(c, p);
      return c;
    }
    prev.warnings.push(`Another row in the file matches ${prev.name} (same id, phone, or email). The first details were kept; extra properties were added.`);
    for (const p of incoming) addProperty(prev, p);
    if (!prev.notes && c.notes) prev.notes = c.notes;
    return prev;
  };

  const hosts: { row: Rec; contact: ParsedContact }[] = [];
  for (const row of buckets.contacts) {
    const parsed = readContact(row, issues);
    if (parsed) hosts.push({ row, contact: remember(parsed) });
  }

  for (const row of buckets.properties) {
    const ref = pickText(row, "contact_id", "contactId", "customer_id", "customerId");
    const parent = byKey.get(`id:${ref}`) ?? byKey.get(ref);
    if (!parent) {
      issues.push({ entity: "property", label: pickText(row, "street", "address") || "Property", message: "This property doesn't name a customer in the file, so it was skipped." });
      continue;
    }
    const read = readProperty(row, parent.key, String(parent.properties.length + 1));
    if ("issue" in read) issues.push(read.issue);
    else addProperty(parent, read.property);
  }

  const tickets: ParsedTicket[] = [];
  const ticketKeys = new Set<string>();
  const takeTicket = (row: Rec, contact: ParsedContact, fallbackProperty: string | null) => {
    const ticket = readTicket(row, contact.key, fallbackProperty, issues);
    if (!ticket) return;
    if (ticket.propertyKey && !contact.properties.some((p) => p.key === ticket.propertyKey)) {
      ticket.warnings.push("The job names a property that isn't in the file, so it was imported without a job site.");
      ticket.propertyKey = null;
    }
    if (!ticket.propertyKey && contact.properties.length === 1) ticket.propertyKey = contact.properties[0].key;
    if (ticketKeys.has(ticket.key)) {
      issues.push({ entity: "ticket", label: ticket.title, message: "Another job in the file already uses this id, so this copy was skipped." });
      return;
    }
    ticketKeys.add(ticket.key);
    tickets.push(ticket);
  };

  for (const { row, contact } of hosts) {
    for (const job of arrayOf(row, "jobs", "tickets", "work_orders", "workOrders")) {
      if (isRec(job)) takeTicket(job, contact, null);
    }
  }

  for (const row of buckets.tickets) {
    const ref = pickText(row, "contact_id", "contactId", "customer_id", "customerId");
    const contact = byKey.get(`id:${ref}`) ?? byKey.get(ref);
    if (!contact) {
      issues.push({
        entity: "ticket",
        label: pickText(row, "title", "name", "job") || "Job",
        message: "This job doesn't point at a customer in the file, so it was skipped.",
      });
      continue;
    }
    takeTicket(row, contact, null);
  }

  for (const row of buckets.notes) {
    const ref = pickText(row, "ticket_id", "ticketId", "job_id", "jobId");
    const ticket = tickets.find((t) => t.key === `id:${ref}` || t.key === ref);
    if (!ticket) {
      issues.push({ entity: "note", label: "Note", message: "A note doesn't point at a job in the file, so it was skipped." });
      continue;
    }
    for (const note of readNotes(row, ticket.key, issues)) {
      if (!ticket.notes.some((n) => n.key === note.key)) ticket.notes.push(note);
    }
  }

  for (const c of contacts) for (const w of c.warnings) issues.push({ entity: "contact", label: c.name, message: w });
  for (const c of contacts) for (const p of c.properties) for (const w of p.warnings) issues.push({ entity: "property", label: p.street, message: w });
  for (const t of tickets) for (const w of t.warnings) issues.push({ entity: "ticket", label: t.title, message: w });

  return { fileError: null, contacts, tickets, issues };
}
