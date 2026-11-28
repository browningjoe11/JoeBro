import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { App } from "../../App";
import { memoryEstimates } from "../../core/estimate";
import type { Role } from "../../core/modules";
import { memoryPriceBook } from "../../core/pricebook";
import { memorySettings } from "../../core/settings";
import { memoryTickets } from "../../core/tickets";

function renderApp(path: string, role: Role = "sales") {
  const tickets = memoryTickets();
  const estimates = memoryEstimates({ onVersion: (ticketId, total) => tickets.backend.update(ticketId, { estimatedValue: total }) });
  const settings = memorySettings({ company: { phone: "302-555-0100", licenseNumber: "2026-123456" } });
  render(
    <MemoryRouter initialEntries={[path]}>
      <App initialRole={role} tickets={tickets.backend} estimates={estimates.backend} priceBook={memoryPriceBook().backend} settings={settings.backend} />
    </MemoryRouter>,
  );
  return { estimates };
}

const doc = () => screen.getByRole("article", { name: /Customer estimate/ });

beforeEach(() => localStorage.clear());

describe("Customer estimate document", () => {
  it("shows a saved version to the customer at exactly the builder's total", async () => {
    renderApp("/sales/estimates/est-sample-1");
    const builderTotal = (await screen.findByTestId("estimate-total")).textContent;
    await userEvent.click(screen.getByRole("button", { name: "Save version 1" }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Save version 1" })).getByRole("button", { name: "Save version 1" }));
    await userEvent.click(await screen.findByRole("link", { name: "Customer estimate for version 1" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Customer estimate: Deck rebuild" })).toBeInTheDocument();
    expect(screen.getByTestId("doc-total")).toHaveTextContent(builderTotal!);
    expect(screen.getByTestId("doc-number")).toHaveTextContent("1001-1");
    const d = doc();
    expect(within(d).getByText("Tear out the old deck and build a new 12×16 ft composite deck on a pressure-treated frame.")).toBeInTheDocument();
    expect(within(d).getByText("DE license 2026-123456")).toBeInTheDocument();
    expect(within(d).getByLabelText("Terms")).toHaveTextContent(/Anything not listed is not included/);
    // Summary by part: no line names, no cost or markup.
    expect(within(d).getByText("Materials")).toBeInTheDocument();
    expect(within(d).queryByText("Carpenter")).not.toBeInTheDocument();
    expect(d.textContent).not.toMatch(/markup|cost/i);
  });

  it("itemizes every line on request, and the total still matches", async () => {
    renderApp("/sales/estimates/est-sample-1/document?detail=itemized");
    const d = await screen.findByRole("article", { name: /Customer estimate/ });
    expect(within(d).getByText("Carpenter")).toBeInTheDocument();
    expect(within(d).getByText("32 hr")).toBeInTheDocument();
    expect(within(d).getByText("Composite deck board 16 ft")).toBeInTheDocument();
    expect(within(d).getByText("Labor total")).toBeInTheDocument();
    // No version saved yet, so this is the draft, and it says so.
    expect(within(d).getByRole("note")).toHaveTextContent(/Draft preview/);
    expect(screen.getByTestId("doc-number")).toHaveTextContent("Draft");

    await userEvent.selectOptions(screen.getByRole("combobox", { name: /Show the customer/ }), "summary");
    expect(within(doc()).queryByText("Carpenter")).not.toBeInTheDocument();
  });

  it("previews the draft from the builder, with unsaved edits", async () => {
    renderApp("/sales/estimates/est-sample-1");
    const name = await screen.findByRole("textbox", { name: /Estimate name/ });
    await userEvent.clear(name);
    await userEvent.type(name, "Deck rebuild, option B");
    const builderTotal = screen.getByTestId("estimate-total").textContent;
    await userEvent.click(screen.getByRole("button", { name: "Preview customer estimate" }));
    expect(await screen.findByRole("heading", { level: 2, name: "Deck rebuild, option B" })).toBeInTheDocument();
    expect(screen.getByTestId("doc-total")).toHaveTextContent(builderTotal!);
    expect(within(doc()).getByRole("note")).toHaveTextContent(/Draft preview/);
  });

  it("downloads the estimate as a PDF file", async () => {
    const created: Blob[] = [];
    const createObjectURL = vi.fn((b: Blob) => (created.push(b), "blob:estimate"));
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe("Deck rebuild - Estimate draft.pdf");
    });
    renderApp("/sales/estimates/est-sample-1/document");
    await userEvent.click(await screen.findByRole("button", { name: "Download PDF" }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(created[0].type).toBe("application/pdf");
    click.mockRestore();
  });

  it("says when the estimate doesn't exist", async () => {
    renderApp("/sales/estimates/nope/document");
    expect(await screen.findByRole("heading", { name: "Estimate not found" })).toBeInTheDocument();
  });
});
