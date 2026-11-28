import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { App } from "../../App";
import type { Role } from "../../core/modules";
import { memorySettings } from "../../core/settings";
import { memorySignatures } from "../../core/signature";

function renderApp(role: Role = "admin", company = {}) {
  const sigs = memorySignatures();
  const settings = memorySettings({ company: { phone: "(302) 555-0100", website: "joebros.com", licenseNumber: "2026601234", ...company } });
  render(
    <MemoryRouter initialEntries={["/signature"]}>
      <App initialRole={role} settings={settings.backend} signatures={sigs.backend} />
    </MemoryRouter>,
  );
  return sigs;
}

const preview = () => screen.getByLabelText("Signature preview");

beforeEach(() => localStorage.clear());

describe("Email signature builder", () => {
  it("builds a signature with a live preview and saves it", async () => {
    const sigs = renderApp();
    const name = await screen.findByRole("textbox", { name: "Name" });
    await userEvent.clear(name);
    await userEvent.type(name, "Joe Browning");
    await userEvent.type(screen.getByRole("textbox", { name: "Job title" }), "Owner");
    await userEvent.type(screen.getByRole("textbox", { name: "Phone" }), "302-555-0123");
    await userEvent.type(screen.getByRole("textbox", { name: "Email" }), "joe@joebros.com");

    // The preview follows every keystroke, with company details from Settings.
    expect(preview()).toHaveTextContent("Joe Browning");
    expect(preview()).toHaveTextContent("Owner · Joebros Contracting Services");
    expect(preview()).toHaveTextContent("Delaware business license #2026601234");
    expect(within(preview()).getByRole("link", { name: "joe@joebros.com" })).toHaveAttribute("href", "mailto:joe@joebros.com");

    await userEvent.click(screen.getByRole("checkbox", { name: /Delaware license number/ }));
    expect(preview()).not.toHaveTextContent("license");
    await userEvent.click(screen.getByRole("radio", { name: /Purple/ }));

    await userEvent.click(screen.getByRole("button", { name: "Save signature" }));
    expect(await screen.findByText(/Signature saved/)).toBeInTheDocument();
    expect(sigs.store.get("preview")).toMatchObject({
      fullName: "Joe Browning",
      title: "Owner",
      email: "joe@joebros.com",
      showLicense: false,
      accent: "purple",
    });
    expect(screen.getByRole("button", { name: "Save signature" })).toBeDisabled();
  });

  it("won't save without a name or with a bad email", async () => {
    const sigs = renderApp("sales");
    const name = await screen.findByRole("textbox", { name: "Name" });
    await userEvent.clear(name);
    await userEvent.type(screen.getByRole("textbox", { name: "Email" }), "joe@");
    await userEvent.click(screen.getByRole("button", { name: "Save signature" }));
    expect(await screen.findByText("Enter the name to sign with.", { selector: ".field-error" })).toBeInTheDocument();
    expect(screen.getByText("That doesn't look like an email address.")).toBeInTheDocument();
    expect(sigs.store.size).toBe(0);
  });

  it("says when a company detail isn't filled in yet", async () => {
    renderApp("operations", { website: "", licenseNumber: "" });
    await screen.findByRole("textbox", { name: "Name" });
    const website = screen.getByRole("checkbox", { name: /Website/ }).closest("label")!;
    expect(website).toHaveTextContent("Not in the company profile yet");
    expect(screen.getByRole("checkbox", { name: /Company logo/ }).closest("label")).toHaveTextContent("Not in the company profile yet");
  });

  it("copies the signature as formatted text for Gmail and Outlook", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const items: Record<string, Blob>[] = [];
    vi.stubGlobal(
      "ClipboardItem",
      class {
        constructor(data: Record<string, Blob>) {
          items.push(data);
        }
      },
    );
    Object.defineProperty(navigator, "clipboard", { value: { write }, configurable: true });
    renderApp();
    const name = await screen.findByRole("textbox", { name: "Name" });
    await userEvent.clear(name);
    await userEvent.type(name, "Joe Browning");
    await userEvent.click(screen.getByRole("button", { name: "Copy signature" }));
    await waitFor(() => expect(write).toHaveBeenCalled());
    expect(Object.keys(items[0])).toEqual(["text/html", "text/plain"]);
    expect(await items[0]["text/html"].text()).toContain("<table");
    expect(await items[0]["text/plain"].text()).toMatch(/^Joe Browning\n/);
    expect(await screen.findByText(/Signature copied/)).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("lets an admin get an older logo ready for email", async () => {
    renderApp("admin", { logoDataUrl: "data:image/png;base64,AAAA", emailLogoUrl: null });
    await screen.findByRole("textbox", { name: "Name" });
    await userEvent.click(screen.getByRole("button", { name: "Get logo ready for email" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Get logo ready for email" })).not.toBeInTheDocument());
    expect(within(preview()).getByRole("img")).toHaveAttribute("src", "data:image/png;base64,AAAA");
  });

  it("is in every role's menu", async () => {
    for (const role of ["technician", "reviewer"] as Role[]) {
      const { unmount } = render(
        <MemoryRouter initialEntries={["/signature"]}>
          <App initialRole={role} />
        </MemoryRouter>,
      );
      expect(await screen.findByRole("textbox", { name: "Name" })).toBeInTheDocument();
      unmount();
    }
  });
});
