import type { ContactInput, ContactSummary, DuplicateMatch, PropertyInput } from "./types";

/** Digits only, without a leading US "1". Same rule as public.normalize_phone in the database. */
export function normalizePhone(raw: string | null | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

export const normalizeEmail = (raw: string | null | undefined) => (raw ?? "").trim().toLowerCase();

/** A phone is worth matching on once it has at least 7 digits (a local number). */
const usablePhone = (digits: string) => digits.length >= 7;
const usableEmail = (email: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);

export function displayName(c: { firstName: string; lastName: string; company: string }): string {
  return `${c.firstName} ${c.lastName}`.trim() || c.company.trim();
}

/** Who in `list` shares a phone or email with the probe. Used by the memory backend and the customer list. */
export function findMatches(
  list: Pick<ContactSummary, "id" | "name" | "phone" | "phoneAlt" | "email">[],
  probe: { phone?: string; phoneAlt?: string; email?: string },
  excludeId?: string,
): DuplicateMatch[] {
  const phones = [normalizePhone(probe.phone), normalizePhone(probe.phoneAlt)].filter(usablePhone);
  const email = normalizeEmail(probe.email);
  const out: DuplicateMatch[] = [];
  for (const c of list) {
    if (c.id === excludeId) continue;
    const reasons: DuplicateMatch["reasons"] = [];
    const theirs = [normalizePhone(c.phone), normalizePhone(c.phoneAlt)].filter(usablePhone);
    if (phones.some((p) => theirs.includes(p))) reasons.push("phone");
    if (usableEmail(email) && normalizeEmail(c.email) === email) reasons.push("email");
    if (reasons.length) out.push({ id: c.id, name: c.name, phone: c.phone, email: c.email, reasons });
  }
  return out;
}

/** For each customer, the others that look like the same person. Customers with no lookalike are left out. */
export function duplicateMap(list: ContactSummary[]): Map<string, DuplicateMatch[]> {
  const map = new Map<string, DuplicateMatch[]>();
  // Bucket by phone and email first so a big list stays fast.
  const buckets = new Map<string, ContactSummary[]>();
  const add = (key: string, c: ContactSummary) => buckets.set(key, [...(buckets.get(key) ?? []), c]);
  for (const c of list) {
    for (const p of new Set([normalizePhone(c.phone), normalizePhone(c.phoneAlt)])) if (usablePhone(p)) add(`p:${p}`, c);
    const e = normalizeEmail(c.email);
    if (usableEmail(e)) add(`e:${e}`, c);
  }
  for (const group of buckets.values()) {
    if (group.length < 2) continue;
    for (const c of group) {
      if (!map.has(c.id)) map.set(c.id, findMatches(list, c, c.id));
    }
  }
  return map;
}

/**
 * How well a customer matches what was typed; 0 means not at all. Every word
 * typed must match something. Name starts score highest, so two letters of a
 * first or last name put that customer at the top.
 */
export function matchScore(c: ContactSummary, query: string): number {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 1;
  const full = c.name.toLowerCase();
  const nameWords = [c.firstName, c.lastName].join(" ").toLowerCase().split(/\s+/).filter(Boolean);
  const companyWords = c.company.toLowerCase().split(/\s+/).filter(Boolean);
  const email = c.email.toLowerCase();
  const phones = [normalizePhone(c.phone), normalizePhone(c.phoneAlt)].filter(Boolean);
  const places = c.places.map((p) => `${p.label} ${p.street} ${p.city}`.toLowerCase());
  const placeWords = places.join(" ").split(/\s+/).filter(Boolean);

  let total = 0;
  for (const t of tokens) {
    let best = 0;
    const digits = t.replace(/\D/g, "");
    const numeric = digits.length > 0 && !/[a-z]/.test(t);
    if (full.startsWith(t)) best = 6;
    else if (nameWords.some((w) => w.startsWith(t))) best = 5;
    else if (companyWords.some((w) => w.startsWith(t))) best = 4;
    else if (email.startsWith(t)) best = 4;
    if (numeric && digits.length >= 2) {
      if (phones.some((p) => p.endsWith(digits) || p.startsWith(digits))) best = Math.max(best, 4);
      else if (digits.length >= 3 && phones.some((p) => p.includes(digits))) best = Math.max(best, 3);
    }
    if (!best && full.includes(t)) best = 2;
    if (!best && email.includes(t)) best = 2;
    if (!best && placeWords.some((w) => w.startsWith(t))) best = 2;
    if (!best && t.length >= 3 && places.some((p) => p.includes(t))) best = 1;
    if (!best) return 0;
    total += best;
  }
  return total;
}

/** Customers matching the query, best match first, then most recently active. */
export function searchContacts(list: ContactSummary[], query: string): ContactSummary[] {
  const q = query.trim();
  const scored = list.map((c) => ({ c, score: q ? matchScore(c, q) : 1 })).filter((x) => x.score > 0);
  scored.sort(
    (a, b) => b.score - a.score || b.c.lastActivityAt.localeCompare(a.c.lastActivityAt) || a.c.name.localeCompare(b.c.name),
  );
  return scored.map((x) => x.c);
}

/** Problems with a customer form, keyed by field. Empty when it can be saved. */
export function validateContact(c: ContactInput): Record<string, string> {
  const errs: Record<string, string> = {};
  if (!`${c.firstName}${c.lastName}${c.company}`.trim()) errs.firstName = "Enter a name or a company.";
  if (c.email.trim() && !usableEmail(normalizeEmail(c.email))) errs.email = "That email doesn't look right.";
  for (const key of ["phone", "phoneAlt"] as const) {
    const d = normalizePhone(c[key]);
    if (c[key].trim() && d.length !== 10) errs[key] = "Enter a 10-digit phone number.";
  }
  if (c.preferredContact === "email" && !c.email.trim()) errs.email = "Add an email, or pick another way to reach them.";
  return errs;
}

export function validateProperty(p: PropertyInput): Record<string, string> {
  const errs: Record<string, string> = {};
  if (!p.street.trim()) errs.street = "Enter the street address.";
  if (!p.city.trim()) errs.city = "Enter the city.";
  if (!/^[A-Za-z]{2}$/.test(p.state.trim())) errs.state = "Use the 2-letter state, like DE.";
  if (p.zip.trim() && !/^\d{5}(-\d{4})?$/.test(p.zip.trim())) errs.zip = "ZIP should be 5 digits.";
  return errs;
}

export const EMPTY_CONTACT: ContactInput = {
  firstName: "",
  lastName: "",
  company: "",
  phone: "",
  phoneAlt: "",
  email: "",
  preferredContact: "phone",
  leadSource: "",
  notes: "",
};

export const EMPTY_PROPERTY: PropertyInput = {
  label: "",
  street: "",
  unit: "",
  city: "",
  state: "DE",
  zip: "",
  county: "",
  accessNotes: "",
  isPrimary: false,
};

/** Kent or Sussex from a Delaware city name, so most addresses fill the county for you. */
const KENT = ["dover", "camden", "wyoming", "smyrna", "clayton", "magnolia", "felton", "harrington", "frederica", "hartly", "cheswold", "kenton", "marydel", "viola", "woodside", "little creek", "leipsic", "bowers"];
const SUSSEX = ["lewes", "rehoboth beach", "rehoboth", "milton", "georgetown", "seaford", "laurel", "millsboro", "selbyville", "ocean view", "bethany beach", "dewey beach", "delmar", "bridgeville", "greenwood", "dagsboro", "frankford", "fenwick island", "millville", "harbeson", "lincoln", "ellendale", "slaughter beach", "blades", "bethel"];
export function guessCounty(city: string): PropertyInput["county"] {
  const c = city.trim().toLowerCase();
  if (KENT.includes(c)) return "Kent";
  if (SUSSEX.includes(c)) return "Sussex";
  if (c === "milford") return ""; // Milford straddles both counties.
  return "";
}
