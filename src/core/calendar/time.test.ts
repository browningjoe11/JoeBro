import { formatRangeTitle, layoutDay, moveTimes, resizeEnd, startOfWeek, combine, toDateKey } from "./time";
import { eventColor } from "./types";

const at = (d: string, t: string) => combine(d, t)!;
const ev = (id: string, d: string, s: string, e: string, endDay = d) => ({ id, start: at(d, s).toISOString(), end: at(endDay, e).toISOString() });

describe("calendar time helpers", () => {
  it("starts weeks on Monday", () => {
    expect(toDateKey(startOfWeek(at("2026-12-03", "15:00")))).toBe("2026-11-30"); // Thursday
    expect(toDateKey(startOfWeek(at("2026-12-06", "09:00")))).toBe("2026-11-30"); // Sunday
    expect(toDateKey(startOfWeek(at("2026-11-30", "00:00")))).toBe("2026-11-30");
  });

  it("titles day and week ranges", () => {
    expect(formatRangeTitle("day", at("2026-12-01", "00:00"))).toBe("Tuesday, December 1, 2026");
    expect(formatRangeTitle("week", at("2026-12-01", "00:00"))).toBe("Nov 30 – Dec 6, 2026");
    expect(formatRangeTitle("week", at("2026-12-30", "00:00"))).toBe("Dec 28, 2026 – Jan 3 2027");
  });

  it("puts overlapping events side by side and others full width", () => {
    const day = at("2026-12-01", "00:00");
    const placed = layoutDay(
      [ev("a", "2026-12-01", "09:00", "11:00"), ev("b", "2026-12-01", "10:00", "12:00"), ev("c", "2026-12-01", "13:00", "14:00"), ev("x", "2026-12-02", "09:00", "10:00")],
      day,
    );
    const by = Object.fromEntries(placed.map((p) => [p.item.id, p]));
    expect(Object.keys(by).sort()).toEqual(["a", "b", "c"]);
    expect(by.a).toMatchObject({ top: 540, bottom: 660, lane: 0, lanes: 2 });
    expect(by.b).toMatchObject({ top: 600, bottom: 720, lane: 1, lanes: 2 });
    expect(by.c).toMatchObject({ lane: 0, lanes: 1 });
  });

  it("clips an overnight booking to each day", () => {
    const e = ev("n", "2026-12-01", "22:00", "02:00", "2026-12-02");
    expect(layoutDay([e], at("2026-12-01", "00:00"))[0]).toMatchObject({ top: 1320, bottom: 1440, startsToday: true, endsToday: false });
    expect(layoutDay([e], at("2026-12-02", "00:00"))[0]).toMatchObject({ top: 0, bottom: 120, startsToday: false, endsToday: true });
  });

  it("moves keeping the length, and resizes no shorter than 15 minutes", () => {
    const m = moveTimes(at("2026-12-01", "09:00"), at("2026-12-01", "10:30"), 2, 45);
    expect([m.start, m.end]).toEqual([at("2026-12-03", "09:45"), at("2026-12-03", "11:15")]);
    expect(resizeEnd(at("2026-12-01", "09:00"), at("2026-12-01", "10:00"), 90)).toEqual(at("2026-12-01", "11:30"));
    expect(resizeEnd(at("2026-12-01", "09:00"), at("2026-12-01", "10:00"), -120)).toEqual(at("2026-12-01", "09:15"));
  });

  it("colors by override, then crew, then kind", () => {
    expect(eventColor({ kind: "site_visit", color: null })).toBe("blue");
    expect(eventColor({ kind: "job", color: null }, "orange")).toBe("orange");
    expect(eventColor({ kind: "job", color: "red" }, "orange")).toBe("red");
  });
});
