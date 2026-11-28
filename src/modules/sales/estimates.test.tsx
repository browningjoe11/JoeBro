import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { App } from "../../App";
import { memoryEstimates, normalizeLines } from "../../core/estimate";
import type { Role } from "../../core/modules";
import { memoryPriceBook } from "../../core/pricebook";
import { memorySettings } from "../../core/settings";
import { memoryTickets } from "../../core/tickets";

function renderApp(path: string, role: Role = "sales") {
  const tickets = memoryTickets();
  const estimates = memoryEstimates({ onVersion: (ticketId, total) => tickets.backend.update(ticketId, { estimatedValue: total }) });
  render(
    <MemoryRouter initialEntries={[path]}>
      <App initialRole={role} tickets={tickets.backend} estimates={estimates.backend} priceBook={memoryPriceBook().backend} settings={memorySettings().backend} />
    </MemoryRouter>,
  );
  return { tickets: tickets.backend, estimates };
}

const total = () => screen.getByTestId("estimate-total").textContent;
const section = (name: string) => screen.getByRole("button", { name, expanded: true }).closest("section") as HTMLElement;

async function addFromBook(sectionName: string, button: string, item: string) {
  const s = section(sectionName);
  // The search stays open after a pick, so several items can be added in a row.
  if (!within(s).queryByRole("button", { name: "Close price book" })) await userEvent.click(within(s).getByRole("button", { name: button }));
  await userEvent.click(await within(s).findByRole("button", { name: new RegExp(`^${item}`) }));
}

async function retype(input: HTMLElement, text: string) {
  await userEvent.clear(input);
  await userEvent.type(input, text);
}

beforeEach(() => localStorage.clear());

describe("Estimate builder", () => {
  it("builds a real estimate start to finish, with the total updating on every change", async () => {
    const { tickets, estimates } = renderApp("/sales/new?ticket=1002");
    expect(await screen.findByRole("combobox", { name: /Ticket/ })).toHaveDisplayValue(/#1002 Replace storm-damaged siding/);
    expect(screen.getByRole("textbox", { name: /Estimate name/ })).toHaveValue("Replace storm-damaged siding");
    await userEvent.click(screen.getByRole("button", { name: "Start estimate" }));

    // Builder opens empty at $0.00.
    expect(await screen.findByRole("heading", { level: 1, name: "Replace storm-damaged siding" })).toBeInTheDocument();
    expect(total()).toBe("$0.00");

    // Time: carpenter for 10 hours at $75.
    await addFromBook("Time", "Add a labor rate from price book", "Carpenter");
    expect(total()).toBe("$75.00");
    await retype(screen.getByRole("textbox", { name: "Hours for Carpenter" }), "10");
    expect(total()).toBe("$750.00");

    // Materials: 100 sq ft of vinyl siding at $1.85 + 25% = $231.25.
    await addFromBook("Materials", "Add a material from price book", "Vinyl siding");
    await retype(screen.getByRole("textbox", { name: "Quantity of Vinyl siding" }), "100");
    expect(screen.getByRole("status", { name: "Amount for Vinyl siding" })).toHaveTextContent("$231.25");
    expect(total()).toBe("$981.25");
    // Changing the markup for this estimate only.
    await retype(screen.getByRole("textbox", { name: "Markup for Vinyl siding" }), "30");
    expect(total()).toBe("$990.50");

    // Adders: a permit and 2 dump loads.
    await addFromBook("Adders", "Add an adder from price book", "Building permit");
    expect(total()).toBe("$1,140.50");
    await addFromBook("Adders", "Add an adder from price book", "Dump trailer load");
    await retype(screen.getByRole("textbox", { name: "Quantity of Dump trailer load" }), "2");
    expect(total()).toBe("$1,590.50");

    // Multipliers: second-story height adds 20% to labor ($150).
    await addFromBook("Multipliers", "Add a multiplier from price book", "Second-story height");
    expect(screen.getByRole("status", { name: "Amount for Second-story height" })).toHaveTextContent("+$150.00");
    expect(total()).toBe("$1,740.50");

    // A blank line, typed by hand.
    await userEvent.click(within(section("Adders")).getByRole("button", { name: "Add a blank line" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Charge for adder line 3" }), "Porta-john");
    await retype(screen.getByRole("textbox", { name: "Price for Porta-john" }), "95");
    expect(total()).toBe("$1,835.50");

    // Rounding to $5.
    await userEvent.click(screen.getByRole("button", { name: "Tax and rounding" }));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Round the total" }), "5");
    expect(total()).toBe("$1,835.00");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Round" }), "up");
    expect(total()).toBe("$1,840.00");

    // Notes.
    await userEvent.type(screen.getByRole("textbox", { name: "Scope notes for the customer" }), "Replace siding on the north wall.");

    // The draft saves by itself.
    await waitFor(() => expect(screen.getByText("Draft saved")).toBeInTheDocument(), { timeout: 3000 });
    const saved = estimates.estimates().find((e) => e.title === "Replace storm-damaged siding");
    expect(saved).toMatchObject({ total: 1840, notes: "Replace siding on the north wall." });
    expect(saved?.lines.labor).toHaveLength(1);
    expect(saved?.lines.adders).toHaveLength(3);

    // Save version 1: the ticket's value follows, and the ticket moved to Estimating when the estimate started.
    await userEvent.click(screen.getByRole("button", { name: "Save version 1" }));
    const sheet = screen.getByRole("dialog", { name: "Save version 1" });
    await userEvent.type(within(sheet).getByRole("textbox", { name: /What changed/ }), "First estimate");
    await userEvent.click(within(sheet).getByRole("button", { name: "Save version 1" }));
    expect(await screen.findByText("Saved version 1. The ticket's estimated value is now $1,840.00.")).toBeInTheDocument();
    expect(within(section("Versions")).getByText("First estimate")).toBeInTheDocument();
    const ticket = await tickets.get(1002);
    expect(ticket).toMatchObject({ estimatedValue: 1840, stage: "estimating" });
    expect(screen.getByRole("button", { name: "Save version 2" })).toBeInTheDocument();
  }, 30_000);

  it("leaves a bad number out of the total and says why", async () => {
    renderApp("/sales/estimates/est-sample-1");
    expect(await screen.findByRole("heading", { level: 1, name: "Deck rebuild" })).toBeInTheDocument();
    expect(total()).toBe("$7,379.00");
    await userEvent.clear(screen.getByRole("textbox", { name: "Rate for Carpenter" }));
    expect(screen.getByRole("textbox", { name: "Rate for Carpenter" })).toHaveAttribute("aria-invalid", "true");
    expect(within(section("Time")).getByText("Enter an amount of $0 or more.")).toBeInTheDocument();
    expect(screen.getByText(/1 number is left out of the total/)).toBeInTheDocument();
    expect(total()).toBe("$4,979.00");
    await userEvent.click(screen.getByRole("button", { name: "Remove Helper" }));
    expect(total()).toBe("$3,899.00");
  });

  it("loads an older version back into the draft", async () => {
    renderApp("/sales/estimates/est-sample-1");
    await screen.findByRole("heading", { level: 1, name: "Deck rebuild" });
    await userEvent.click(screen.getByRole("button", { name: "Save version 1" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Save version 1" }));
    await screen.findByText(/Saved version 1/);

    await retype(screen.getByRole("textbox", { name: "Hours for Carpenter" }), "40");
    expect(total()).toBe("$7,979.00");
    await userEvent.click(screen.getByRole("button", { name: "Load version 1 into the draft" }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Load version 1?" })).getByRole("button", { name: "Replace the draft" }));
    expect(total()).toBe("$7,379.00");
    expect(screen.getByRole("textbox", { name: "Hours for Carpenter" })).toHaveValue("32");
  });

  it("won't save a draft without a name", async () => {
    const { estimates } = renderApp("/sales/estimates/est-sample-1");
    await screen.findByRole("heading", { level: 1, name: "Deck rebuild" });
    await userEvent.clear(screen.getByRole("textbox", { name: /Estimate name/ }));
    expect(screen.getByText(/Give the estimate a name/, { selector: ".field-error" })).toBeInTheDocument();
    expect(await screen.findByText(/Draft not saved/, {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save version 1" })).toBeDisabled();
    expect(estimates.estimates()[0].title).toBe("Deck rebuild");
  });

  it("lists estimates in Sales and on the ticket", async () => {
    renderApp("/sales");
    const table = await screen.findByRole("table", { name: "Estimates" });
    expect(within(table).getByRole("link", { name: "Deck rebuild" })).toHaveAttribute("href", "/sales/estimates/est-sample-1");
    expect(within(table).getByText("Dana Whitfield")).toBeInTheDocument();
    expect(within(table).getByText("$7,379.00")).toBeInTheDocument();
  });

  it("shows a ticket's estimates, with links only for sales and admins", async () => {
    renderApp("/tickets/1001");
    const s = (await screen.findByRole("button", { name: "Estimates" })).closest("section") as HTMLElement;
    expect(await within(s).findByRole("link", { name: "Deck rebuild" })).toBeInTheDocument();
    expect(within(s).getByRole("link", { name: "New estimate" })).toHaveAttribute("href", "/sales/new?ticket=1001");
  });

  it("shows operations the estimate without a link, and hides estimates from technicians", async () => {
    renderApp("/tickets/1001", "operations");
    const s = (await screen.findByRole("button", { name: "Estimates" })).closest("section") as HTMLElement;
    expect(await within(s).findByText("Deck rebuild")).toBeInTheDocument();
    expect(within(s).queryByRole("link")).not.toBeInTheDocument();
  });
});

describe("normalizeLines", () => {
  it("fills missing parts and keeps blanks as blanks", () => {
    const l = normalizeLines({ labor: [{ id: "a", name: "Carpenter", quantity: null, rate: 75 }], multipliers: [{ factor: 1.1, appliesTo: "nope" }] });
    expect(l.labor[0]).toMatchObject({ id: "a", unit: "hr", rate: 75 });
    expect(l.labor[0].quantity).toBeNaN();
    expect(l.multipliers[0].appliesTo).toBe("total");
    expect(l.multipliers[0].id).toBeTruthy();
    expect(l.materials).toEqual([]);
    expect(l.tax).toEqual({ ratePct: 0, taxable: { labor: false, materials: false, adders: false } });
    expect(l.rounding).toEqual({ increment: 0.01, direction: "nearest" });
    expect(normalizeLines(null).labor).toEqual([]);
  });
});

// Keeps act() warnings from timers out of the output.
afterEach(async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
});
