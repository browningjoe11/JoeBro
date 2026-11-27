import { useState, type FormEvent, type ReactNode } from "react";
import { Button, TextField } from "../../ui";
import { useAuth } from "./AuthProvider";

function AuthFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="auth-screen" id="main">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">
            Joebros<small>Contracting Services</small>
          </span>
        </div>
        <h1>{title}</h1>
        {children}
      </div>
    </main>
  );
}

export function LoadingScreen() {
  return (
    <main className="auth-screen" id="main" aria-busy="true">
      <p className="auth-loading">Loading…</p>
    </main>
  );
}

type Mode = "password" | "link";

export function LoginPage() {
  const { signInWithPassword, sendSignInLink } = useAuth();
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkSentTo, setLinkSentTo] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const addr = email.trim();
    if (!addr) return setError("Enter your email address.");
    if (mode === "password" && !password) return setError("Enter your password.");
    setBusy(true);
    setError(null);
    const err = mode === "password" ? await signInWithPassword(addr, password) : await sendSignInLink(addr);
    setBusy(false);
    if (err) setError(err);
    else if (mode === "link") setLinkSentTo(addr);
  }

  if (linkSentTo) {
    return (
      <AuthFrame title="Check your email">
        <p className="auth-text">
          We sent a sign-in link to <strong>{linkSentTo}</strong>. Open it on this device to finish signing in. It can take a minute
          to arrive.
        </p>
        <Button variant="ghost" onClick={() => setLinkSentTo(null)}>
          Back to sign in
        </Button>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame title="Sign in">
      <form className="auth-form" onSubmit={submit} noValidate>
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoFocus
        />
        {mode === "password" && (
          <TextField
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" size="lg" disabled={busy}>
          {busy ? "One moment…" : mode === "password" ? "Sign in" : "Email me a sign-in link"}
        </Button>
      </form>
      <p className="auth-switch">
        {mode === "password" ? (
          <>
            Forgot your password, or don't have one?{" "}
            <button type="button" className="link-btn" onClick={() => (setMode("link"), setError(null))}>
              Get an email link instead
            </button>
          </>
        ) : (
          <button type="button" className="link-btn" onClick={() => (setMode("password"), setError(null))}>
            Sign in with a password
          </button>
        )}
      </p>
    </AuthFrame>
  );
}

/** Signed in, but there's no active profile yet (new account waiting for an admin), or it failed to load. */
export function AccountPendingScreen() {
  const { session, profile, profileError, signOut, retryProfile } = useAuth();
  const failed = !!profileError;
  return (
    <AuthFrame title={failed ? "Couldn't load your account" : "Waiting for approval"}>
      <p className="auth-text">
        {failed ? (
          <>Something went wrong loading your account ({profileError}). Check your connection and try again.</>
        ) : (
          <>
            You're signed in as <strong>{profile?.email ?? session?.email}</strong>, but your account isn't switched on yet. Ask an
            admin to turn it on and give you a role, then reload this page.
          </>
        )}
      </p>
      <div className="auth-actions">
        <Button variant="primary" onClick={retryProfile}>
          Try again
        </Button>
        <Button variant="ghost" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    </AuthFrame>
  );
}
