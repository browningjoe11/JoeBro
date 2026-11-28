import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { App } from "../../App";
import { addDays, CalendarProvider, memoryCalendar, startOfWeek, toDateKey } from "../../core/calendar";
import { ContactsProvider, memoryContacts } from "../../core/contacts";
import { CrewsProvider, memoryCrews, SAMPLE_CREW_IDS } from "../../core/crews";
import { CurrentUserProvider } from "../../core/currentUser";
import { memoryTickets, TicketsProvider } from "../../core/tickets";
import { MyDay } from "./MyDay";

// The sample remodel crew has the bathroom job (#1003) on Wednesday and Thursday of this week.
const wednesday = addDays(startOfWeek(new Date()), 2);
const LONG = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" });

function openAsOffice(date: Date, crew?: string) {
  const q = new URLSearchParams({ date: toDateKey(date), ...(crew ? { crew } : {}) });
  render(
    <MemoryRouter initialEntries={[`/onsite?${q}`]}>
      <App initialRole="operations" calendar={memoryCalendar().backend} crews={memoryCrews().backend} />
    </MemoryRouter>,
  );
}

/** A signed-in tech, linked (or not) to Rosa on the remodel crew. */
async function openAsTech(date: Date, linked = true) {
  const crews = memoryCrews();
  if (linked) await crews.backend.updateTechnician("tech-4", { profileId: "user-rosa" });
  const contacts = memoryContacts().backend;
  render(
    <MemoryRouter initialEntries={[`/onsite?date=${toDateKey(date)}`]}>
      <CurrentUserProvider user={{ id: "user-rosa", name: "Rosa", role: "technician" }}>
        <TicketsProvider backend={memoryTickets({ contacts }).backend}>
          <ContactsProvider backend={contacts}>
            <CrewsProvider backend={crews.backend}>
              <CalendarProvider backend={memoryCalendar().backend}>
                <MyDay />
              </CalendarProvider>
            </CrewsProvider>
          </ContactsProvider>
        </TicketsProvider>
      </CurrentUserProvider>
    </MemoryRouter>,
  );
}

describe("My Day", () => {
  it("shows a tech their crew's job with the full scope, site notes and the customer", async () => {
    await openAsTech(wednesday);
    const stop = await screen.findByRole("article", { name: "Bathroom refresh at rental" });
    expect(within(stop).getByText("New vanity, toilet, LVP flooring and paint in the hall bathroom.")).toBeInTheDocument();
    expect(within(stop).getByText("Elaine Porter")).toBeInTheDocument();
    expect(within(stop).getByText("27 Delaware Ave, Rehoboth Beach, DE 19971")).toBeInTheDocument();
    expect(within(stop).getByText("Pencilled in, waiting on vanity delivery.")).toBeInTheDocument();
    expect(within(stop).getByText("Not confirmed yet")).toBeInTheDocument();
    expect(within(stop).getByLabelText("Stop 1")).toBeInTheDocument();
  });

  it("reaches the job in one tap: Navigate opens directions, Call dials the customer", async () => {
    await openAsTech(wednesday);
    const stop = await screen.findByRole("article", { name: "Bathroom refresh at rental" });
    const nav = within(stop).getByRole("link", { name: "Navigate" });
    expect(nav).toHaveAttribute("href", "https://www.google.com/maps/dir/?api=1&destination=27%20Delaware%20Ave%2C%20Rehoboth%20Beach%2C%20DE%2019971");
    expect(nav).toHaveAttribute("target", "_blank");
    expect(within(stop).getByRole("link", { name: "Call Elaine" })).toHaveAttribute("href", "tel:+13025550119");
    expect(within(stop).getByRole("link", { name: "Open ticket #1003" })).toHaveAttribute("href", "/tickets/1003");
  });

  it("points a tech with an empty day at their next job", async () => {
    await openAsTech(addDays(wednesday, -2));
    await userEvent.click(await screen.findByRole("button", { name: /Next job:/ }));
    expect(await screen.findByRole("article", { name: "Bathroom refresh at rental" })).toBeInTheDocument();
  });

  it("tells a tech whose login isn't linked yet what to do", async () => {
    await openAsTech(wednesday, false);
    expect(await screen.findByText(/isn't linked to a technician yet/)).toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });

  it("lets the office pick a crew and see its day", async () => {
    openAsOffice(wednesday, SAMPLE_CREW_IDS.deck);
    expect(await screen.findByText(/No jobs booked/)).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Crew"), "Remodel crew");
    expect(await screen.findByRole("article", { name: "Bathroom refresh at rental" })).toBeInTheDocument();
  });

  it("steps between days", async () => {
    openAsOffice(addDays(wednesday, 1), SAMPLE_CREW_IDS.remodel);
    expect(await screen.findByRole("article", { name: "Bathroom refresh at rental" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Previous day" }));
    await userEvent.click(screen.getByRole("button", { name: "Previous day" }));
    await userEvent.click(screen.getByRole("button", { name: "Previous day" }));
    // Monday: the remodel crew has nothing booked.
    expect(await screen.findByText(/No jobs booked/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(LONG.format(addDays(wednesday, -2)));
  });

  it("is where a technician lands when they open the app", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App initialRole="technician" />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { level: 1, name: "My Day" })).toBeInTheDocument();
  });
});
