import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { App } from "./App";
import { fakeAuth, type FakeUser } from "./core/auth/fakeAuth";

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
    ["Dashboard", "Calendar", "Tickets", "Contacts", "Sales", "Operations", "Onsite", "Review", "Invoicing", "Settings", "Style guide"].forEach((label) =>
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

describe("sign-in", () => {
  const users: FakeUser[] = [
    { email: "joe@example.com", password: "pw-admin", role: "admin", fullName: "Joe Owner" },
    { email: "sam@example.com", password: "pw-sales", role: "sales", fullName: "Sam Sales" },
    { email: "olivia@example.com", password: "pw-ops", role: "operations" },
    { email: "tech@example.com", password: "pw-tech", role: "technician" },
    { email: "rae@example.com", password: "pw-review", role: "reviewer" },
    { email: "new@example.com", password: "pw-new", role: "technician", active: false },
  ];

  function renderSignedIn(path: string, signedInAs?: string) {
    const fake = fakeAuth(users, signedInAs);
    render(
      <MemoryRouter initialEntries={[path]}>
        <App auth={fake.client} />
      </MemoryRouter>,
    );
    return fake;
  }

  async function signIn(email: string, password: string) {
    await userEvent.type(await screen.findByLabelText("Email"), email);
    await userEvent.type(screen.getByLabelText("Password"), password);
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
  }

  it("asks for sign-in and explains a wrong password", async () => {
    renderSignedIn("/dashboard");
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    await signIn("joe@example.com", "nope");
    expect(await screen.findByRole("alert")).toHaveTextContent("don't match");
  });

  const menus: Record<string, string[]> = {
    "joe@example.com": ["Dashboard", "Calendar", "Tickets", "Contacts", "Sales", "Operations", "Onsite", "Review", "Invoicing", "Settings", "Style guide"],
    "sam@example.com": ["Dashboard", "Calendar", "Tickets", "Contacts", "Sales"],
    "olivia@example.com": ["Dashboard", "Calendar", "Tickets", "Contacts", "Operations", "Onsite"],
    "tech@example.com": ["Dashboard", "Calendar", "Tickets", "Onsite"],
    "rae@example.com": ["Dashboard", "Calendar", "Tickets", "Contacts", "Review", "Invoicing"],
  };

  it.each(Object.entries(menus))("shows %s only the modules for their role", async (email, expected) => {
    const user = users.find((u) => u.email === email)!;
    renderSignedIn("/");
    await signIn(email, user.password);
    const nav = await screen.findByRole("navigation");
    expect(within(nav).getAllByRole("link").map((a) => a.textContent)).toEqual(expected);
    expect(screen.queryByLabelText("Preview as")).not.toBeInTheDocument();
  });

  it("blocks a signed-in user from typing in another role's page", async () => {
    renderSignedIn("/invoicing", "sam@example.com");
    expect(await screen.findByRole("heading", { name: "Page not available" })).toBeInTheDocument();
  });

  it("keeps switched-off accounts waiting until an admin approves them", async () => {
    renderSignedIn("/", "new@example.com");
    expect(await screen.findByRole("heading", { name: "Waiting for approval" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("shows who is signed in and signs out from the account menu", async () => {
    renderSignedIn("/dashboard", "sam@example.com");
    await userEvent.click(await screen.findByRole("button", { name: /Account: Sam Sales, Sales/ }));
    expect(screen.getByText("sam@example.com")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("can email a sign-in link instead of using a password", async () => {
    const fake = renderSignedIn("/");
    await userEvent.click(await screen.findByRole("button", { name: "Get an email link instead" }));
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Email"), "rae@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }));
    expect(await screen.findByRole("heading", { name: "Check your email" })).toBeInTheDocument();
    expect(fake.linksSent).toEqual(["rae@example.com"]);
  });
});
