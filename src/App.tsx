import { useMemo, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AccountPendingScreen, AuthProvider, LoadingScreen, LoginPage, useAuth, type AuthClient } from "./core/auth";
import { Layout, type Account } from "./core/Layout";
import type { Role } from "./core/modules";
import { modulesFor } from "./modules/registry";

interface AppProps {
  /** Sign-in service. Without one the app runs in preview mode: no sign-in, pick a role to look around. */
  auth?: AuthClient | null;
  /** Starting role for preview mode. */
  initialRole?: Role;
}

export function App({ auth = null, initialRole = "admin" }: AppProps) {
  if (!auth) return <PreviewApp initialRole={initialRole} />;
  return (
    <AuthProvider client={auth}>
      <SignedInApp />
    </AuthProvider>
  );
}

/** Shows the sign-in screen until someone signs in, then the modules their role allows. */
function SignedInApp() {
  const { status, profile, session, signOut } = useAuth();
  if (status === "loading") return <LoadingScreen />;
  if (status === "signed-out") return <LoginPage />;
  if (!profile?.active) return <AccountPendingScreen />;
  const account: Account = {
    name: profile.fullName,
    email: profile.email ?? session?.email ?? null,
    role: profile.role,
    onSignOut: () => void signOut(),
  };
  return <AppRoutes role={profile.role} account={account} />;
}

function PreviewApp({ initialRole }: { initialRole: Role }) {
  const [role, setRole] = useState<Role>(initialRole);
  return <AppRoutes role={role} preview={{ role, onRoleChange: setRole }} />;
}

/** Routes are generated from the module registry, filtered by role. */
function AppRoutes({ role, account, preview }: { role: Role; account?: Account; preview?: { role: Role; onRoleChange: (r: Role) => void } }) {
  const modules = useMemo(() => modulesFor(role), [role]);
  const home = modules[0] ? `/${modules[0].id}` : "/";

  return (
    <Routes>
      <Route element={<Layout modules={modules} account={account} preview={preview} />}>
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
