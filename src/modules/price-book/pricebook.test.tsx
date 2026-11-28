import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { App } from "../../App";
import type { Role } from "../../core/modules";
import { describePrice, findItems, memoryPriceBook, PriceBookProvider, PriceItemPicker } from "../../core/pricebook";
import { memorySettings, SettingsProvider } from "../../core/settings";
import { MODULES } from "../registry";

function renderBook(role: Role = "admin") {
  const mem = memoryPriceBook();
  render(
    <MemoryRouter initialEntries={["/price-book"]}>
      <App initialRole={role} priceBook={mem.backend} settings={memorySettings().backend} />
    </MemoryRouter>,
  );
  return mem;
}

const section = (name: string) => screen.getByRole("button", { name }).closest("section") as HTMLElement;

beforeEach(() => localStorage.clear());

describe("Price book", () => {
  it("lists every kind of item with its price", async () => {
    renderBook();
    expect(await screen.findByText("Carpenter")).toBeInTheDocument();
    expect(within(section("Labor rates")).getByText("$75.00")).toBeInTheDocument();
    expect(within(section("Materials")).getByText("Vinyl siding")).toBeInTheDocument();
    expect(within(section("Adders")).getByText("Dump trailer load")).toBeInTheDocument();
    expect(within(section("Multipliers")).getByText("×1.15")).toBeInTheDocument();
  });

  it("adds a material", async () => {
    const mem = renderBook();
    await screen.findByText("Carpenter");
    await userEvent.click(screen.getByRole("button", { name: "Add a material" }));
    const sheet = screen.getByRole("dialog", { name: "Add a material" });
    await userEvent.type(within(sheet).getByRole("textbox", { name: "Name" }), "Roofing shingles bundle");
    await userEvent.selectOptions(within(sheet).getByRole("combobox", { name: /Trade/ }), "Roofing");
    await userEvent.type(within(sheet).getByRole("textbox", { name: /Your cost/ }), "38.75");
    await userEvent.clear(within(sheet).getByRole("combobox", { name: "Unit" }));
    await userEvent.type(within(sheet).getByRole("combobox", { name: "Unit" }), "bundle");
    await userEvent.click(within(sheet).getByRole("button", { name: "Add" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(within(section("Materials")).getByText("Roofing shingles bundle")).toBeInTheDocument();
    expect(mem.items().find((i) => i.name === "Roofing shingles bundle")).toMatchObject({ price: 38.75, unit: "bundle", markupPct: 20, trade: "Roofing" });
  });

  it("keeps the name when the kind is switched while adding", async () => {
    renderBook();
    await screen.findByText("Carpenter");
    await userEvent.click(screen.getByRole("button", { name: "Add a labor rate" }));
    const sheet = screen.getByRole("dialog", { name: "Add a labor rate" });
    await userEvent.type(within(sheet).getByRole("textbox", { name: "Name" }), "Roofer");
    await userEvent.selectOptions(within(sheet).getByRole("combobox", { name: /Kind/ }), "adder");
    expect(within(sheet).getByRole("textbox", { name: "Name" })).toHaveValue("Roofer");
    expect(within(sheet).getByRole("combobox", { name: "Unit" })).toHaveValue("job");
  });

  it("explains what's missing instead of saving a bad item", async () => {
    renderBook();
    await screen.findByText("Carpenter");
    await userEvent.click(screen.getByRole("button", { name: "Add a multiplier" }));
    const sheet = screen.getByRole("dialog");
    await userEvent.click(within(sheet).getByRole("button", { name: "Add" }));
    expect(within(sheet).getByText("Give the item a name.")).toBeInTheDocument();
    expect(within(sheet).getByText(/Enter a factor/)).toBeInTheDocument();
  });

  it("edits a labor rate", async () => {
    const mem = renderBook();
    await screen.findByText("Carpenter");
    await userEvent.click(screen.getByRole("button", { name: "Edit Carpenter" }));
    const rate = within(screen.getByRole("dialog")).getByRole("textbox", { name: /Rate/ });
    await userEvent.clear(rate);
    await userEvent.type(rate, "82.50");
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(within(section("Labor rates")).getByText("$82.50")).toBeInTheDocument());
    expect(mem.items().find((i) => i.name === "Carpenter")?.price).toBe(82.5);
  });

  it("retires an item, hides it, and brings it back", async () => {
    renderBook();
    await screen.findByText("Helper");
    await userEvent.click(screen.getByRole("button", { name: "Edit Helper" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Retire" }));
    await waitFor(() => expect(screen.queryByText("Helper")).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole("checkbox", { name: "Show retired items" }));
    expect(screen.getByText("Retired")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Edit Helper" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Bring back" }));
    await waitFor(() => expect(screen.queryByText("Retired")).not.toBeInTheDocument());
  });

  it("lets sales look but not change anything, and is closed to technicians", async () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={["/price-book"]}>
        <App initialRole="sales" priceBook={memoryPriceBook().backend} />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Carpenter")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^(Add item|Add a |Edit )/ })).not.toBeInTheDocument();
    unmount();
    render(
      <MemoryRouter initialEntries={["/price-book"]}>
        <App initialRole="technician" />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "Page not available" })).toBeInTheDocument();
  });
});

describe("Price book picker", () => {
  function renderPicker(props: Partial<Parameters<typeof PriceItemPicker>[0]> = {}) {
    const mem = memoryPriceBook();
    const onPick = vi.fn();
    render(
      <SettingsProvider backend={memorySettings().backend} catalog={MODULES}>
        <PriceBookProvider backend={mem.backend}>
          <PriceItemPicker onPick={onPick} {...props} />
        </PriceBookProvider>
      </SettingsProvider>,
    );
    return { mem, onPick };
  }

  it("searches and picks an item", async () => {
    const { onPick } = renderPicker({ kind: "material" });
    const list = await screen.findByRole("list", { name: "Matching materials" });
    expect(within(list).queryByText("Carpenter")).not.toBeInTheDocument();
    await userEvent.type(screen.getByRole("searchbox"), "composite");
    expect(within(list).getAllByRole("button")).toHaveLength(1);
    await userEvent.click(within(list).getByRole("button", { name: /Composite deck board/ }));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ name: "Composite deck board 16 ft", price: 52 }));
  });

  it("never offers retired items", async () => {
    const mem = memoryPriceBook();
    await mem.backend.update("pb2", { active: false }, null);
    const items = await mem.backend.list();
    expect(findItems(items, { kind: "labor" }).map((i) => i.name)).not.toContain("Helper");
    expect(findItems(items, { kind: "labor", includeRetired: true }).map((i) => i.name)).toContain("Helper");
  });

  it("limits items to one trade plus any-trade items", async () => {
    const items = await memoryPriceBook().backend.list();
    const labor = findItems(items, { kind: "labor", trade: "Painting" }).map((i) => i.name);
    expect(labor).toEqual(["Helper", "Painter"]);
  });
});

describe("price wording", () => {
  it("describes each kind", () => {
    expect(describePrice({ kind: "labor", price: 75, unit: "hr", markupPct: null, factor: null, appliesTo: null })).toBe("$75.00 / hr");
    expect(describePrice({ kind: "material", price: 52, unit: "ea", markupPct: 20, factor: null, appliesTo: null })).toBe("$52.00 / ea + 20% markup");
    expect(describePrice({ kind: "multiplier", price: null, unit: "", markupPct: null, factor: 1.15, appliesTo: "labor" })).toBe("×1.15 on labor (+15%)");
  });
});
