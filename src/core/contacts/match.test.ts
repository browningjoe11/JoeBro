import { duplicateMap, findMatches, guessCounty, matchScore, normalizePhone, searchContacts, validateContact, EMPTY_CONTACT } from ".";
import type { ContactSummary } from ".";

const person = (id: string, firstName: string, lastName: string, extra: Partial<ContactSummary> = {}): ContactSummary => ({
  id,
  firstName,
  lastName,
  company: "",
  name: `${firstName} ${lastName}`,
  phone: "",
  phoneAlt: "",
  email: "",
  isExample: false,
  createdAt: "2026-01-01T00:00:00Z",
  places: [],
  ticketCount: 0,
  openTicketCount: 0,
  lastActivityAt: "2026-01-01T00:00:00Z",
  ...extra,
});

const list = [
  person("1", "Dana", "Whitfield", { phone: "(302) 555-0142", email: "dana@example.com", places: [{ label: "Home", street: "118 Fox Hall Dr", city: "Dover", isPrimary: true }] }),
  person("2", "Marcus", "Reyes", { phone: "302-555-0187" }),
  person("3", "Adam", "Daniels", { phone: "302.555.0119", lastActivityAt: "2026-05-01T00:00:00Z" }),
  person("4", "D.", "Whitfield", { phone: "1-302-555-0142" }),
];

describe("phone numbers", () => {
  it("compare by digits and ignore a leading 1", () => {
    expect(normalizePhone("(302) 555-0142")).toBe("3025550142");
    expect(normalizePhone("+1 302.555.0142")).toBe("3025550142");
  });
});

describe("search", () => {
  it("puts a name that starts with the letters typed first", () => {
    expect(searchContacts(list, "da")[0].name).toBe("Dana Whitfield");
    expect(searchContacts(list, "re")[0].name).toBe("Marcus Reyes");
  });
  it("finds by the end of a phone number, an email, or an address", () => {
    expect(searchContacts(list, "0187").map((c) => c.id)).toEqual(["2"]);
    expect(searchContacts(list, "dana@").map((c) => c.id)).toEqual(["1"]);
    expect(searchContacts(list, "fox hall").map((c) => c.id)).toEqual(["1"]);
  });
  it("needs every word to match", () => {
    expect(matchScore(list[0], "dana dover")).toBeGreaterThan(0);
    expect(matchScore(list[0], "dana lewes")).toBe(0);
  });
});

describe("duplicates", () => {
  it("matches the same phone written differently, or the same email", () => {
    const m = findMatches(list, { phone: "302 555 0142" });
    expect(m.map((x) => x.id)).toEqual(["1", "4"]);
    expect(findMatches(list, { email: " DANA@example.com " }, "4")[0]).toMatchObject({ id: "1", reasons: ["email"] });
    expect(findMatches(list, { phone: "555" })).toEqual([]);
  });
  it("lists every customer that has a lookalike", () => {
    const map = duplicateMap(list);
    expect([...map.keys()].sort()).toEqual(["1", "4"]);
    expect(map.get("4")?.[0].name).toBe("Dana Whitfield");
  });
});

describe("form checks", () => {
  it("needs a name or company and a real phone and email", () => {
    expect(validateContact(EMPTY_CONTACT)).toHaveProperty("firstName");
    expect(validateContact({ ...EMPTY_CONTACT, company: "Bay Rentals", phone: "555-01", email: "nope" })).toEqual({
      phone: "Enter a 10-digit phone number.",
      email: "That email doesn't look right.",
    });
  });
  it("fills the county from common Kent and Sussex towns", () => {
    expect(guessCounty("Dover")).toBe("Kent");
    expect(guessCounty(" rehoboth beach ")).toBe("Sussex");
    expect(guessCounty("Milford")).toBe("");
  });
});
