import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { App } from "../../App";
import { memoryContacts } from "../../core/contacts";
import type { Role } from "../../core/modules";
import { memorySettings } from "../../core/settings";
import { memoryTickets } from "../../core/tickets";

function open(path: string, role: Role = "admin") {
  const contacts = memoryContacts();
  render(
    <MemoryRouter initialEntries={[path]}>
      <App initialRole={role} settings={memorySettings().backend} tickets={memoryTickets().backend} contacts={contacts.backend} />
    </MemoryRouter>,
  );
  return contacts;
}

beforeEach(() => localStorage.clear());

describe("customer list", () => {
  it("finds a customer in two keystrokes and opens them with Enter", async () => {
    open("/contacts");
    await screen.findByRole("table", { name: "5 customers" });
    const search = screen.getByRole("searchbox", { name: "Search" });
    expect(search).toHaveFocus();
    await userEvent.type(search, "el");
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Elaine Porter");
    await userEvent.keyboard("{Enter}");
    expect(await screen.findByRole("heading", { level: 1, name: "Elaine Porter" })).toBeInTheDocument();
  });

  it("flags and filters possible duplicates", async () => {
    open("/contacts");
    await screen.findByRole("table", { name: "5 customers" });
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Show" }), "duplicates");
    const table = await screen.findByRole("table", { name: "2 customers" });
    expect(within(table).getByRole("link", { name: "Dana Whitfield" })).toBeInTheDocument();
    expect(within(table).getByRole("link", { name: "D. Whitfield" })).toBeInTheDocument();
    expect(within(table).getAllByText("Possible duplicate")).toHaveLength(2);
  });

  it("is read-only for reviewers", async () => {
    open("/contacts", "reviewer");
    await screen.findByRole("table", { name: "5 customers" });
    expect(screen.queryByRole("button", { name: "New customer" })).not.toBeInTheDocument();
  });
});

describe("customer page", () => {
  it("shows every property, every ticket and the full history", async () => {
    open("/contacts/c3");
    expect(await screen.findByRole("heading", { level: 1, name: "Elaine Porter" })).toBeInTheDocument();
    expect(screen.getByText("9 Pilottown Rd, Lewes, DE 19958")).toBeInTheDocument();
    expect(screen.getByText("27 Delaware Ave, Rehoboth Beach, DE 19971")).toBeInTheDocument();
    const tickets = screen.getByRole("table");
    expect(within(tickets).getByRole("link", { name: "#1005 Screened porch addition" })).toBeInTheDocument();
    expect(within(tickets).getByRole("link", { name: "#1003 Bathroom refresh at rental" })).toBeInTheDocument();
    const activity = screen.getByRole("list", { name: "Activity" });
    expect(within(activity).getAllByRole("listitem")).toHaveLength(4);
    expect(within(activity).getByText(/Reason: Timing/)).toBeInTheDocument();
  });

  it("warns when another customer has the same phone", async () => {
    open("/contacts/c5");
    expect(await screen.findByText("Possible duplicate", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dana Whitfield" })).toHaveAttribute("href", "/contacts/c1");
  });

  it("adds a property and makes it the main one", async () => {
    open("/contacts/c1");
    await screen.findByRole("heading", { level: 1, name: "Dana Whitfield" });
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    const sheet = screen.getByRole("dialog", { name: "Add property" });
    await userEvent.type(within(sheet).getByRole("textbox", { name: "Name" }), "Beach house");
    await userEvent.type(within(sheet).getByRole("textbox", { name: "Street address" }), "5 Ocean Dr");
    await userEvent.type(within(sheet).getByRole("textbox", { name: "City" }), "Lewes");
    await userEvent.tab();
    expect(within(sheet).getByRole("combobox", { name: "County" })).toHaveValue("Sussex");
    await userEvent.click(within(sheet).getByRole("checkbox", { name: /Main property/ }));
    await userEvent.click(within(sheet).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const items = screen.getAllByText(/County ·/).map((el) => el.closest("li")!);
    expect(items[0]).toHaveTextContent("Beach house");
    expect(items[0]).toHaveTextContent("Main");
  });

  it("edits details and warns before saving a duplicate email", async () => {
    open("/contacts/c4");
    await screen.findByRole("heading", { level: 1, name: "Tom Kowalski" });
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    const sheet = screen.getByRole("dialog", { name: "Edit customer" });
    await userEvent.type(within(sheet).getByRole("textbox", { name: "Email" }), "mreyes@example.com");
    expect(await within(sheet).findByText(/has the same email/)).toHaveTextContent("Marcus Reyes has the same email");
    await userEvent.clear(within(sheet).getByRole("textbox", { name: "Email" }));
    await userEvent.type(within(sheet).getByRole("textbox", { name: "Email" }), "tom.k@example.com");
    await userEvent.click(within(sheet).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText("tom.k@example.com")).toBeInTheDocument();
  });

  it("starts a new ticket with the customer already picked", async () => {
    open("/contacts/c3");
    await screen.findByRole("heading", { level: 1, name: "Elaine Porter" });
    await userEvent.click(screen.getByRole("button", { name: "New ticket" }));
    expect(await screen.findByRole("heading", { level: 1, name: "New ticket" })).toBeInTheDocument();
    expect(screen.getByText("Elaine Porter")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Where is the work?" })).toHaveDisplayValue("Home · 9 Pilottown Rd, Lewes");
  });
});

describe("adding a customer", () => {
  it("warns about a matching phone, then saves and opens the new customer", async () => {
    open("/contacts/new", "sales");
    await userEvent.type(await screen.findByRole("textbox", { name: "First name" }), "Dana");
    await userEvent.type(screen.getByRole("textbox", { name: "Last name" }), "W");
    await userEvent.type(screen.getByRole("textbox", { name: "Phone" }), "3025550142");
    expect(await screen.findByText("This might be a customer you already have")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save anyway" })).toBeInTheDocument();
    await userEvent.clear(screen.getByRole("textbox", { name: "Phone" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Phone" }), "302-555-0999");
    await userEvent.type(screen.getByRole("textbox", { name: "Street address" }), "1 Loockerman St");
    await userEvent.type(screen.getByRole("textbox", { name: "City" }), "Dover");
    await waitFor(() => expect(screen.queryByText("This might be a customer you already have")).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Save customer" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Dana W" })).toBeInTheDocument();
    expect(screen.getByText("1 Loockerman St, Dover, DE")).toBeInTheDocument();
  });
});
