import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { App } from "../../App";
import { addDays, memoryCalendar, startOfWeek, toDateKey } from "../../core/calendar";
import { memoryCrews } from "../../core/crews";
import type { JobMapProps } from "../../core/map/JobMap";
import { memoryGeo } from "../../core/map";
import { memorySettings } from "../../core/settings";

// Leaflet needs a real browser to draw; the stub lists the pins it was given instead.
vi.mock("../../core/map/JobMap", () => ({
  default: ({ days }: JobMapProps) => (
    <ul aria-label="Pins">
      {days.flatMap((d) =>
        d.stops.filter((s) => s.point).map((s) => (
          <li key={s.event.id}>{`${d.crew?.name ?? "No crew"} ${s.n} ${s.point!.lat},${s.point!.lng}`}</li>
        )),
      )}
    </ul>
  ),
}));

const thursday = addDays(startOfWeek(new Date()), 3);

function open(url: string, geo = memoryGeo()) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <App initialRole="operations" settings={memorySettings().backend} calendar={memoryCalendar().backend} crews={memoryCrews().backend} geo={geo.backend} />
    </MemoryRouter>,
  );
  return geo;
}

beforeEach(() => localStorage.clear());

describe("job map", () => {
  it("opens from the board on a day of the week and shows each crew's stops", async () => {
    open(`/operations?date=${toDateKey(thursday)}`);
    await screen.findByRole("heading", { name: "Scheduling board" });
    await userEvent.click(screen.getByRole("button", { name: "Map" }));
    expect(await screen.findByRole("heading", { name: "Job map" })).toBeInTheDocument();

    const remodel = await screen.findByRole("region", { name: "Remodel crew" });
    expect(within(remodel).getByRole("listitem", { name: "1. #1003 Bathroom refresh at rental" })).toHaveTextContent("27 Delaware Ave, Rehoboth Beach");
    expect(within(remodel).getByRole("listitem")).toHaveTextContent("soft");
    const none = screen.getByRole("region", { name: "No crew" });
    expect(within(none).getByRole("listitem", { name: "1. #1004 Fence repair" })).toHaveTextContent("site visit");
  });

  it("looks up addresses once, saves them on the property, and draws a pin in the crew's color", async () => {
    const geo = open(`/operations?view=map&date=${toDateKey(thursday)}`);
    const pins = await screen.findByRole("list", { name: "Pins" });
    expect(await within(pins).findByText("Remodel crew 1 38.7189,-75.0786")).toBeInTheDocument();
    expect(await within(pins).findByText("No crew 1 39.0946,-75.5593")).toBeInTheDocument();
    expect(await screen.findByText("2 stops · 2 on the map")).toBeInTheDocument();
    expect(geo.saved.get("p4")).toEqual({ lat: 38.7189, lng: -75.0786 });
    expect(new Set(geo.lookups).size).toBe(geo.lookups.length);
    const button = within(screen.getByRole("region", { name: "Remodel crew" })).getByRole("button", { name: "Show stop 1 on the map" });
    expect(button).toHaveClass("ev--purple");
  });

  it("says when an address can't be found and steps between days", async () => {
    open(`/operations?view=map&date=${toDateKey(thursday)}`, memoryGeo({ points: {} }));
    expect(await screen.findByText("2 stops · 0 on the map")).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText("Couldn't find this address on the map. Check it on the ticket.")).toHaveLength(2));

    await userEvent.click(screen.getByRole("button", { name: "Previous day" }));
    expect(await screen.findByRole("region", { name: "Remodel crew" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "No crew" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Previous day" }));
    await userEvent.click(screen.getByRole("button", { name: "Previous day" }));
    expect(await screen.findByText("Nothing booked at a job site this day.")).toBeInTheDocument();
    expect(screen.getByText("1 other booking without a job site (not on the map).")).toBeInTheDocument();
  });
});
