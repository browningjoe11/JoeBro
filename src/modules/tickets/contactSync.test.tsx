// C2: phone, email and address on a ticket are the customer's own fields, so an edit anywhere shows everywhere, with a change log.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { App } from "../../App";
import { memoryContacts } from "../../core/contacts";
import type { Role } from "../../core/modules";
import { memorySettings } from "../../core/settings";
import { memoryTickets } from "../../core/tickets";

function open(path: string, role: Role = "admin") {
  // Linked the way the app links them in preview mode, mirroring the database join.
  const contacts = memoryContacts().backend;
  render(
    <MemoryRouter initialEntries={[path]}>
      <App initialRole={role} settings={memorySettings().backend} tickets={memoryTickets({ contacts }).backend} contacts={contacts} />
    </MemoryRouter>,
  );
}

const section = (name: string) => screen.getByRole("heading", { name }).closest("section") as HTMLElement;

beforeEach(() => localStorage.clear());

describe("editing contact details from a ticket", () => {
  it("a new phone on one ticket shows on the contact page and on the customer's other ticket, with a log entry", async () => {
    open("/tickets/1003");
    await screen.findByRole("heading", { level: 1, name: /#1003/ });
    expect(within(section("Customer and site")).getByText("302.555.0119")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Edit contact" }));
    const sheet = await screen.findByRole("dialog", { name: "Edit customer" });
    expect(within(sheet).getByText(/on all 2 of their tickets/)).toBeInTheDocument();
    const phone = within(sheet).getByRole("textbox", { name: "Phone" });
    await userEvent.clear(phone);
    await userEvent.type(phone, "(302) 555-0199");
    await userEvent.click(within(sheet).getByRole("button", { name: "Save" }));

    // This ticket: new number, and the change is on its timeline.
    expect(await within(section("Customer and site")).findByText("(302) 555-0199")).toBeInTheDocument();
    const activity = screen.getByRole("list", { name: "Activity" });
    expect(within(activity).getByText(/changed the customer's phone from “302.555.0119” to “\(302\) 555-0199”/)).toBeInTheDocument();
    expect(within(activity).getAllByText("Preview admin").length).toBeGreaterThan(0);

    // The contact page.
    await userEvent.click(within(section("Customer and site")).getByRole("link", { name: "Elaine Porter" }));
    await screen.findByRole("heading", { level: 1, name: "Elaine Porter" });
    expect(within(section("Details")).getByText("(302) 555-0199")).toBeInTheDocument();
    expect(within(section("Change log")).getByText(/changed the customer's phone/)).toBeInTheDocument();

    // Her other ticket.
    await userEvent.click(within(screen.getByRole("table")).getByRole("link", { name: "#1005 Screened porch addition" }));
    await screen.findByRole("heading", { level: 1, name: /#1005/ });
    expect(within(section("Customer and site")).getByText("(302) 555-0199")).toBeInTheDocument();
    expect(screen.getByText(/changed the customer's phone/)).toBeInTheDocument();
  });

  it("a job site edit from a ticket updates the address on the ticket and the contact page", async () => {
    open("/tickets/1003");
    await screen.findByRole("heading", { level: 1, name: /#1003/ });
    await userEvent.click(screen.getByRole("button", { name: "Edit site" }));
    const sheet = await screen.findByRole("dialog", { name: "Edit property" });
    const street = within(sheet).getByRole("textbox", { name: "Street address" });
    await userEvent.clear(street);
    await userEvent.type(street, "29 Delaware Ave");
    await userEvent.click(within(sheet).getByRole("button", { name: "Save" }));

    expect(await within(section("Customer and site")).findByText("29 Delaware Ave, Rehoboth Beach")).toBeInTheDocument();
    expect(screen.getByText(/changed the job site's street from “27 Delaware Ave” to “29 Delaware Ave”/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: "Elaine Porter" }));
    expect(await screen.findByText("29 Delaware Ave, Rehoboth Beach, DE 19971")).toBeInTheDocument();
  });

  it.each(["technician", "reviewer"] as const)("%s sees the details but can't edit them", async (role) => {
    open("/tickets/1003", role);
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByRole("button", { name: "Edit contact" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit site" })).not.toBeInTheDocument();
  });
});
