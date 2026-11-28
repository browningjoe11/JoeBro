import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AccountPendingScreen, AuthProvider, LoadingScreen, LoginPage, useAuth, type AuthClient } from "./core/auth";
import { Layout, type Account } from "./core/Layout";
import type { Role } from "./core/modules";
import { memorySettings, SettingsProvider, useSettings, type SettingsBackend } from "./core/settings";
import { MODULES, modulesFor } from "./modules/registry";

interface AppProps {
  /** Sign-in service. Without one the app runs in preview mode: no sign-in, pick a role to look around. */
  auth?: AuthClient | null;
  /** Starting role for preview mode. */
  initialRole?: Role;
  /** Where company settings and dropdown lists live. Preview mode keeps them in memory. */
  settings?: SettingsBackend;
}

export function App({ auth = null, initialRole = "admin", settings }: AppProps) {
  if (!auth) return <PreviewApp initialRole={initialRole} settings={settings} />;
  return (
    <AuthProvider client={auth}>
      <SignedInApp settings={settings} />
    </AuthProvider>
  );
}

/** Shows the sign-in screen until someone signs in, then the modules their role allows. */
function SignedInApp({ settings }: { settings?: SettingsBackend }) {
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
  return (
    <WithSettings backend={settings}>
      <AppRoutes role={profile.role} account={account} />
    </WithSettings>
  );
}

function PreviewApp({ initialRole, settings }: { initialRole: Role; settings?: SettingsBackend }) {
  const [role, setRole] = useState<Role>(initialRole);
  return (
    <WithSettings backend={settings}>
      <AppRoutes role={role} preview={{ role, onRoleChange: setRole }} />
    </WithSettings>
  );
}

/** Loads company settings once someone is in; without a backend (preview) they live in memory. */
function WithSettings({ backend, children }: { backend?: SettingsBackend; children: ReactNode }) {
  const [fallback] = useState(() => memorySettings().backend);
  return (
    <SettingsProvider backend={backend ?? fallback} catalog={MODULES}>
      {children}
    </SettingsProvider>
  );
}

/** Routes are generated from the module registry, filtered by role. */
function AppRoutes({ role, account, preview }: { role: Role; account?: Account; preview?: { role: Role; onRoleChange: (r: Role) => void } }) {
  const { company } = useSettings();
  const modules = useMemo(() => modulesFor(role, MODULES, new Set(company.disabledModules)), [role, company.disabledModules]);

  useEffect(() => {
    document.title = company.name;
  }, [company.name]);
  const home = modules[0] ? `/${modules[0].id}` : "/";

  return (
    <Routes>
      <Route element={<Layout modules={modules} account={account} preview={preview} company={company} />}>
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
