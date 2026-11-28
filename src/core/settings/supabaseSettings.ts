import type { SupabaseClient } from "@supabase/supabase-js";
import type { Role } from "../modules";
import type { CompanySettings, ListItem, ListName, SettingsBackend, TeamMember } from "./types";

const s = (v: unknown) => (typeof v === "string" ? v : "");
const orNull = (v: string) => (v.trim() ? v.trim() : null);

/** Turns database errors into wording people can act on. */
function fail(error: { message: string; code?: string } | null): void {
  if (!error) return;
  if (/option_lists_unique_label|duplicate key/i.test(error.message)) throw new Error("That choice is already on the list.");
  if (/at least one active admin/i.test(error.message)) throw new Error("Keep at least one active admin.");
  if (/logo_size/i.test(error.message)) throw new Error("That logo is too large. Try a smaller image.");
  throw new Error(error.message);
}

/** Short stable fingerprint of a string (FNV-1a), used to name uploaded logos. */
function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function supabaseSettings(sb: SupabaseClient): SettingsBackend {
  return {
    async loadCompany() {
      const { data, error } = await sb.from("company_settings").select("*").maybeSingle();
      fail(error);
      if (!data) throw new Error("Company settings are missing.");
      return {
        name: s(data.name),
        licenseNumber: s(data.license_number),
        phone: s(data.phone),
        email: s(data.email),
        website: s(data.website),
        street: s(data.street),
        city: s(data.city),
        state: s(data.state) || "DE",
        zip: s(data.zip),
        logoDataUrl: data.logo_data_url ?? null,
        emailLogoUrl: data.email_logo_url ?? null,
        disabledModules: data.disabled_modules ?? [],
      } satisfies CompanySettings;
    },
    async saveCompany(c) {
      const { error } = await sb
        .from("company_settings")
        .update({
          name: c.name.trim(),
          license_number: orNull(c.licenseNumber),
          phone: orNull(c.phone),
          email: orNull(c.email),
          website: orNull(c.website),
          street: orNull(c.street),
          city: orNull(c.city),
          state: c.state.trim() || "DE",
          zip: orNull(c.zip),
          logo_data_url: c.logoDataUrl,
          email_logo_url: c.logoDataUrl ? c.emailLogoUrl : null,
          disabled_modules: c.disabledModules,
        })
        .eq("id", true);
      fail(error);
    },
    async loadLists() {
      const { data, error } = await sb.from("option_lists").select("id, list, label, sort, active").order("sort").order("label");
      fail(error);
      return (data ?? []) as ListItem[];
    },
    async addListItem(list: ListName, label: string, sort: number) {
      const { error } = await sb.from("option_lists").insert({ list, label: label.trim(), sort });
      fail(error);
    },
    async updateListItem(id, patch) {
      const { error } = await sb.from("option_lists").update(patch).eq("id", id);
      fail(error);
    },
    async deleteListItem(id) {
      const { error } = await sb.from("option_lists").delete().eq("id", id);
      fail(error);
    },
    async loadTeam() {
      const { data, error } = await sb.rpc("admin_team_list");
      fail(error);
      return ((data ?? []) as Record<string, unknown>[]).map(
        (r): TeamMember => ({
          id: r.id as string,
          email: (r.email as string | null) ?? null,
          fullName: s(r.full_name),
          role: r.role as Role,
          active: !!r.active,
          pending: !!r.invited_at && !r.confirmed_at,
          lastSignInAt: (r.last_sign_in_at as string | null) ?? null,
        }),
      );
    },
    async updateMember(id, patch) {
      const row: Record<string, unknown> = {};
      if (patch.fullName !== undefined) row.full_name = patch.fullName.trim();
      if (patch.role !== undefined) row.role = patch.role;
      if (patch.active !== undefined) row.active = patch.active;
      const { error } = await sb.from("profiles").update(row).eq("id", id);
      fail(error);
    },
    async publishLogo(dataUrl) {
      const match = /^data:(image\/(png|jpeg));base64,(.+)$/.exec(dataUrl);
      if (!match) throw new Error("Upload the logo again as a PNG or JPG so emails can show it.");
      const bytes = Uint8Array.from(atob(match[3]), (ch) => ch.charCodeAt(0));
      // A new name for each logo, so mail apps that cached the old one pick up the change.
      const path = `logo-${fingerprint(dataUrl)}.${match[2] === "jpeg" ? "jpg" : "png"}`;
      const { error } = await sb.storage
        .from("branding")
        .upload(path, new Blob([bytes], { type: match[1] }), { upsert: true, contentType: match[1], cacheControl: "31536000" });
      if (error) throw new Error(`Couldn't publish the logo for emails: ${error.message}`);
      return sb.storage.from("branding").getPublicUrl(path).data.publicUrl;
    },
    async invite(invite) {
      const { data, error } = await sb.functions.invoke("invite-user", {
        body: { ...invite, redirectTo: window.location.origin },
      });
      if (error) {
        // The function answers with { error: "..." }; surface that text when there is one.
        const context = (error as { context?: Response }).context;
        let message = error.message;
        try {
          const body = context ? await context.json() : null;
          if (body?.error) message = body.error;
        } catch {
          /* keep the generic message */
        }
        if (/Failed to send a request|FunctionsFetchError/i.test(message)) {
          message = "The invite service isn't set up yet. Ask Claude to deploy it.";
        }
        throw new Error(message);
      }
      if (data?.error) throw new Error(data.error);
    },
  };
}
