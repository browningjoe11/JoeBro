import type { CalendarEvent } from "../calendar/types";
import type { Technician } from "../crews/types";
import { dayStops, directionsUrl, fullAddress, techForLogin, telHref } from "./myDay";

const ev = (id: string, start: string, end: string, more: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id,
  kind: "job",
  status: "confirmed",
  title: id,
  start: new Date(start).toISOString(),
  end: new Date(end).toISOString(),
  ticketId: null,
  ticketLabel: "",
  ticketNumber: null,
  site: "",
  crewId: "crew-a",
  assignedTo: null,
  color: null,
  notes: "",
  isExample: false,
  ...more,
});

describe("dayStops", () => {
  const day = new Date(2026, 11, 2);
  const next = new Date(2026, 11, 3);
  const events = [
    ev("afternoon", "2026-12-02T13:00", "2026-12-02T15:00"),
    ev("morning", "2026-12-02T08:00", "2026-12-02T12:00"),
    ev("other crew", "2026-12-02T07:00", "2026-12-02T09:00", { crewId: "crew-b" }),
    ev("tomorrow", "2026-12-03T08:00", "2026-12-03T09:00"),
    ev("mine alone", "2026-12-02T16:00", "2026-12-02T17:00", { crewId: null, assignedTo: "me" }),
    ev("multi-day", "2026-12-01T08:00", "2026-12-04T16:00"),
  ];

  it("lists the crew's bookings for the day in start order", () => {
    expect(dayStops(events, { crewId: "crew-a", profileId: null }, day, next).map((e) => e.id)).toEqual(["multi-day", "morning", "afternoon"]);
  });

  it("adds bookings assigned to the tech personally", () => {
    expect(dayStops(events, { crewId: "crew-a", profileId: "me" }, day, next).map((e) => e.id)).toContain("mine alone");
    expect(dayStops(events, { crewId: null, profileId: "me" }, day, next).map((e) => e.id)).toEqual(["mine alone"]);
  });

  it("shows nothing when there's no crew and no login", () => {
    expect(dayStops(events, { crewId: null, profileId: null }, day, next)).toEqual([]);
  });
});

describe("techForLogin", () => {
  const t = (id: string, profileId: string | null, active = true) => ({ id, profileId, active }) as Technician;
  it("finds the active tech linked to a login", () => {
    expect(techForLogin([t("a", "u1", false), t("b", "u1"), t("c", "u2")], "u1")?.id).toBe("b");
    expect(techForLogin([t("a", "u1")], null)).toBeNull();
    expect(techForLogin([t("a", "u1", false)], "u1")).toBeNull();
  });
});

describe("addresses and links", () => {
  it("builds a full address a map app can find", () => {
    expect(fullAddress({ street: "27 Delaware Ave", unit: "", city: "Rehoboth Beach", state: "DE", zip: "19971" })).toBe(
      "27 Delaware Ave, Rehoboth Beach, DE 19971",
    );
    expect(fullAddress({ street: "9 Main St", unit: "Apt 2", city: "Dover", state: "", zip: "" })).toBe("9 Main St Apt 2, Dover, DE");
    expect(fullAddress("118 Fox Hall Dr, Dover")).toBe("118 Fox Hall Dr, Dover, DE");
    expect(fullAddress("118 Fox Hall Dr, Dover, DE 19904")).toBe("118 Fox Hall Dr, Dover, DE 19904");
    expect(fullAddress("")).toBe("");
  });

  it("links to turn-by-turn directions", () => {
    expect(directionsUrl("27 Delaware Ave, Rehoboth Beach, DE 19971")).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=27%20Delaware%20Ave%2C%20Rehoboth%20Beach%2C%20DE%2019971",
    );
  });

  it("turns a phone number as typed into a tap-to-call link", () => {
    expect(telHref("(302) 555-0142")).toBe("tel:+13025550142");
    expect(telHref("302.555.0119")).toBe("tel:+13025550119");
    expect(telHref("1-302-555-0119")).toBe("tel:+13025550119");
    expect(telHref("")).toBe("");
    expect(telHref("call me")).toBe("");
  });
});
