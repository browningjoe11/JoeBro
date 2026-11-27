import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { App } from "./App";

function renderAt(path: string, role?: Parameters<typeof App>[0]["initialRole"]) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App initialRole={role} />
    </MemoryRouter>,
  );
}

describe("app shell", () => {
  it("opens on the dashboard and lists every module for an admin", async () => {
    renderAt("/");
    expect(await screen.findByRole("heading", { level: 1, name: "Dashboard" })).toBeInTheDocument();
    const nav = screen.getByRole("navigation");
    ["Dashboard", "Contacts", "Sales", "Operations", "Onsite", "Review", "Invoicing", "Settings", "Style guide"].forEach((label) =>
      expect(within(nav).getByRole("link", { name: label })).toBeInTheDocument(),
    );
  });

  it("navigates to a module from the menu", async () => {
    renderAt("/");
    await userEvent.click(screen.getByRole("link", { name: "Sales" }));
    expect(screen.getByRole("heading", { level: 1, name: "Sales" })).toBeInTheDocument();
  });

  it("hides modules a role can't use and blocks their URLs", () => {
    renderAt("/settings", "technician");
    expect(screen.queryByRole("link", { name: "Settings" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Page not available" })).toBeInTheDocument();
  });
});
