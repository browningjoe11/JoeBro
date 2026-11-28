import { CRM_IMPORT_SOURCE } from "./types";
import { memoryImport } from "./memoryImport";
import { parseCrmExport } from "./parse";
import { planImport } from "./plan";
import { runImport } from "./run";

const file = (value: unknown) => JSON.stringify(value);

describe("planImport", () => {
  it("matches an existing customer by phone, whatever the formatting, and then by email", async () => {
    const mem = memoryImport([
      { id: "already-phone", firstName: "Riley", lastName: "Sample", phone: "302-555-0191" },
      { id: "already-email", firstName: "Avery", lastName: "Example", email: "avery@example.com" },
    ]);
    const parsed = parseCrmExport(
      file({
        contacts: [
          { id: "file-riley", name: "R. Sample", phone: "(302) 555-0191", email: "other@example.com" },
          { id: "file-avery", name: "Avery Example", email: "Avery@Example.com" },
          { id: "file-new", name: "New Example", phone: "302-555-0100" },
        ],
      }),
    );
    const { actions, report } = planImport(parsed, await mem.backend.snapshot());
    expect(report.contacts).toMatchObject({ create: 1, match: 2, skip: 0, invalid: 0 });
    expect(report.contactRows.map((r) => [r.name, r.status])).toEqual([
      ["R. Sample", "match"],
      ["Avery Example", "match"],
      ["New Example", "create"],
    ]);
    expect(report.contactRows[0].detail).toMatch(/phone/);
    expect(report.contactRows[1].detail).toMatch(/email/);
    expect(actions.filter((a) => a.op === "contact" && a.mode === "create")).toHaveLength(1);
  });

  it("keeps the phone match when the email belongs to someone else", async () => {
    const mem = memoryImport([
      { id: "by-phone", firstName: "Phone", lastName: "Person", phone: "3025550191" },
      { id: "by-email", firstName: "Email", lastName: "Person", email: "shared@example.com" },
    ]);
    const parsed = parseCrmExport(
      file({ contacts: [{ id: "both", name: "Both Example", phone: "302-555-0191", email: "shared@example.com" }] }),
    );
    const { report } = planImport(parsed, await mem.backend.snapshot());
    expect(report.contactRows[0]).toMatchObject({ status: "match", detail: expect.stringMatching(/phone/) });
    expect(report.issues.some((i) => i.message.includes("email matches Email Person"))).toBe(true);
  });

  it("does not write during a dry run, and a second import adds nothing", async () => {
    const mem = memoryImport();
    const text = file({
      contacts: [
        {
          id: "ex-1",
          name: "Riley Sample",
          phone: "302-555-0191",
          properties: [{ id: "site-1", street: "10 Example Lane", city: "Dover", state: "DE", zip: "19901" }],
        },
      ],
      tickets: [
        {
          id: "job-1",
          contactId: "ex-1",
          propertyId: "site-1",
          title: "Example deck",
          stage: "Scheduled",
          notes: [{ id: "n1", text: "Example note" }],
        },
      ],
    });
    const preview = await runImport(mem.backend, text, "crm.json", { dryRun: true, actorId: null });
    expect(preview.dryRun).toBe(true);
    expect(preview.contacts.create).toBe(1);
    expect(preview.tickets.create).toBe(1);
    expect(preview.notes.create).toBe(1);
    expect(preview.stages.scheduled).toBe(1);
    expect(mem.data.contacts).toHaveLength(0);

    const saved = await runImport(mem.backend, text, "crm.json", { dryRun: false, actorId: null });
    expect(saved.dryRun).toBe(false);
    expect(mem.data.contacts).toHaveLength(1);
    expect(mem.data.contacts[0]).toMatchObject({ importSource: CRM_IMPORT_SOURCE, importKey: "id:ex-1", name: "Riley Sample" });
    expect(mem.data.properties[0]).toMatchObject({ importSource: CRM_IMPORT_SOURCE, isPrimary: true, street: "10 Example Lane" });
    expect(mem.data.tickets[0]).toMatchObject({ stage: "scheduled", importKey: "id:job-1", propertyId: mem.data.properties[0].id });
    expect(mem.data.notes[0]).toMatchObject({ text: "Example note", importSource: CRM_IMPORT_SOURCE });

    const again = await runImport(mem.backend, text, "crm.json", { dryRun: false, actorId: null });
    expect(again.contacts).toMatchObject({ create: 0, skip: 1 });
    expect(again.properties.skip).toBe(1);
    expect(again.tickets.skip).toBe(1);
    expect(again.notes.skip).toBe(1);
    expect(mem.data.contacts).toHaveLength(1);
    expect(mem.data.tickets).toHaveLength(1);
    expect(mem.data.notes).toHaveLength(1);
  });

  it("folds two file rows with the same phone into one customer and two jobs", async () => {
    const mem = memoryImport();
    const text = file({
      contacts: [
        { id: "a", name: "Riley Sample", phone: "(302) 555-0191" },
        { id: "b", name: "Riley S.", phone: "302.555.0191" },
      ],
      tickets: [
        { id: "j1", contactId: "a", title: "First example job", stage: "Lead" },
        { id: "j2", contactId: "b", title: "Second example job", stage: "Estimating" },
      ],
    });
    await runImport(mem.backend, text, "crm.json", { dryRun: false, actorId: null });
    expect(mem.data.contacts).toHaveLength(1);
    expect(mem.data.tickets.map((t) => t.title).sort()).toEqual(["First example job", "Second example job"]);
    expect(new Set(mem.data.tickets.map((t) => t.contactId)).size).toBe(1);
  });

  it("treats Drive and Dr as the same job site and will not replace a main property", async () => {
    const mem = memoryImport([{ id: "c1", firstName: "Riley", lastName: "Sample", phone: "302-555-0191" }]);
    mem.data.properties.push({
      id: "p1",
      contactId: "c1",
      label: "Home",
      street: "10 Example Drive",
      unit: "",
      city: "Dover",
      state: "DE",
      zip: "19901",
      county: "Kent",
      accessNotes: "",
      isPrimary: true,
      importKey: null,
      importSource: null,
    });
    const text = file({
      contacts: [
        {
          id: "file-1",
          name: "Riley Sample",
          phone: "302-555-0191",
          properties: [
            { id: "dup", street: "10 Example Dr", city: "Dover", zip: "19901", isPrimary: true },
            { id: "other", street: "2 Other Lane", city: "Dover", zip: "19904", isPrimary: true },
          ],
        },
      ],
    });
    const report = await runImport(mem.backend, text, "crm.json", { dryRun: false, actorId: null });
    expect(mem.data.properties.map((p) => p.street)).toEqual(["10 Example Drive", "2 Other Lane"]);
    expect(mem.data.properties[1].isPrimary).toBe(false);
    expect(report.issues.some((i) => i.message.includes("Already have this address"))).toBe(true);
    expect(report.issues.some((i) => i.message.includes("main property"))).toBe(true);
    expect(mem.data.links.some((l) => l.entity === "contact" && l.matchedExisting && l.recordId === "c1")).toBe(true);
  });

  it("leaves invalid jobs out of the saved rows", async () => {
    const mem = memoryImport();
    const text = file({
      contacts: [{ id: "c", name: "Pat Example", phone: "302-555-0108" }],
      tickets: [{ id: "nope", contactId: "c", title: "Skipped example", stage: "Lost" }],
    });
    const report = await runImport(mem.backend, text, "crm.json", { dryRun: false, actorId: null });
    expect(report.tickets.invalid).toBeGreaterThan(0);
    expect(mem.data.contacts).toHaveLength(1);
    expect(mem.data.tickets).toHaveLength(0);
  });
});
