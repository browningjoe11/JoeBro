import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AccountPendingScreen, AuthProvider, LoadingScreen, LoginPage, useAuth, type AuthClient } from "./core/auth";
import { Layout, type Account } from "./core/Layout";
import { CurrentUserProvider, type CurrentUser } from "./core/currentUser";
import type { Role } from "./core/modules";
import { memorySettings, SettingsProvider, useSettings, type SettingsBackend } from "./core/settings";
import { memoryTickets, TicketsProvider, type TicketsBackend } from "./core/tickets";
import { CalendarProvider, memoryCalendar, type CalendarBackend } from "./core/calendar";
import { MODULES, modulesFor } from "./modules/registry";

interface AppProps {
  /** Sign-in service. Without one the app runs in preview mode: no sign-in, pick a role to look around. */
  auth?: AuthClient | null;
  /** Starting role for preview mode. */
  initialRole?: Role;
  /** Where company settings and dropdown lists live. Preview mode keeps them in memory. */
  settings?: SettingsBackend;
  /** Where tickets live. Preview mode uses in-memory sample tickets. */
  tickets?: TicketsBackend;
  /** Where calendar bookings live. Preview mode uses in-memory sample bookings. */
  calendar?: CalendarBackend;
}

type Backends = { settings?: SettingsBackend; tickets?: TicketsBackend; calendar?: CalendarBackend };

export function App({ auth = null, initialRole = "admin", settings, tickets, calendar }: AppProps) {
  const backends = { settings, tickets, calendar };
  if (!auth) return <PreviewApp initialRole={initialRole} backends={backends} />;
  return (
    <AuthProvider client={auth}>
      <SignedInApp backends={backends} />
    </AuthProvider>
  );
}

/** Shows the sign-in screen until someone signs in, then the modules their role allows. */
function SignedInApp({ backends }: { backends: Backends }) {
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
    <WithData
      backends={backends}
      user={{
        id: profile.id,
        name: profile.fullName || account.email || "",
        role: profile.role,
      }}
    >
      <AppRoutes role={profile.role} account={account} />
    </WithData>
  );
}

function PreviewApp({ initialRole, backends }: { initialRole: Role; backends: Backends }) {
  const [role, setRole] = useState<Role>(initialRole);
  return (
    <WithData backends={backends} user={{ id: null, name: "Preview", role }}>
      <AppRoutes role={role} preview={{ role, onRoleChange: setRole }} />
    </WithData>
  );
}

/** Data the screens share once someone is in. Without real backends (preview) everything lives in memory. */
function WithData({ backends, user, children }: { backends: Backends; user: CurrentUser; children: ReactNode }) {
  const [fallback] = useState(() => ({
    settings: memorySettings().backend,
    tickets: memoryTickets().backend,
    calendar: memoryCalendar().backend,
  }));
  return (
    <CurrentUserProvider user={user}>
      <SettingsProvider backend={backends.settings ?? fallback.settings} catalog={MODULES}>
        <TicketsProvider backend={backends.tickets ?? fallback.tickets}>
          <CalendarProvider backend={backends.calendar ?? fallback.calendar}>{children}</CalendarProvider>
        </TicketsProvider>
      </SettingsProvider>
    </CurrentUserProvider>
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
