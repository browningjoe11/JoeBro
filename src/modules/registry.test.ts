import { ALL_ROLES } from "../core/modules";
import { MODULES, modulesFor } from "./registry";

describe("module registry", () => {
  it("has unique, URL-safe ids", () => {
    const ids = MODULES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(id).toMatch(/^[a-z][a-z-]*$/));
  });

  it("gives every role at least one module", () => {
    ALL_ROLES.forEach((role) => expect(modulesFor(role).length).toBeGreaterThan(0));
  });

  it("shows admins everything and technicians only their modules", () => {
    expect(modulesFor("admin")).toHaveLength(MODULES.length);
    expect(modulesFor("technician").map((m) => m.id)).toEqual(["dashboard", "calendar", "tickets", "onsite"]);
  });

  it("sorts by order and hides modules an admin turned off", () => {
    const ids = modulesFor("admin", MODULES, new Set(["sales"])).map((m) => m.id);
    expect(ids).not.toContain("sales");
    const orders = modulesFor("admin").map((m) => m.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });
});
