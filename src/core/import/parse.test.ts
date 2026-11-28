import { exampleExportJson } from "./exampleExport";
import { parseAddressLine, parseCrmExport } from "./parse";

describe("parseCrmExport", () => {
  it("reads the version 1 example, including stages and a note", () => {
    const parsed = parseCrmExport(exampleExportJson(), "joebros-crm-export.example.json");
    expect(parsed.fileError).toBeNull();
    expect(parsed.contacts.map((c) => c.name)).toEqual(["Riley Sample", "Sample Rentals LLC"]);
    expect(parsed.contacts[0]).toMatchObject({
      phone: "(302) 555-0191",
      email: "riley.sample@example.com",
      preferredContact: "text",
      notes: "Example customer note. Not a real person.",
    });
    expect(parsed.contacts[0].properties[0]).toMatchObject({ street: "10 Example Lane", city: "Dover", county: "Kent", isPrimary: true });
    expect(parsed.contacts[1].properties[0]).toMatchObject({ street: "5 Sample Street", city: "Lewes", county: "Sussex" });
    expect(parsed.tickets.map((t) => [t.title, t.stage, t.contactKey])).toEqual([
      ["Stain the example deck", "estimate_sent", "id:example-riley"],
      ["Example fence that did not go ahead", "lost", "id:example-rentals"],
    ]);
    expect(parsed.tickets[0].notes.map((n) => n.text)).toEqual(["Example note from the old CRM."]);
    expect(parsed.tickets[0].propertyKey).toBe("id:example-riley-home");
    expect(parsed.tickets[1].lostReason).toBe("Example: chose another contractor");
  });

  it("accepts nested customers and jobs under other names", () => {
    const parsed = parseCrmExport(
      JSON.stringify({
        customers: [
          {
            name: "Casey Example",
            mobile: "302.555.0148",
            emailAddress: "CASEY@example.com",
            address: "8 Sample Drive, Camden, DE 19934",
            jobs: [{ job: "Example porch repair", status: "In progress", notes: ["Called the example line."] }],
          },
        ],
      }),
    );
    expect(parsed.fileError).toBeNull();
    expect(parsed.contacts[0]).toMatchObject({ firstName: "Casey", lastName: "Example", email: "casey@example.com", phone: "302.555.0148" });
    expect(parsed.contacts[0].properties[0]).toMatchObject({ street: "8 Sample Drive", city: "Camden", state: "DE", zip: "19934", county: "Kent" });
    expect(parsed.tickets[0]).toMatchObject({ title: "Example porch repair", stage: "onsite" });
    expect(parsed.tickets[0].notes[0].text).toBe("Called the example line.");
  });

  it("reports rows that cannot be imported and keeps the rest", () => {
    const parsed = parseCrmExport(
      JSON.stringify({
        contacts: [
          { id: "ok", firstName: "Pat", lastName: "Example", phone: "302-555-0177" },
          { id: "blank" },
          { id: "mail", company: "Example Co", email: "not-an-email" },
        ],
        tickets: [
          { id: "bad-stage", contactId: "ok", title: "Example job", stage: "thinking about it" },
          { id: "lost", contactId: "ok", title: "Example lost job", stage: "Lost" },
          { id: "money", contactId: "ok", title: "Example priced job", stage: "lead", estimatedValue: "-5" },
          { id: "orphan", contactId: "missing", title: "No such customer", stage: "lead" },
        ],
      }),
    );
    expect(parsed.contacts.map((c) => c.key)).toEqual(["id:ok", "id:mail"]);
    expect(parsed.contacts[1].email).toBe("");
    expect(parsed.tickets).toEqual([]);
    const messages = parsed.issues.map((i) => i.message);
    expect(messages.some((m) => m.includes("no name"))).toBe(true);
    expect(messages.some((m) => m.includes("doesn't look right"))).toBe(true);
    expect(messages.some((m) => m.includes("isn't one this app uses"))).toBe(true);
    expect(messages.some((m) => m.includes("needs a reason"))).toBe(true);
    expect(messages.some((m) => m.includes("amount"))).toBe(true);
    expect(messages.some((m) => m.includes("doesn't point at a customer"))).toBe(true);
  });

  it("reads a CSV of one job per row, including a quoted comma", () => {
    const csv = [
      "name,phone,email,address,title,stage,estimated_value,note",
      'Jordan Example,302-555-0133,jordan@example.com,"12 Example Ave, Dover, DE 19901","Deck, example",Scheduled,"$1,250",Left an example voicemail',
    ].join("\n");
    const parsed = parseCrmExport(csv, "jobs.csv");
    expect(parsed.fileError).toBeNull();
    expect(parsed.contacts).toHaveLength(1);
    expect(parsed.contacts[0].properties[0]).toMatchObject({ street: "12 Example Ave", city: "Dover", zip: "19901" });
    expect(parsed.tickets[0]).toMatchObject({ title: "Deck, example", stage: "scheduled", estimatedValue: 1250 });
    expect(parsed.tickets[0].notes.map((n) => n.text)).toEqual(["Left an example voicemail"]);
    expect(parsed.contacts[0].notes).toBe("");
  });

  it("rejects a file that is not an export", () => {
    expect(parseCrmExport("").fileError).toMatch(/empty/);
    expect(parseCrmExport("{", "x.json").fileError).toMatch(/valid JSON/);
    expect(parseCrmExport("[]", "x.json").fileError).toMatch(/no customers/);
  });
});

describe("parseAddressLine", () => {
  it("splits a one-line Delaware address", () => {
    expect(parseAddressLine("10 Example Lane, Dover, DE 19901")).toEqual({
      street: "10 Example Lane",
      city: "Dover",
      state: "DE",
      zip: "19901",
    });
  });
});
