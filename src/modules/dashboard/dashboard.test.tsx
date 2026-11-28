import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { App } from "../../App";
import type { Role } from "../../core/modules";
import { memorySettings } from "../../core/settings";
import { memoryTickets } from "../../core/tickets";

function open(role: Role, path = "/dashboard") {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App initialRole={role} settings={memorySettings().backend} tickets={memoryTickets().backend} />
    </MemoryRouter>,
  );
}

const nextActions = (name: string) => screen.findByRole("table", { name });
const ticketLinks = (table: HTMLElement) =>
  within(table)
    .queryAllByRole("link")
    .map((a) => a.textContent);

beforeEach(() => localStorage.clear());

// Sample tickets: #1001 estimate sent, #1002 site visit, #1003 scheduling, #1004 lead, #1005 lost.
describe("role dashboards", () => {
  it("shows sales the estimate, site visit and lead waiting on them", async () => {
    open("sales");
    const table = await nextActions("Waiting on you");
    expect(await within(table).findByText("Signature to chase")).toBeInTheDocument();
    expect(
      ticketLinks(table)
        .map((l) => l?.slice(0, 5))
        .sort(),
    ).toEqual(["#1001", "#1002", "#1004"]);
  });

  it("shows operations only the job to schedule", async () => {
    open("operations");
    const table = await nextActions("Waiting on you");
    await within(table).findByText("Date to confirm");
    expect(ticketLinks(table).map((l) => l?.slice(0, 5))).toEqual(["#1003"]);
  });

  it("tells technicians and reviewers when nothing is waiting on them", async () => {
    open("reviewer");
    expect(await screen.findByText("Nothing is waiting on you right now.")).toBeInTheDocument();
  });

  it("lets admins see everyone's work or one team's", async () => {
    open("admin");
    const all = await nextActions("Waiting on anyone");
    await within(all).findByText("Date to confirm");
    expect(ticketLinks(all)).toHaveLength(4);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Show work for" }), "operations");
    const ops = await nextActions("Waiting on Operations");
    expect(ticketLinks(ops).map((l) => l?.slice(0, 5))).toEqual(["#1003"]);
  });

  it("counts tickets per stage and links each stage to the ticket list", async () => {
    open("sales");
    const counts = screen.getByRole("list", { name: "Tickets by stage" });
    await userEvent.click(await within(counts).findByRole("link", { name: "Scheduling: 1" }));
    expect(await screen.findByRole("table", { name: "1 ticket" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Show" })).toHaveValue("scheduling");
  });
});
