// Supabase Edge Function: invite-user (roadmap chunk F5)
//
// Lets an admin invite someone by email from Settings → Team. Sending an invite
// needs the secret (service-role) key, which must never reach the browser, so it
// happens here. Supabase gives every Edge Function its URL and keys
// automatically; nothing to configure.
//
// The secret key is used only for the invite itself. Checking the caller and
// setting the new person's role run as the caller, so the database's own
// row-level security decides (only an active admin may change roles).
//
// Body: { email, role, fullName?, redirectTo? }
// The new person gets the chosen role and is switched on right away; they can
// sign in once they click the link in the invite email. Sending again to
// someone who hasn't accepted yet re-sends the invite.
import { createClient } from "npm:@supabase/supabase-js@2";

const ROLES = ["admin", "sales", "operations", "technician", "reviewer"];
const ALLOWED_ORIGINS = [/^https:\/\/([a-z0-9-]+\.)?joebro-8dc\.pages\.dev$/, /^http:\/\/localhost(:\d+)?$/];

function cors(origin: string | null) {
  const ok = origin && ALLOWED_ORIGINS.some((re) => re.test(origin));
  return {
    "Access-Control-Allow-Origin": ok ? origin! : "https://joebro-8dc.pages.dev",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

/** Reads a key Supabase injects: the classic variable, or the first entry of the newer JSON one. */
function envKey(classic: string, json: string): string | undefined {
  const plain = Deno.env.get(classic);
  if (plain) return plain;
  try {
    const all = JSON.parse(Deno.env.get(json) ?? "{}") as Record<string, string>;
    return all.default ?? Object.values(all)[0];
  } catch {
    return undefined;
  }
}

Deno.serve(async (req) => {
  const headers = { ...cors(req.headers.get("Origin")), "Content-Type": "application/json" };
  const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply(405, { error: "Use POST." });

  const url = Deno.env.get("SUPABASE_URL")!;
  const secretKey = envKey("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEYS");
  const publicKey = envKey("SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEYS");
  if (!secretKey || !publicKey) return reply(500, { error: "The invite service isn't set up yet. Ask Claude to check it." });
  const noSession = { persistSession: false, autoRefreshToken: false };
  const admin = createClient(url, secretKey, { auth: noSession });

  // Who is asking? Must be a switched-on admin. Queries below run as them.
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return reply(401, { error: "Please sign in again." });
  const asCaller = createClient(url, publicKey, { auth: noSession, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: caller } = await asCaller.auth.getUser(token);
  if (!caller?.user) return reply(401, { error: "Please sign in again." });
  const { data: me } = await asCaller.from("profiles").select("role, active").eq("id", caller.user.id).maybeSingle();
  if (!me || me.role !== "admin" || !me.active) return reply(403, { error: "Only an admin can invite people." });

  let body: { email?: string; role?: string; fullName?: string; redirectTo?: string };
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: "Send JSON." });
  }
  const email = (body.email ?? "").trim().toLowerCase();
  const role = body.role ?? "";
  const fullName = (body.fullName ?? "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return reply(400, { error: "Enter a valid email address." });
  if (!ROLES.includes(role)) return reply(400, { error: "Pick a role." });
  let redirectTo: string | undefined;
  try {
    if (body.redirectTo && ALLOWED_ORIGINS.some((re) => re.test(new URL(body.redirectTo!).origin))) redirectTo = body.redirectTo;
  } catch {
    redirectTo = undefined;
  }

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: fullName ? { full_name: fullName } : undefined,
  });
  if (error) {
    const msg = /already been registered|already registered|exists/i.test(error.message)
      ? "That person already has an account. Change their role in the list instead."
      : /rate limit/i.test(error.message)
        ? "Supabase's free email limit was reached. Try again in an hour."
        : error.message;
    return reply(400, { error: msg });
  }

  // The sign-up trigger made a switched-off technician profile; apply the admin's choices.
  const patch: Record<string, unknown> = { role, active: true };
  if (fullName) patch.full_name = fullName;
  const { error: updateError } = await asCaller.from("profiles").update(patch).eq("id", data.user.id);
  if (updateError) return reply(500, { error: `Invite sent, but setting the role failed: ${updateError.message}` });

  return reply(200, { id: data.user.id, email });
});
