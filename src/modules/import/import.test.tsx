import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { App } from "../../App";
import { exampleExportJson, memoryImport } from "../../core/import";

function renderImport(role: "admin" | "sales" = "admin", store = memoryImport()) {
  render(
    <MemoryRouter initialEntries={["/import"]}>
      <App initialRole={role} crmImport={store.backend} />
    </MemoryRouter>,
  );
  return store;
}

describe("Import screen", () => {
  it("is closed to everyone but admins", async () => {
    renderImport("sales");
    expect(await screen.findByRole("heading", { name: "Page not available" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Import" })).not.toBeInTheDocument();
  });

  it("previews the example file without saving, then imports it once", async () => {
    const store = renderImport();
    expect(await screen.findByRole("heading", { name: "Import CRM data" })).toBeInTheDocument();
    const input = screen.getByLabelText("CRM export file");
    await userEvent.upload(input, new File([exampleExportJson()], "joebros-crm-export.example.json", { type: "application/json" }));

    expect(await screen.findByText("Nothing was saved. This is a preview.")).toBeInTheDocument();
    expect(screen.getAllByText("Riley Sample").length).toBeGreaterThan(0);
    expect(screen.getByText("Stain the example deck")).toBeInTheDocument();
    expect(screen.getByText(/Jobs by stage: Estimate sent 1, Lost 1/)).toBeInTheDocument();
    expect(store.data.contacts).toHaveLength(0);

    await userEvent.click(screen.getByRole("checkbox", { name: /Dry run/ }));
    await userEvent.click(screen.getByRole("button", { name: "Import" }));
    expect(await screen.findByText(/Saved/)).toBeInTheDocument();
    expect(store.data.contacts.map((c) => c.name)).toEqual(["Riley Sample", "Sample Rentals LLC"]);
    expect(store.data.contacts.every((c) => c.importSource === "joebros-crm")).toBe(true);
    expect(store.data.tickets).toHaveLength(2);
    expect(store.data.notes).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: "Import" }));
    expect((await screen.findAllByText("Already imported")).length).toBeGreaterThan(0);
    expect(store.data.contacts).toHaveLength(2);
    expect(store.data.tickets).toHaveLength(2);
  });

  it("matches a customer who is already stored, by phone", async () => {
    const store = renderImport(
      "admin",
      memoryImport([{ id: "existing", firstName: "Riley", lastName: "Sample", phone: "302-555-0191", email: "riley.sample@example.com" }]),
    );
    const file = JSON.stringify({
      contacts: [{ id: "from-file", name: "Riley Sample", phone: "(302) 555-0191" }],
      tickets: [{ id: "job", contactId: "from-file", title: "Example follow-up", stage: "Lead" }],
    });
    await userEvent.upload(
      await screen.findByLabelText("CRM export file"),
      new File([file], "one.json", { type: "application/json" }),
    );
    expect(await screen.findByText(/Same phone as Riley Sample/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: /Dry run/ }));
    await userEvent.click(screen.getByRole("button", { name: "Import" }));
    expect(await screen.findByText(/Saved/)).toBeInTheDocument();
    expect(store.data.contacts).toHaveLength(1);
    expect(store.data.tickets).toHaveLength(1);
    expect(store.data.tickets[0].contactId).toBe("existing");
    expect(within(screen.getByRole("table", { name: "Customers in this file" })).getByText("Matched")).toBeInTheDocument();
  });
});
