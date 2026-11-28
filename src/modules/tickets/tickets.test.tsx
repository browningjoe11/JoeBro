import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { App } from "../../App";
import type { Role } from "../../core/modules";
import { memorySettings } from "../../core/settings";
import { memoryTickets } from "../../core/tickets";

function open(path: string, role: Role = "admin") {
  const tickets = memoryTickets();
  render(
    <MemoryRouter initialEntries={[path]}>
      <App initialRole={role} settings={memorySettings().backend} tickets={tickets.backend} />
    </MemoryRouter>,
  );
  return tickets;
}

const activity = () => screen.getByRole("list", { name: "Activity" });
const stageBadge = () =>
  within(screen.getByRole("heading", { level: 1 }).closest("section")!).getAllByText(/./, { selector: ".ticket-stage-head .badge" })[0];

beforeEach(() => localStorage.clear());

describe("ticket list", () => {
  it("shows open tickets, searches, and can include closed ones", async () => {
    open("/tickets");
    const table = await screen.findByRole("table", { name: "4 tickets" });
    expect(
      within(table).getByRole("link", {
        name: "#1001 Rebuild 12×16 back deck",
      }),
    ).toBeInTheDocument();
    expect(within(table).queryByText(/Screened porch/)).not.toBeInTheDocument();

    await userEvent.type(screen.getByRole("searchbox", { name: "Search" }), "lewes");
    expect(await screen.findByRole("table", { name: "0 tickets" })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Show" }), "all");
    expect(
      await screen.findByRole("link", {
        name: "#1005 Screened porch addition",
      }),
    ).toBeInTheDocument();
  });

  it("only offers New ticket to roles that can create tickets", async () => {
    open("/tickets", "technician");
    await screen.findByRole("heading", { level: 1, name: "Tickets" });
    expect(screen.queryByRole("button", { name: "New ticket" })).not.toBeInTheDocument();
  });
});

describe("creating a ticket", () => {
  it("creates a ticket for a new customer and opens it with its history", async () => {
    open("/tickets");
    await userEvent.click(await screen.findByRole("button", { name: "New ticket" }));
    await userEvent.click(screen.getByRole("button", { name: "Add a new customer" }));
    await userEvent.type(screen.getByRole("textbox", { name: "First name" }), "Pat");
    await userEvent.type(screen.getByRole("textbox", { name: "Last name" }), "Nguyen");
    await userEvent.type(screen.getByRole("textbox", { name: "Phone" }), "302-555-0100");
    await userEvent.type(screen.getByRole("textbox", { name: "Street address" }), "12 Main St");
    await userEvent.type(screen.getByRole("textbox", { name: "City" }), "Smyrna");
    await userEvent.type(screen.getByRole("textbox", { name: "Title" }), "New front steps");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Trade" }), "Carpentry");
    await userEvent.type(screen.getByRole("textbox", { name: "Rough value" }), "4,200");
    await userEvent.click(screen.getByRole("button", { name: "Create ticket" }));

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "#1006 New front steps",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Pat Nguyen · 12 Main St, Smyrna")).toBeInTheDocument();
    expect(screen.getByText("$4,200")).toBeInTheDocument();
    expect(within(activity()).getByText(/created the ticket at/)).toHaveTextContent("Preview admin created the ticket at Lead");
  });

  it("picks an existing customer and one of their job sites", async () => {
    open("/tickets/new", "sales");
    await userEvent.type(await screen.findByRole("searchbox", { name: "Find a customer" }), "porter");
    await userEvent.click(await screen.findByRole("button", { name: /Elaine Porter/ }));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Where is the work?" }), "Rental · 27 Delaware Ave, Rehoboth Beach");
    await userEvent.type(screen.getByRole("textbox", { name: "Title" }), "Paint rental exterior");
    await userEvent.click(screen.getByRole("button", { name: "Create ticket" }));
    expect(await screen.findByText("Elaine Porter · 27 Delaware Ave, Rehoboth Beach")).toBeInTheDocument();
  });

  it("explains what's missing instead of creating a half ticket", async () => {
    const { backend } = open("/tickets/new");
    await userEvent.click(await screen.findByRole("button", { name: "Create ticket" }));
    expect(screen.getByText("Pick a customer, or add a new one.")).toBeInTheDocument();
    expect(screen.getByText(/Give the job a short title/)).toBeInTheDocument();
    expect(await backend.list()).toHaveLength(5);
  });

  it("sends roles that can't create tickets back to the list", async () => {
    open("/tickets/new", "reviewer");
    expect(await screen.findByRole("heading", { level: 1, name: "Tickets" })).toBeInTheDocument();
  });
});

describe("ticket detail", () => {
  it("moves a ticket through stages and logs each move", async () => {
    open("/tickets/1004");
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "#1004 Fence repair",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent("Lead");

    await userEvent.click(screen.getByRole("button", { name: "Start estimate" }));
    await userEvent.click(await screen.findByRole("button", { name: "Send estimate" }));
    await userEvent.click(await screen.findByRole("button", { name: "Mark signed" }));

    await waitFor(() => expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent("Signed"));
    expect(stageBadge()).toHaveTextContent("Signed");
    const log = within(activity())
      .getAllByText(/moved it from/)
      .map((el) => el.textContent);
    expect(log).toEqual([
      "Preview admin moved it from Estimate sent to Signed",
      "Preview admin moved it from Estimating to Estimate sent",
      "Preview admin moved it from Lead to Estimating",
    ]);
  });

  it("asks for a reason to mark a job lost, and can reopen it", async () => {
    open("/tickets/1002");
    await userEvent.click(await screen.findByRole("button", { name: "Mark lost" }));
    const sheet = screen.getByRole("dialog", { name: "Mark this job lost" });
    await userEvent.click(within(sheet).getByRole("button", { name: "Mark lost" }));
    expect(within(sheet).getByText(/A short reason helps later/)).toBeInTheDocument();

    await userEvent.type(within(sheet).getByRole("textbox", { name: "Why didn't it go ahead?" }), "Price: went with another contractor");
    await userEvent.click(within(sheet).getByRole("button", { name: "Mark lost" }));
    expect(
      await screen.findByText("Price: went with another contractor", {
        selector: ".ticket-lost",
        exact: false,
      }),
    ).toBeInTheDocument();
    expect(within(activity()).getByText(/Reason: Price/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Reopen" }));
    await waitFor(() => expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent("Lead"));
  });

  it("saves edits and shows what changed in the activity", async () => {
    open("/tickets/1001");
    const value = await screen.findByRole("textbox", { name: "Value" });
    await userEvent.clear(value);
    await userEvent.type(value, "15000");
    await userEvent.click(screen.getByRole("button", { name: "Save details" }));
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(within(activity()).getByText(/changed/)).toHaveTextContent("the value from $12,480 to $15,000");
  });

  it("adds notes to the timeline", async () => {
    open("/tickets/1001");
    await userEvent.type(await screen.findByRole("textbox", { name: "Add a note" }), "Customer wants gray boards.");
    await userEvent.click(screen.getByRole("button", { name: "Add note" }));
    expect(await within(activity()).findByText("Customer wants gray boards.")).toBeInTheDocument();
  });

  it("only offers each role the moves its team makes", async () => {
    open("/tickets/1003", "sales"); // Scheduling belongs to operations
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "#1003 Bathroom refresh at rental",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm schedule" })).not.toBeInTheDocument();
    expect(screen.getByText("Another team moves this ticket from Scheduling.")).toBeInTheDocument();
    expect(screen.getByText(/Your role can't edit tickets at Scheduling/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add note" })).toBeInTheDocument();
  });

  it("says when a ticket doesn't exist", async () => {
    open("/tickets/9999");
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Ticket not found",
      }),
    ).toBeInTheDocument();
  });
});
