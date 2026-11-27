import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { ThemePicker, useTheme } from "../ui/theme";
import { Icon } from "./Icon";
import { GROUP_LABELS, type ModuleDefinition, type ModuleGroup, type Role } from "./modules";

const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  sales: "Sales",
  operations: "Operations",
  technician: "Technician",
  reviewer: "Reviewer",
};

interface LayoutProps {
  modules: readonly ModuleDefinition[];
  role: Role;
  onRoleChange: (role: Role) => void;
}

/**
 * App frame. On a PC the sidebar is always visible and can be narrowed to
 * icons; on phones and tablets it slides in from a menu button.
 */
export function Layout({ modules, role, onRoleChange }: LayoutProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [narrow, setNarrow] = useState(() => readNarrow());
  const location = useLocation();
  const [theme, setTheme] = useTheme();

  // Close the phone drawer after navigating.
  useEffect(() => setDrawerOpen(false), [location.pathname]);

  useEffect(() => {
    try {
      localStorage.setItem("jb.sidebarNarrow", narrow ? "1" : "0");
    } catch {
      /* storage unavailable: preference just won't persist */
    }
  }, [narrow]);

  const groups = groupModules(modules);

  return (
    <div className={`shell${narrow ? " shell--narrow" : ""}${drawerOpen ? " shell--drawer" : ""}`}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <aside className="sidebar" aria-label="Main menu">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">
            Joebros<small>Contracting Services</small>
          </span>
          <button className="icon-btn drawer-close" onClick={() => setDrawerOpen(false)} aria-label="Close menu">
            <Icon name="close" />
          </button>
        </div>

        <nav className="nav">
          {groups.map(([group, items]) => (
            <div className="nav-group" key={group}>
              <p className="nav-group-label">{GROUP_LABELS[group]}</p>
              <ul>
                {items.map((m) => (
                  <li key={m.id}>
                    <NavLink to={`/${m.id}`} className="nav-link" title={narrow ? m.label : undefined}>
                      <Icon name={m.icon} />
                      <span className="nav-label">{m.label}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <button
          className="nav-link collapse-btn"
          onClick={() => setNarrow((n) => !n)}
          aria-pressed={narrow}
          aria-label={narrow ? "Expand menu" : "Collapse menu"}
        >
          <Icon name="collapse" />
          <span className="nav-label">Collapse menu</span>
        </button>
      </aside>

      <div className="scrim" onClick={() => setDrawerOpen(false)} aria-hidden="true" />

      <div className="main-col">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setDrawerOpen(true)} aria-label="Open menu" aria-expanded={drawerOpen}>
            <Icon name="menu" />
          </button>
          <span className="topbar-title">Joebros</span>
          <div className="topbar-tools">
          <ThemePicker theme={theme} onChange={setTheme} />
          <label className="topbar-select">
            <span>Preview as</span>
            <select id="preview-role" value={role} onChange={(e) => onRoleChange(e.target.value as Role)}>
              {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
          </div>
        </header>

        <main id="main" className="content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function groupModules(modules: readonly ModuleDefinition[]): [ModuleGroup, ModuleDefinition[]][] {
  const order: ModuleGroup[] = ["overview", "workflow", "admin"];
  return order
    .map((g) => [g, modules.filter((m) => m.group === g)] as [ModuleGroup, ModuleDefinition[]])
    .filter(([, items]) => items.length > 0);
}

function readNarrow() {
  try {
    return localStorage.getItem("jb.sidebarNarrow") === "1";
  } catch {
    return false;
  }
}
