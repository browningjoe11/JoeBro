import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { InfoTip, Section, Sheet, TextField } from ".";
import { useTheme } from "./theme";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("Section", () => {
  it("collapses and expands", async () => {
    render(<Section title="Materials">Lumber list</Section>);
    const toggle = screen.getByRole("button", { name: "Materials" });
    expect(screen.getByText("Lumber list")).toBeVisible();
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Lumber list")).not.toBeVisible();
  });

  it("remembers its state after a reload when given a storage key", async () => {
    const { unmount } = render(<Section title="Adders" storageKey="test.adders">Permit fee</Section>);
    await userEvent.click(screen.getByRole("button", { name: "Adders" }));
    unmount();
    render(<Section title="Adders" storageKey="test.adders">Permit fee</Section>);
    expect(screen.getByRole("button", { name: "Adders" })).toHaveAttribute("aria-expanded", "false");
  });
});

describe("InfoTip", () => {
  it("shows its note on click and hides it on Escape", async () => {
    render(<InfoTip label="About hours">Total crew hours.</InfoTip>);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "About hours" }));
    expect(screen.getByRole("tooltip")).toHaveTextContent("Total crew hours.");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});

describe("TextField", () => {
  it("links its label, hint and error for screen readers", () => {
    render(<TextField label="Email" hint="Customer's email" error="Enter a full email address" />);
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Customer's email Enter a full email address");
  });
});

describe("Sheet", () => {
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>Open</button>
        <Sheet open={open} onClose={() => setOpen(false)} title="Add material">
          <input aria-label="Item" />
        </Sheet>
      </>
    );
  }

  it("opens as a dialog and closes with Escape, returning focus", async () => {
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open" });
    await userEvent.click(opener);
    expect(screen.getByRole("dialog", { name: "Add material" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});

describe("useTheme", () => {
  function Picker() {
    const [theme, setTheme] = useTheme();
    return (
      <select aria-label="Theme" value={theme} onChange={(e) => setTheme(e.target.value as "system" | "light" | "dark")}>
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    );
  }

  it("sets data-theme for light or dark and clears it for system", async () => {
    render(<Picker />);
    await userEvent.selectOptions(screen.getByLabelText("Theme"), "dark");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    await userEvent.selectOptions(screen.getByLabelText("Theme"), "system");
    expect(document.documentElement).not.toHaveAttribute("data-theme");
  });
});
