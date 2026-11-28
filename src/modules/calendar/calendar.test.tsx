import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { App } from "../../App";
import { addDays, memoryCalendar, startOfWeek, toDateKey } from "../../core/calendar";
import type { Role } from "../../core/modules";
import { memorySettings } from "../../core/settings";
import { memoryTickets } from "../../core/tickets";

const monday = startOfWeek(new Date());
const tuesday = addDays(monday, 1);

function open(path: string, role: Role = "admin") {
  const calendar = memoryCalendar();
  render(
    <MemoryRouter initialEntries={[path]}>
      <App initialRole={role} settings={memorySettings().backend} tickets={memoryTickets().backend} calendar={calendar.backend} />
    </MemoryRouter>,
  );
  return calendar;
}

const dayColumn = (d: Date) => screen.getByRole("group", { name: new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(d) });

beforeEach(() => localStorage.clear());

describe("calendar", () => {
  it("shows the week's bookings, with soft ones marked tentative", async () => {
    open(`/calendar?view=week&date=${toDateKey(monday)}`);
    expect(await screen.findByRole("button", { name: /Site visit: storm-damaged siding, 9 AM – 10 AM$/ })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Bathroom refresh at rental, .*tentative/ })).toHaveLength(2);
    expect(screen.getByText("5 bookings")).toBeInTheDocument();
  });

  it("switches to one day and steps between days", async () => {
    open(`/calendar?view=week&date=${toDateKey(monday)}`);
    await screen.findByText("5 bookings");
    await userEvent.click(screen.getByRole("button", { name: "Day" }));
    expect(await screen.findByText("1 booking")).toBeInTheDocument(); // Monday: supplier pickup
    await userEvent.click(screen.getByRole("button", { name: "Next day" }));
    expect(await screen.findByRole("button", { name: /storm-damaged siding/ })).toBeInTheDocument();
    expect(screen.getAllByRole("group", { name: /day,/ })).toHaveLength(1);
  });

  it("books a time picked on the grid", async () => {
    const cal = open(`/calendar?view=day&date=${toDateKey(tuesday)}`);
    await screen.findByText("1 booking");
    // jsdom has no layout, so a press at the top of the column picks midnight.
    const col = dayColumn(tuesday);
    fireEvent.pointerDown(col, { button: 0, pointerId: 1, clientX: 10, clientY: 0, pointerType: "mouse" });
    fireEvent.pointerUp(col, { button: 0, pointerId: 1, clientX: 10, clientY: 0, pointerType: "mouse" });
    const sheet = await screen.findByRole("dialog", { name: "New booking" });
    expect(within(sheet).getByLabelText("Starts")).toHaveValue("00:00");
    expect(within(sheet).getByLabelText("Ends")).toHaveValue("01:00");
    await userEvent.type(within(sheet).getByLabelText("Title"), "Measure kitchen");
    await userEvent.clear(within(sheet).getByLabelText("Starts"));
    await userEvent.type(within(sheet).getByLabelText("Starts"), "13:00");
    await userEvent.clear(within(sheet).getByLabelText("Ends"));
    await userEvent.type(within(sheet).getByLabelText("Ends"), "14:30");
    await userEvent.click(within(sheet).getByRole("button", { name: "Add to calendar" }));
    expect(await screen.findByRole("button", { name: "Measure kitchen, 1 PM – 2:30 PM" })).toBeInTheDocument();
    expect(cal.all().find((e) => e.title === "Measure kitchen")).toMatchObject({ kind: "site_visit", status: "confirmed" });
  });

  it("refuses an end before the start", async () => {
    open(`/calendar?view=day&date=${toDateKey(tuesday)}`);
    await screen.findByText("1 booking");
    await userEvent.click(screen.getByRole("button", { name: "New booking" }));
    const sheet = await screen.findByRole("dialog", { name: "New booking" });
    await userEvent.type(within(sheet).getByLabelText("Title"), "Backwards");
    await userEvent.clear(within(sheet).getByLabelText("Ends"));
    await userEvent.type(within(sheet).getByLabelText("Ends"), "06:00");
    await userEvent.click(within(sheet).getByRole("button", { name: "Add to calendar" }));
    expect(await within(sheet).findByRole("alert")).toHaveTextContent("The end time must be after the start.");
  });

  it("edits, confirms and deletes a booking", async () => {
    const cal = open(`/calendar?view=week&date=${toDateKey(monday)}`);
    const [first] = await screen.findAllByRole("button", { name: /Bathroom refresh at rental, 8 AM – 4 PM/ });
    await userEvent.click(first);
    let sheet = await screen.findByRole("dialog", { name: "Edit booking" });
    expect(within(sheet).getByRole("link", { name: /Open ticket #1003/ })).toHaveAttribute("href", "/tickets/1003");
    await userEvent.selectOptions(within(sheet).getByLabelText("Status"), "confirmed");
    await userEvent.click(within(sheet).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getAllByRole("button", { name: /Bathroom refresh at rental, .*tentative/ })).toHaveLength(1));
    expect(cal.all().filter((e) => e.status === "tentative")).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: /Supplier pickup/ }));
    sheet = await screen.findByRole("dialog", { name: "Edit booking" });
    await userEvent.click(within(sheet).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("4 bookings")).toBeInTheDocument();
  });

  it("lets technicians look but not change anything", async () => {
    open(`/calendar?view=week&date=${toDateKey(monday)}`, "technician");
    await screen.findByText("5 bookings");
    expect(screen.queryByRole("button", { name: "New booking" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Supplier pickup/ }));
    const sheet = await screen.findByRole("dialog", { name: "Booking" });
    expect(within(sheet).getByLabelText("Title")).toBeDisabled();
    expect(within(sheet).queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });
});
