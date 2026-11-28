import { displayName, normalizeEmail, normalizePhone } from "../contacts";
import { ALL_STAGES, type Stage } from "../tickets";
import { addressKey } from "./parse";
import type {
  ImportAction,
  ImportContactRow,
  ImportCounts,
  ImportIssue,
  ImportReport,
  ImportSnapshot,
  ImportTicketRow,
  ParsedExport,
  SnapshotContact,
} from "./types";

const usablePhone = (digits: string) => digits.length >= 7;
const usableEmail = (email: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);

interface Hit {
  id: string;
  name: string;
}

function blankCounts(): ImportCounts {
  return { create: 0, match: 0, skip: 0, invalid: 0 };
}

function emptyStages(): Record<Stage, number> {
  return Object.fromEntries(ALL_STAGES.map((s) => [s, 0])) as Record<Stage, number>;
}

/**
 * Decides what the file will do to the rows already stored. Matching is by
 * the export id first (so a second run changes nothing), then by normalized
 * phone, then by email. Phone wins when phone and email point at different
 * people. Nothing is written here.
 */
export function planImport(parsed: ParsedExport, snap: ImportSnapshot): { actions: ImportAction[]; report: ImportReport } {
  const skipMessage = /was skipped|isn't one this app uses|needs a reason|doesn't point at|doesn't name a customer|already uses this id|Couldn't read the amount/;
  const issues: ImportIssue[] = parsed.issues.map((i) => ({
    severity: skipMessage.test(i.message) ? "skip" : "warning",
    entity: i.entity,
    label: i.label,
    message: i.message,
  }));

  const actions: ImportAction[] = [];
  const contactRows: ImportContactRow[] = [];
  const ticketRows: ImportTicketRow[] = [];
  const counts = { contacts: blankCounts(), properties: blankCounts(), tickets: blankCounts(), notes: blankCounts() };
  const stages = emptyStages();
  let contactNotes = 0;

  const contactLink = new Map<string, string>();
  for (const link of snap.links) if (link.entity === "contact") contactLink.set(link.importKey, link.recordId);
  for (const c of snap.contacts) if (c.importKey) contactLink.set(c.importKey, c.id);

  const propertyLink = new Map<string, string>();
  for (const link of snap.links) if (link.entity === "property") propertyLink.set(link.importKey, link.recordId);
  for (const p of snap.properties) if (p.importKey) propertyLink.set(p.importKey, p.id);

  const ticketSeen = new Set<string>(snap.ticketKeys);
  const noteSeen = new Set<string>(snap.noteKeys);
  for (const link of snap.links) {
    if (link.entity === "ticket") ticketSeen.add(link.importKey);
    if (link.entity === "note") noteSeen.add(link.importKey);
  }

  const phoneIndex = new Map<string, Hit>();
  const emailIndex = new Map<string, Hit>();
  const indexContact = (c: Pick<SnapshotContact, "id" | "name" | "phone" | "phoneAlt" | "email">) => {
    for (const digits of [normalizePhone(c.phone), normalizePhone(c.phoneAlt)]) {
      if (usablePhone(digits) && !phoneIndex.has(digits)) phoneIndex.set(digits, { id: c.id, name: c.name });
    }
    const email = normalizeEmail(c.email);
    if (usableEmail(email) && !emailIndex.has(email)) emailIndex.set(email, { id: c.id, name: c.name });
  };
  for (const c of snap.contacts) indexContact(c);

  const addressByContact = new Map<string, Map<string, string>>();
  const primary = new Set<string>();
  for (const p of snap.properties) {
    const map = addressByContact.get(p.contactId) ?? new Map<string, string>();
    map.set(addressKey(p.street, p.city, p.zip, p.unit), p.id);
    addressByContact.set(p.contactId, map);
    if (p.isPrimary) primary.add(p.contactId);
  }

  const resolvedContact = new Map<string, { id: string; name: string; fresh: boolean }>();

  for (const contact of parsed.contacts) {
    const name = contact.name || displayName(contact);
    let recordId = contactLink.get(contact.key) ?? "";
    let status: ImportContactRow["status"];
    let detail: string;
    if (recordId) {
      status = "skip";
      detail = "Already imported";
      counts.contacts.skip++;
    } else {
      const phones = [normalizePhone(contact.phone), normalizePhone(contact.phoneAlt)].filter(usablePhone);
      const phoneHit = phones.map((p) => phoneIndex.get(p)).find((h): h is Hit => Boolean(h));
      const emailHit = usableEmail(contact.email) ? emailIndex.get(contact.email) : undefined;
      if (phoneHit && emailHit && phoneHit.id !== emailHit.id) {
        issues.push({
          severity: "warning",
          entity: "contact",
          label: name,
          message: `The phone matches ${phoneHit.name} and the email matches ${emailHit.name}. The phone match was used.`,
        });
      }
      const hit = phoneHit ?? emailHit;
      if (hit) {
        recordId = hit.id;
        status = "match";
        detail = `Same ${phoneHit ? "phone" : "email"} as ${hit.name}. Their existing record is kept.`;
        counts.contacts.match++;
        actions.push({ op: "contact", mode: "match", key: contact.key, recordId: hit.id });
        if (contact.notes) {
          issues.push({
            severity: "warning",
            entity: "contact",
            label: name,
            message: "A note on this customer was not copied, because they match someone already in Joebros.",
          });
        }
      } else {
        recordId = `new:${contact.key}`;
        status = "create";
        detail = "New customer";
        counts.contacts.create++;
        actions.push({
          op: "contact",
          mode: "create",
          key: contact.key,
          fields: {
            firstName: contact.firstName,
            lastName: contact.lastName,
            company: contact.company,
            phone: contact.phone,
            phoneAlt: contact.phoneAlt,
            email: contact.email,
            preferredContact: contact.preferredContact,
            leadSource: contact.leadSource,
            notes: contact.notes,
          },
        });
        if (contact.notes) contactNotes++;
      }
    }
    resolvedContact.set(contact.key, { id: recordId, name, fresh: status === "create" });
    indexContact({ id: recordId, name, phone: contact.phone, phoneAlt: contact.phoneAlt, email: contact.email });
    contactLink.set(contact.key, recordId);
    contactRows.push({ key: contact.key, name, phone: contact.phone, email: contact.email, status, detail });

    let tookPrimary = primary.has(recordId);
    let sawProperty = false;
    for (const property of contact.properties) {
      const linked = propertyLink.get(property.key);
      if (linked) {
        counts.properties.skip++;
        propertyLink.set(property.key, linked);
        continue;
      }
      const addr = addressKey(property.street, property.city, property.zip, property.unit);
      const onContact = addressByContact.get(recordId) ?? new Map<string, string>();
      const sameAddress = onContact.get(addr);
      if (sameAddress) {
        counts.properties.match++;
        actions.push({ op: "property", mode: "match", key: property.key, recordId: sameAddress });
        propertyLink.set(property.key, sameAddress);
        issues.push({
          severity: "warning",
          entity: "property",
          label: property.street,
          message: `Already have this address for ${name}, so the existing one was kept.`,
        });
        continue;
      }
      let isPrimary = property.isPrimary && !tookPrimary;
      if (!tookPrimary && !sawProperty && status === "create" && !property.isPrimary) isPrimary = true;
      if (property.isPrimary && tookPrimary) {
        issues.push({
          severity: "warning",
          entity: "property",
          label: property.street,
          message: `${name} already has a main property, so this one was added as an extra site.`,
        });
      }
      if (isPrimary) tookPrimary = true;
      sawProperty = true;
      const newId = `new:${property.key}`;
      counts.properties.create++;
      actions.push({
        op: "property",
        mode: "create",
        key: property.key,
        contactKey: contact.key,
        fields: {
          label: property.label,
          street: property.street,
          unit: property.unit,
          city: property.city,
          state: property.state,
          zip: property.zip,
          county: property.county,
          accessNotes: property.accessNotes,
          isPrimary,
        },
      });
      onContact.set(addr, newId);
      addressByContact.set(recordId, onContact);
      propertyLink.set(property.key, newId);
      if (isPrimary) primary.add(recordId);
    }
  }

  const contactName = (key: string) => resolvedContact.get(key)?.name ?? "Customer";

  for (const ticket of parsed.tickets) {
    const customer = contactName(ticket.contactKey);
    if (!resolvedContact.has(ticket.contactKey)) {
      counts.tickets.invalid++;
      issues.push({ severity: "skip", entity: "ticket", label: ticket.title, message: "This job's customer was skipped, so the job was skipped too." });
      continue;
    }
    if (ticketSeen.has(ticket.key)) {
      counts.tickets.skip++;
      ticketRows.push({ key: ticket.key, title: ticket.title, stage: ticket.stage, customer, status: "skip", detail: "Already imported" });
      counts.notes.skip += ticket.notes.length;
      continue;
    }
    let propertyKey = ticket.propertyKey;
    if (propertyKey && !propertyLink.has(propertyKey)) {
      issues.push({
        severity: "warning",
        entity: "ticket",
        label: ticket.title,
        message: "The job's property was skipped, so the job was imported without a job site.",
      });
      propertyKey = null;
    }
    counts.tickets.create++;
    stages[ticket.stage]++;
    actions.push({
      op: "ticket",
      mode: "create",
      key: ticket.key,
      contactKey: ticket.contactKey,
      propertyKey,
      fields: {
        title: ticket.title,
        trade: ticket.trade,
        scope: ticket.scope,
        stage: ticket.stage,
        lostReason: ticket.lostReason,
        leadSource: ticket.leadSource,
        estimatedValue: ticket.estimatedValue,
      },
    });
    ticketRows.push({ key: ticket.key, title: ticket.title, stage: ticket.stage, customer, status: "create", detail: "New job" });
    ticketSeen.add(ticket.key);

    for (const note of ticket.notes) {
      if (noteSeen.has(note.key)) {
        counts.notes.skip++;
        continue;
      }
      counts.notes.create++;
      actions.push({ op: "note", mode: "create", key: note.key, ticketKey: ticket.key, text: note.text, createdAt: note.createdAt });
      noteSeen.add(note.key);
    }
  }

  for (const issue of issues) {
    if (issue.severity !== "skip") continue;
    if (issue.entity === "contact") counts.contacts.invalid++;
    else if (issue.entity === "property") counts.properties.invalid++;
    else if (issue.entity === "ticket") counts.tickets.invalid++;
    else if (issue.entity === "note") counts.notes.invalid++;
  }

  const report: ImportReport = {
    dryRun: true,
    fileError: parsed.fileError,
    contacts: counts.contacts,
    properties: counts.properties,
    tickets: counts.tickets,
    notes: counts.notes,
    stages,
    contactRows,
    ticketRows,
    issues,
    contactNotes,
  };
  return { actions, report };
}
