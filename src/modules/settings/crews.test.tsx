import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { App } from "../../App";
import { addDays, memoryCalendar, startOfWeek, toDateKey } from "../../core/calendar";
import { memoryCrews } from "../../core/crews";
import { memorySettings } from "../../core/settings";
import { memoryTickets } from "../../core/tickets";

const wednesday = addDays(startOfWeek(new Date()), 2);

function renderApp(path = "/settings") {
  const crews = memoryCrews();
  render(
    <MemoryRouter initialEntries={[path]}>
      <App initialRole="admin" settings={memorySettings().backend} tickets={memoryTickets().backend} calendar={memoryCalendar().backend} crews={crews.backend} />
    </MemoryRouter>,
  );
  return crews;
}

const crewsSection = () => screen.getByRole("heading", { name: "Crews" }).closest("section")!;

beforeEach(() => localStorage.clear());

describe("Crews in Settings", () => {
  it("adds a crew with a color, skills, days and hours", async () => {
    const mem = renderApp();
    const section = crewsSection();
    await within(section).findByText("Deck crew");
    await userEvent.click(within(section).getByRole("button", { name: "Add crew" }));
    const sheet = screen.getByRole("dialog", { name: "Add crew" });
    // The first color no active crew uses is picked for you.
    expect(within(sheet).getByRole("radio", { name: /Blue/ })).toBeChecked();
    await userEvent.type(within(sheet).getByRole("textbox", { name: "Crew name" }), "Fence crew");
    await userEvent.click(within(sheet).getByRole("radio", { name: /Green/ }));
    await userEvent.click(within(sheet).getByRole("checkbox", { name: "Fencing" }));
    await userEvent.click(within(sheet).getByRole("checkbox", { name: "Sat" }));
    await userEvent.clear(within(sheet).getByLabelText("Day ends"));
    await userEvent.type(within(sheet).getByLabelText("Day ends"), "17:00");
    await userEvent.click(within(sheet).getByRole("button", { name: "Add crew" }));

    expect(await within(section).findByText("Fence crew added.")).toBeInTheDocument();
    const row = within(within(section).getByRole("table", { name: "Crews" })).getByText("Fence crew").closest("tr")!;
    expect(row).toHaveTextContent("Fencing");
    expect(row).toHaveTextContent("Mon–Sat");
    expect(row).toHaveTextContent("7:00 AM – 5:00 PM");
    expect(row.querySelector(".crew-chip")).toHaveClass("ev--green");
    expect(mem.crews().at(-1)).toMatchObject({ name: "Fence crew", color: "green", skills: ["Fencing"], workDays: [1, 2, 3, 4, 5, 6], dayEnd: "17:00" });
  });

  it("warns when a color is already taken and refuses a duplicate name", async () => {
    renderApp();
    const section = crewsSection();
    await within(section).findByText("Deck crew");
    await userEvent.click(within(section).getByRole("button", { name: "Add crew" }));
    const sheet = screen.getByRole("dialog", { name: "Add crew" });
    await userEvent.click(within(sheet).getByRole("radio", { name: /Teal/ }));
    expect(within(sheet).getByText(/Deck crew uses this color too/)).toBeInTheDocument();
    await userEvent.type(within(sheet).getByRole("textbox", { name: "Crew name" }), "deck crew");
    await userEvent.click(within(sheet).getByRole("button", { name: "Add crew" }));
    expect(await within(sheet).findByRole("alert")).toHaveTextContent("Another crew already has that name.");
  });

  it("puts a tech on a crew, and the tech shows in the crew's color", async () => {
    const mem = renderApp();
    const section = screen.getByRole("heading", { name: "Technicians" }).closest("section")!;
    await within(section).findByText("Jordan Price");
    await userEvent.click(within(section).getByRole("button", { name: "Edit Jordan Price" }));
    const sheet = screen.getByRole("dialog", { name: "Edit Jordan Price" });
    await userEvent.selectOptions(within(sheet).getByRole("combobox", { name: "Crew" }), "Siding crew");
    expect(within(sheet).getByText(/Works Mon–Sat, 7:00 AM – 4:00 PM/)).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: "Save technician" }));
    expect(await within(section).findByText("Jordan Price saved.")).toBeInTheDocument();
    const row = within(section).getByText("Jordan Price").closest("tr")!;
    expect(within(row).getByText("Siding crew").closest(".crew-chip")).toHaveClass("ev--orange");
    expect(mem.technicians().find((t) => t.fullName === "Jordan Price")?.crewId).toBe("crew-siding");
  });

  it("changing a crew's color recolors its bookings on the calendar", async () => {
    renderApp(`/calendar?view=day&date=${toDateKey(wednesday)}`);
    const booking = await screen.findByRole("button", { name: /Bathroom refresh at rental, .*Remodel crew/ });
    expect(booking).toHaveClass("ev--purple");
    expect(within(screen.getByLabelText("Crew colors")).getByText("Remodel crew").closest(".crew-chip")).toHaveClass("ev--purple");

    await userEvent.click(within(screen.getByRole("navigation")).getByRole("link", { name: "Settings" }));
    const section = crewsSection();
    await userEvent.click(await within(section).findByRole("button", { name: "Edit Remodel crew" }));
    const sheet = screen.getByRole("dialog", { name: "Edit Remodel crew" });
    await userEvent.click(within(sheet).getByRole("radio", { name: /Red/ }));
    await userEvent.click(within(sheet).getByRole("button", { name: "Save crew" }));
    await within(section).findByText("Remodel crew saved.");

    await userEvent.click(within(screen.getByRole("navigation")).getByRole("link", { name: "Calendar" }));
    // Back on the calendar (this week), every remodel booking is red now.
    await waitFor(() => {
      const bookings = screen.getAllByRole("button", { name: /Bathroom refresh at rental, .*Remodel crew/ });
      expect(bookings.length).toBeGreaterThan(0);
      for (const b of bookings) expect(b).toHaveClass("ev--red");
    });
  });

  it("books a crew from the calendar and the booking takes its color", async () => {
    renderApp(`/calendar?view=day&date=${toDateKey(wednesday)}`);
    await screen.findByRole("button", { name: /Bathroom refresh/ });
    await userEvent.click(screen.getByRole("button", { name: "New booking" }));
    const sheet = screen.getByRole("dialog", { name: "New booking" });
    await userEvent.type(within(sheet).getByLabelText("Title"), "Deck footings");
    await userEvent.selectOptions(within(sheet).getByRole("combobox", { name: "Crew" }), "Deck crew");
    expect(within(sheet).getByRole("option", { name: /Automatic \(teal, Deck crew\)/ })).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: "Add to calendar" }));
    expect(await screen.findByRole("button", { name: /Deck footings, .*Deck crew/ })).toHaveClass("ev--teal");
  });
});
