import type { EventColor } from "../calendar/types";

/** Accent colors use the same palette names as crews and calendar events. */
export type SignatureAccent = EventColor;

/** One person's email signature (table email_signatures). */
export interface EmailSignature {
  /** The login (profiles.id) this signature belongs to. */
  profileId: string;
  fullName: string;
  title: string;
  /** Direct or office line for this person. */
  phone: string;
  mobile: string;
  email: string;
  /** Optional closing line, e.g. "Licensed and insured in Kent and Sussex County". */
  tagline: string;
  accent: SignatureAccent;
  showLogo: boolean;
  showCompanyPhone: boolean;
  showWebsite: boolean;
  showAddress: boolean;
  showLicense: boolean;
  updatedAt: string | null;
}

export type SignatureInput = Omit<EmailSignature, "updatedAt">;

/** Where signatures are kept. The real one talks to Supabase; tests and preview mode use memory. */
export interface SignatureBackend {
  /** The saved signature for a login, or null when they haven't made one yet. */
  get(profileId: string): Promise<EmailSignature | null>;
  save(sig: SignatureInput): Promise<EmailSignature>;
}

export const TAGLINE_MAX = 140;

/** A fresh signature for someone who hasn't saved one, filled from what the app already knows. */
export function blankSignature(profileId: string, seed: { fullName?: string; email?: string } = {}): EmailSignature {
  return {
    profileId,
    fullName: seed.fullName ?? "",
    title: "",
    phone: "",
    mobile: "",
    email: seed.email ?? "",
    tagline: "",
    accent: "teal",
    showLogo: true,
    showCompanyPhone: true,
    showWebsite: true,
    showAddress: false,
    showLicense: true,
    updatedAt: null,
  };
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Problems that stop a signature being saved, by field. Mirrors the table checks. */
export function checkSignature(sig: SignatureInput): Partial<Record<keyof SignatureInput, string>> {
  const issues: Partial<Record<keyof SignatureInput, string>> = {};
  if (!sig.fullName.trim()) issues.fullName = "Enter the name to sign with.";
  if (sig.email.trim() && !EMAIL.test(sig.email.trim())) issues.email = "That doesn't look like an email address.";
  if (sig.tagline.trim().length > TAGLINE_MAX) issues.tagline = `Keep it to ${TAGLINE_MAX} characters.`;
  return issues;
}

/** Trims text fields the way they're saved. */
export function normalizeSignature(sig: SignatureInput): SignatureInput {
  return {
    ...sig,
    fullName: sig.fullName.trim(),
    title: sig.title.trim(),
    phone: sig.phone.trim(),
    mobile: sig.mobile.trim(),
    email: sig.email.trim(),
    tagline: sig.tagline.trim(),
  };
}
