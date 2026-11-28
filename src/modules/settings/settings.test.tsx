import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { App } from "../../App";
import { memorySettings } from "../../core/settings";
import type { Role } from "../../core/modules";

function renderSettings(role: Role = "admin", path = "/settings") {
  const mem = memorySettings();
  render(
    <MemoryRouter initialEntries={[path]}>
      <App initialRole={role} settings={mem.backend} />
    </MemoryRouter>,
  );
  return mem;
}

beforeEach(() => localStorage.clear());

describe("Settings", () => {
  it("is closed to everyone but admins", async () => {
    for (const role of ["sales", "operations", "technician", "reviewer"] as const) {
      const { unmount } = render(
        <MemoryRouter initialEntries={["/settings"]}>
          <App initialRole={role} settings={memorySettings().backend} />
        </MemoryRouter>,
      );
      expect(await screen.findByRole("heading", { name: "Page not available" }), role).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Settings" })).not.toBeInTheDocument();
      unmount();
    }
  });

  it("renames the company and the header follows", async () => {
    const mem = renderSettings();
    const name = await screen.findByRole("textbox", { name: "Company name" });
    await waitFor(() => expect(name).toHaveValue("Joebros Contracting Services"));
    await userEvent.clear(name);
    await userEvent.type(name, "Acme Home Services");
    await userEvent.type(screen.getByRole("textbox", { name: /license number/i }), "2026-0001");
    await userEvent.click(screen.getByRole("button", { name: "Save company profile" }));

    expect(await screen.findByText("Company profile saved.")).toBeInTheDocument();
    const brand = screen.getByTestId("brand-name");
    expect(brand).toHaveTextContent("Acme");
    expect(brand).toHaveTextContent("Home Services");
    expect(document.title).toBe("Acme Home Services");
    expect((await mem.backend.loadCompany()).licenseNumber).toBe("2026-0001");
  });

  it("switches a module off for everyone's menu", async () => {
    renderSettings();
    const nav = screen.getByRole("navigation");
    expect(within(nav).getByRole("link", { name: "Onsite" })).toBeInTheDocument();
    const modules = screen.getByRole("heading", { name: "Modules" }).closest("section")!;
    await userEvent.click(within(modules).getByRole("checkbox", { name: /Onsite/ }));
    await userEvent.click(within(modules).getByRole("button", { name: "Save modules" }));
    await waitFor(() => expect(within(nav).queryByRole("link", { name: "Onsite" })).not.toBeInTheDocument());
    // Dashboard and Settings can't be switched off.
    expect(within(modules).queryByRole("checkbox", { name: /Dashboard|Settings/ })).not.toBeInTheDocument();
  });

  it("invites someone with a role", async () => {
    const mem = renderSettings();
    await userEvent.click(await screen.findByRole("button", { name: "Invite someone" }));
    const sheet = screen.getByRole("dialog", { name: "Invite someone" });
    await userEvent.type(within(sheet).getByRole("textbox", { name: "Name" }), "Pat Painter");
    await userEvent.type(within(sheet).getByRole("textbox", { name: "Email" }), "Pat@Example.com");
    await userEvent.selectOptions(within(sheet).getByRole("combobox", { name: "Role" }), "sales");
    await userEvent.click(within(sheet).getByRole("button", { name: "Send invite" }));

    expect(await screen.findByText(/Invite sent to pat@example.com/)).toBeInTheDocument();
    expect(mem.invites).toEqual([{ email: "pat@example.com", fullName: "Pat Painter", role: "sales" }]);
    const table = screen.getByRole("table", { name: "Team members" });
    const row = within(table).getByText("Pat Painter").closest("tr")!;
    expect(row).toHaveTextContent("Sales");
    expect(row).toHaveTextContent("Invite sent");
  });

  it("rejects a bad invite email without sending", async () => {
    const mem = renderSettings();
    await userEvent.click(await screen.findByRole("button", { name: "Invite someone" }));
    const sheet = screen.getByRole("dialog", { name: "Invite someone" });
    await userEvent.type(within(sheet).getByRole("textbox", { name: "Email" }), "not-an-email");
    await userEvent.click(within(sheet).getByRole("button", { name: "Send invite" }));
    expect(await within(sheet).findByText("Enter a valid email address.")).toBeInTheDocument();
    expect(mem.invites).toEqual([]);
  });

  it("adds, hides and reorders dropdown choices", async () => {
    const mem = renderSettings();
    await userEvent.click(await screen.findByRole("button", { name: "Trades" }));
    const section = screen.getByRole("heading", { name: "Trades" }).closest("section")!;
    await userEvent.type(within(section).getByRole("textbox", { name: "Add a trade" }), "Gutters");
    await userEvent.click(within(section).getByRole("button", { name: "Add" }));
    expect(await within(section).findByText("Gutters")).toBeInTheDocument();

    await userEvent.click(within(section).getByRole("button", { name: "Hide Roofing" }));
    await within(section).findByRole("button", { name: "Show Roofing" });

    await userEvent.click(within(section).getByRole("button", { name: "Move Decks up" }));
    await waitFor(async () => {
      const trades = (await mem.backend.loadLists()).filter((l) => l.list === "trade");
      expect(trades.slice(0, 2).map((t) => t.label)).toEqual(["Decks", "Carpentry"]);
      expect(trades.find((t) => t.label === "Roofing")?.active).toBe(false);
      expect(trades.some((t) => t.label === "Gutters")).toBe(true);
    });

    // Duplicates are refused with a clear message.
    await userEvent.type(within(section).getByRole("textbox", { name: "Add a trade" }), "gutters");
    await userEvent.click(within(section).getByRole("button", { name: "Add" }));
    expect(await within(section).findByRole("alert")).toHaveTextContent("already on the list");
  });
});
