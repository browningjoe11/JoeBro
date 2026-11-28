import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { App } from "../../App";
import { addDays, memoryCalendar, startOfWeek, toDateKey } from "../../core/calendar";
import { memoryCrews, SAMPLE_CREW_IDS } from "../../core/crews";
import type { Role } from "../../core/modules";
import { memorySettings } from "../../core/settings";
import { memoryTickets } from "../../core/tickets";

const monday = startOfWeek(new Date());
const LONG = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" });
const cell = (crew: string, day: Date) => screen.getByRole("gridcell", { name: `${crew}, ${LONG.format(day)}` });

/** Opens the board with the sample data plus one freshly signed job (#1006). */
async function open(role: Role = "operations") {
  const tickets = memoryTickets();
  const calendar = memoryCalendar();
  const n = await tickets.backend.create(
    { contactId: "c1", propertyId: "p1", title: "Replace front porch steps", trade: "Carpentry", scope: "", leadSource: "", estimatedValue: 2350, stage: "estimating" },
    null,
  );
  const signed = (await tickets.backend.get(n))!;
  await tickets.backend.move(signed.id, "estimate_sent");
  await tickets.backend.move(signed.id, "signed");
  render(
    <MemoryRouter initialEntries={[`/operations?date=${toDateKey(monday)}`]}>
      <App initialRole={role} settings={memorySettings().backend} tickets={tickets.backend} calendar={calendar.backend} crews={memoryCrews().backend} />
    </MemoryRouter>,
  );
  await screen.findByRole("heading", { name: "Waiting to be scheduled (2)" });
  return { tickets: tickets.backend, calendar, signedId: signed.id, number: n };
}

beforeEach(() => localStorage.clear());

describe("scheduling board", () => {
  it("lists signed jobs in the queue and draws soft bookings in crew lanes", async () => {
    await open();
    const queue = screen.getByRole("list", { name: "Jobs waiting to be scheduled" });
    expect(within(queue).getByRole("listitem", { name: "#1003 Bathroom refresh at rental" })).toHaveTextContent("2 days pencilled in");
    expect(within(queue).getByRole("listitem", { name: "#1006 Replace front porch steps" })).toHaveTextContent("Not booked yet");
    expect(screen.getAllByRole("rowheader").map((r) => r.textContent)).toEqual([
      expect.stringContaining("Deck crew"),
      expect.stringContaining("Siding crew"),
      expect.stringContaining("Remodel crew"),
    ]);
    // Siding crew works Saturdays, so the week shows Monday to Saturday.
    expect(screen.getAllByRole("columnheader")).toHaveLength(7);
    const wed = cell("Remodel crew", addDays(monday, 2));
    expect(within(wed).getByRole("button", { name: /Bathroom refresh at rental, 8 AM – 4 PM, soft/ })).toHaveClass("ev--purple", "ev--tentative");
    expect(screen.getByText("0 confirmed · 2 soft")).toBeInTheDocument();
  });

  it("pencils in a job dragged onto a crew's day for the crew's hours", async () => {
    const { calendar, tickets, signedId } = await open();
    const card = screen.getByRole("listitem", { name: "#1006 Replace front porch steps" });
    const tue = cell("Deck crew", addDays(monday, 1));
    fireEvent.dragStart(card);
    expect(screen.getAllByText("Does Carpentry")).toHaveLength(1);
    fireEvent.dragOver(tue);
    fireEvent.drop(tue);
    expect(await within(tue).findByRole("button", { name: /Replace front porch steps, 7 AM – 3:30 PM, soft/ })).toHaveClass("ev--teal", "ev--tentative");
    expect(calendar.all().find((e) => e.ticketId === signedId)).toMatchObject({ kind: "job", status: "tentative", crewId: SAMPLE_CREW_IDS.deck });
    expect((await tickets.list()).find((t) => t.id === signedId)?.stage).toBe("scheduling");
    expect(screen.getByRole("listitem", { name: "#1006 Replace front porch steps" })).toHaveTextContent("1 day pencilled in");
  });

  it("moves a booking to another crew and day by dragging, keeping its hours", async () => {
    const { calendar } = await open();
    const wed = cell("Remodel crew", addDays(monday, 2));
    const booking = within(wed).getByRole("button", { name: /Bathroom refresh/ });
    const fri = cell("Deck crew", addDays(monday, 4));
    fireEvent.dragStart(booking);
    fireEvent.dragOver(fri);
    fireEvent.drop(fri);
    expect(await within(fri).findByRole("button", { name: /Bathroom refresh at rental, 8 AM – 4 PM, soft/ })).toHaveClass("ev--teal");
    await waitFor(() => expect(calendar.all().find((e) => e.id === "ev3")).toMatchObject({ crewId: SAMPLE_CREW_IDS.deck }));
    expect(new Date(calendar.all().find((e) => e.id === "ev3")!.start).getDay()).toBe(5);
  });

  it("confirms a job: bookings turn solid and the ticket leaves the queue", async () => {
    const { calendar, tickets } = await open();
    const card = screen.getByRole("listitem", { name: "#1003 Bathroom refresh at rental" });
    await userEvent.click(within(card).getByRole("button", { name: "Confirm schedule" }));
    expect(await screen.findByRole("heading", { name: "Waiting to be scheduled (1)" })).toBeInTheDocument();
    const wed = cell("Remodel crew", addDays(monday, 2));
    expect(within(wed).getByRole("button", { name: /Bathroom refresh at rental, .*confirmed/ })).not.toHaveClass("ev--tentative");
    expect(calendar.all().filter((e) => e.ticketId === "t3").every((e) => e.status === "confirmed")).toBe(true);
    expect((await tickets.list()).find((t) => t.id === "t3")?.stage).toBe("scheduled");
    expect(screen.getByText("2 confirmed · 0 soft")).toBeInTheDocument();
  });

  it("schedules without dragging through the form, filled in for the job", async () => {
    const { calendar, signedId } = await open();
    const card = screen.getByRole("listitem", { name: "#1006 Replace front porch steps" });
    await userEvent.click(within(card).getByRole("button", { name: "Schedule…" }));
    const sheet = await screen.findByRole("dialog", { name: "New booking" });
    expect(within(sheet).getByLabelText("Title")).toHaveValue("Replace front porch steps");
    expect(within(sheet).getByLabelText("Status")).toHaveValue("tentative");
    expect(within(sheet).getByLabelText("Type")).toHaveValue("job");
    expect(within(sheet).getByLabelText("Crew")).toHaveValue(SAMPLE_CREW_IDS.deck);
    expect(within(sheet).getByLabelText("Starts")).toHaveValue("07:00");
    await waitFor(() => expect(within(sheet).getByLabelText("Ticket")).toHaveValue(signedId));
    await userEvent.click(within(sheet).getByRole("button", { name: "Add to calendar" }));
    await waitFor(() => expect(calendar.all().some((e) => e.ticketId === signedId && e.status === "tentative")).toBe(true));
    expect(await screen.findByText("1 day pencilled in")).toBeInTheDocument();
  });

  it("is not on the menu for sales", async () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <App initialRole="sales" settings={memorySettings().backend} tickets={memoryTickets().backend} calendar={memoryCalendar().backend} crews={memoryCrews().backend} />
      </MemoryRouter>,
    );
    await screen.findAllByRole("link", { name: /Dashboard/ });
    expect(screen.queryByRole("link", { name: /Operations/ })).not.toBeInTheDocument();
  });
});
