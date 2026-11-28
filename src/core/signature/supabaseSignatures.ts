import type { SupabaseClient } from "@supabase/supabase-js";
import type { SignatureAccent } from "./types";
import { checkSignature, normalizeSignature, type EmailSignature, type SignatureBackend } from "./types";

type Row = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" ? v : "");
const orNull = (v: string) => (v.trim() ? v.trim() : null);

const COLUMNS =
  "profile_id, full_name, title, phone, mobile, email, tagline, accent, show_logo, show_company_phone, show_website, show_address, show_license, updated_at";

function fail(error: { message: string } | null): void {
  if (!error) return;
  const m = error.message;
  if (/email_signatures_name_present/.test(m)) throw new Error("Enter the name to sign with.");
  if (/email_signatures_email_shape/.test(m)) throw new Error("That doesn't look like an email address.");
  if (/email_signatures_tagline_short/.test(m)) throw new Error("The closing line is too long.");
  if (/email_signatures_accent_known/.test(m)) throw new Error("Pick a color from the palette.");
  if (/row-level security|permission denied/i.test(m)) throw new Error("You can only change your own signature.");
  throw new Error(m);
}

function toSignature(r: Row): EmailSignature {
  return {
    profileId: s(r.profile_id),
    fullName: s(r.full_name),
    title: s(r.title),
    phone: s(r.phone),
    mobile: s(r.mobile),
    email: s(r.email),
    tagline: s(r.tagline),
    accent: (s(r.accent) || "teal") as SignatureAccent,
    showLogo: !!r.show_logo,
    showCompanyPhone: !!r.show_company_phone,
    showWebsite: !!r.show_website,
    showAddress: !!r.show_address,
    showLicense: !!r.show_license,
    updatedAt: (r.updated_at as string | null) ?? null,
  };
}

export function supabaseSignatures(sb: SupabaseClient): SignatureBackend {
  return {
    async get(profileId) {
      const { data, error } = await sb.from("email_signatures").select(COLUMNS).eq("profile_id", profileId).maybeSingle();
      fail(error);
      return data ? toSignature(data as Row) : null;
    },
    async save(input) {
      const first = Object.values(checkSignature(input))[0];
      if (first) throw new Error(first);
      const sig = normalizeSignature(input);
      const { data, error } = await sb
        .from("email_signatures")
        .upsert(
          {
            profile_id: sig.profileId,
            full_name: sig.fullName,
            title: orNull(sig.title),
            phone: orNull(sig.phone),
            mobile: orNull(sig.mobile),
            email: orNull(sig.email),
            tagline: orNull(sig.tagline),
            accent: sig.accent,
            show_logo: sig.showLogo,
            show_company_phone: sig.showCompanyPhone,
            show_website: sig.showWebsite,
            show_address: sig.showAddress,
            show_license: sig.showLicense,
          },
          { onConflict: "profile_id" },
        )
        .select(COLUMNS)
        .single();
      fail(error);
      return toSignature(data as Row);
    },
  };
}
