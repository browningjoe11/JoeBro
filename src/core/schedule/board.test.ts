import { addDays, startOfWeek, type CalendarEvent } from "../calendar";
import type { TicketSummary } from "../tickets";
import { bookedSummary, boardDays, buildQueue, cellEvents, crewDayHours, crewFits, dropTimes, hoursOn, moveToDay, onBoard, worksOn } from "./board";

const monday = startOfWeek(new Date(2026, 10, 30)); // Mon Nov 30 2026
const at = (day: number, h: number, m = 0) => {
  const d = addDays(monday, day);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

const ticket = (over: Partial<TicketSummary>): TicketSummary => ({
  id: "t",
  number: 1,
  title: "Job",
  stage: "signed",
  stageChangedAt: "2026-11-20T00:00:00Z",
  customer: "",
  site: "",
  trade: "Carpentry",
  estimatedValue: null,
  nextActionAt: null,
  assignedTo: null,
  isExample: false,
  ...over,
});

const ev = (over: Partial<CalendarEvent>): CalendarEvent => ({
  id: "e",
  kind: "job",
  status: "tentative",
  title: "Job",
  start: at(1, 7),
  end: at(1, 15, 30),
  ticketId: null,
  ticketLabel: "",
  ticketNumber: null,
  site: "",
  crewId: null,
  assignedTo: null,
  color: null,
  notes: "",
  isExample: false,
  ...over,
});

const crew = { workDays: [1, 2, 3, 4, 5], dayStart: "07:00", dayEnd: "15:30", skills: ["Carpentry", "Decks"], active: true };

describe("scheduling board rules", () => {
  it("queues signed and scheduling tickets, oldest first, with their bookings counted", () => {
    const tickets = [
      ticket({ id: "a", number: 1, stage: "signed", stageChangedAt: "2026-11-25T00:00:00Z" }),
      ticket({ id: "b", number: 2, stage: "scheduling", stageChangedAt: "2026-11-21T00:00:00Z" }),
      ticket({ id: "c", number: 3, stage: "scheduled" }),
      ticket({ id: "d", number: 4, stage: "estimate_sent" }),
    ];
    const q = buildQueue(tickets, [ev({ id: "1", ticketId: "b" }), ev({ id: "2", ticketId: "b", status: "confirmed" }), ev({ id: "3", ticketId: "c" })]);
    expect(q.map((i) => i.ticket.number)).toEqual([2, 1]);
    expect(q[0]).toMatchObject({ soft: 1, confirmed: 1 });
    expect(q[1]).toMatchObject({ soft: 0, confirmed: 0, bookings: [] });
  });

  it("sums up what's booked in words", () => {
    expect(bookedSummary({ soft: 0, confirmed: 0 })).toBe("Not booked yet");
    expect(bookedSummary({ soft: 1, confirmed: 0 })).toBe("1 day pencilled in");
    expect(bookedSummary({ soft: 0, confirmed: 3 })).toBe("3 days confirmed");
    expect(bookedSummary({ soft: 2, confirmed: 1 })).toBe("1 day confirmed, 2 pencilled in");
  });

  it("fills the crew's hours when a job is dropped, and a default day with no crew", () => {
    const tue = addDays(monday, 1);
    const t = dropTimes({ dayStart: "08:00", dayEnd: "16:30" }, tue);
    expect(t.start.toISOString()).toBe(at(1, 8));
    expect(t.end.toISOString()).toBe(at(1, 16, 30));
    expect(dropTimes(undefined, tue).start.toISOString()).toBe(at(1, 7));
  });

  it("keeps time of day and length when a booking moves to another day", () => {
    const t = moveToDay(ev({ start: at(1, 9), end: at(1, 12) }), addDays(monday, 3));
    expect(t.start.toISOString()).toBe(at(3, 9));
    expect(t.end.toISOString()).toBe(at(3, 12));
  });

  it("puts crew bookings and crewless jobs on the board, not crewless site visits", () => {
    expect(onBoard({ crewId: "x", kind: "site_visit" })).toBe(true);
    expect(onBoard({ crewId: null, kind: "job" })).toBe(true);
    expect(onBoard({ crewId: null, kind: "site_visit" })).toBe(false);
    const list = [ev({ id: "1", crewId: "x" }), ev({ id: "2", crewId: "y" }), ev({ id: "3", crewId: "x", start: at(2, 7) }), ev({ id: "4" })];
    expect(cellEvents(list, "x", addDays(monday, 1)).map((e) => e.id)).toEqual(["1"]);
    expect(cellEvents(list, null, addDays(monday, 1)).map((e) => e.id)).toEqual(["4"]);
  });

  it("shows weekends only when a crew works them or something is booked", () => {
    expect(boardDays(monday, [crew], [])).toHaveLength(5);
    expect(boardDays(monday, [{ ...crew, workDays: [1, 2, 3, 4, 5, 6] }], [])).toHaveLength(6);
    expect(boardDays(monday, [{ ...crew, workDays: [6], active: false }], [])).toHaveLength(5);
    expect(boardDays(monday, [crew], [{ start: at(6, 9) }]).map((d) => d.getDay())).toEqual([1, 2, 3, 4, 5, 0]);
  });

  it("counts hours booked against the crew's day", () => {
    expect(hoursOn([ev({}), ev({ start: at(1, 15), end: at(1, 17) })], addDays(monday, 1))).toBe(10.5);
    expect(crewDayHours(crew)).toBe(8.5);
    expect(worksOn(crew, addDays(monday, 5))).toBe(false);
    expect(worksOn(crew, monday)).toBe(true);
  });

  it("matches crews to a job's trade", () => {
    expect(crewFits(crew, "carpentry")).toBe(true);
    expect(crewFits(crew, "Siding")).toBe(false);
    expect(crewFits(crew, "")).toBe(false);
  });
});
