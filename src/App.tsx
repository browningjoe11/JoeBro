import { useMemo, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./core/Layout";
import type { Role } from "./core/modules";
import { modulesFor } from "./modules/registry";

/**
 * Routes are generated from the module registry. Until sign-in arrives
 * (chunk F4), a "Preview as" picker in the top bar stands in for the
 * signed-in user's role.
 */
export function App({ initialRole = "admin" }: { initialRole?: Role }) {
  const [role, setRole] = useState<Role>(initialRole);
  const modules = useMemo(() => modulesFor(role), [role]);
  const home = modules[0] ? `/${modules[0].id}` : "/";

  return (
    <Routes>
      <Route element={<Layout modules={modules} role={role} onRoleChange={setRole} />}>
        <Route index element={<Navigate to={home} replace />} />
        {modules.map(({ id, Page }) => (
          <Route key={id} path={`${id}/*`} element={<Page />} />
        ))}
        <Route path="*" element={<NotFound home={home} />} />
      </Route>
    </Routes>
  );
}

function NotFound({ home }: { home: string }) {
  return (
    <section className="page">
      <header className="page-head">
        <h1>Page not available</h1>
        <p>
          This page doesn't exist or your role can't open it. <a href={home}>Go to your home page</a>.
        </p>
      </header>
    </section>
  );
}
