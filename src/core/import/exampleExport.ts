import { CRM_EXPORT_FORMAT, CRM_EXPORT_VERSION } from "./types";

/**
 * A fake export in the version-1 shape, so the Import page can hand someone a
 * sample and the tests can round-trip it. Every person and address here is made up.
 */
export const EXAMPLE_CRM_EXPORT = {
  format: CRM_EXPORT_FORMAT,
  version: CRM_EXPORT_VERSION,
  exportedAt: "2026-01-15T15:00:00.000Z",
  contacts: [
    {
      id: "example-riley",
      firstName: "Riley",
      lastName: "Sample",
      phone: "(302) 555-0191",
      email: "riley.sample@example.com",
      preferredContact: "text",
      leadSource: "Example referral",
      notes: "Example customer note. Not a real person.",
      properties: [
        {
          id: "example-riley-home",
          label: "Home",
          street: "10 Example Lane",
          city: "Dover",
          state: "DE",
          zip: "19901",
          county: "Kent",
          isPrimary: true,
          accessNotes: "Example gate code 0000.",
        },
      ],
    },
    {
      id: "example-rentals",
      company: "Sample Rentals LLC",
      phone: "302-555-0192",
      email: "rentals@example.com",
      properties: [
        {
          id: "example-rental-site",
          label: "Rental",
          street: "5 Sample Street",
          city: "Lewes",
          state: "DE",
          zip: "19958",
        },
      ],
    },
  ],
  tickets: [
    {
      id: "example-job-deck",
      contactId: "example-riley",
      propertyId: "example-riley-home",
      title: "Stain the example deck",
      trade: "Decks",
      scope: "Example scope of work for the importer.",
      stage: "Estimate sent",
      estimatedValue: 1500,
      leadSource: "Example referral",
      notes: [{ id: "example-note-1", text: "Example note from the old CRM.", createdAt: "2026-01-10T18:00:00.000Z" }],
    },
    {
      id: "example-job-lost",
      contactId: "example-rentals",
      propertyId: "example-rental-site",
      title: "Example fence that did not go ahead",
      trade: "Fencing",
      stage: "Lost",
      lostReason: "Example: chose another contractor",
      estimatedValue: 800,
    },
  ],
};

export function exampleExportJson(): string {
  return JSON.stringify(EXAMPLE_CRM_EXPORT, null, 2);
}
