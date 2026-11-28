import type { CompanySettings } from "../settings/types";
import type { EmailSignature, SignatureAccent, SignatureInput } from "./types";

/*
 * Email signatures are HTML that goes into Gmail, Outlook and other mail apps.
 * Mail apps ignore stylesheets and CSS variables, so this is the one place in
 * the app with literal colors: the light-theme values of the --ev-<name> and
 * --ink/--muted tokens in src/styles/tokens.css, written inline.
 * The layout is a plain table with inline styles, which Outlook needs.
 */
export const EMAIL_ACCENTS: Record<SignatureAccent, string> = {
  teal: "#1f7a74",
  blue: "#2b64b5",
  green: "#2e7d4f",
  amber: "#a06d00",
  orange: "#c25a12",
  red: "#b3261e",
  purple: "#6d47b8",
  slate: "#56656f",
};
const INK = "#1b2826";
const MUTED = "#5d6b68";
const FONT = "Arial, Helvetica, sans-serif";

/** Logo size in the email, in pixels. Width and height are set so Outlook doesn't stretch it. */
export const EMAIL_LOGO_SIZE = 72;

type Company = Pick<CompanySettings, "name" | "licenseNumber" | "phone" | "website" | "street" | "city" | "state" | "zip">;

export interface RenderOptions {
  /** Web address of the logo (Gmail and Outlook block images stored inside the email). Null leaves the logo out. */
  logoUrl: string | null;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** "joebros.com" → "https://joebros.com"; anything that isn't a plain web address gives null. */
export function websiteHref(site: string): string | null {
  const s = site.trim();
  if (!s) return null;
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    return u.hostname.includes(".") ? u.href : null;
  } catch {
    return null;
  }
}

/** The address shown for a website: no scheme, no trailing slash. */
export const websiteLabel = (site: string) => site.trim().replace(/^https?:\/\//i, "").replace(/\/$/, "");

/** "(302) 555-0100" → "tel:+13025550100" for US numbers; other numbers keep their digits. */
export function telHref(phone: string): string | null {
  const digits = phone.replace(/[^\d+]/g, "");
  const bare = digits.replace(/\+/g, "");
  if (bare.length < 7) return null;
  if (bare.length === 10) return `tel:+1${bare}`;
  if (bare.length === 11 && bare.startsWith("1")) return `tel:+${bare}`;
  return `tel:${digits.startsWith("+") ? "+" : ""}${bare}`;
}

/** Street, then "City, ST ZIP", skipping parts that are blank. */
export function companyAddress(c: Company): string {
  const cityLine = [c.city.trim(), [c.state.trim(), c.zip.trim()].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [c.street.trim(), cityLine].filter(Boolean).join(", ");
}

interface Line {
  label?: string;
  text: string;
  href?: string | null;
}

/** The lines under the name and title, in order, for both the HTML and plain text versions. */
function detailLines(sig: SignatureInput, company: Company): Line[] {
  const lines: Line[] = [];
  if (sig.phone.trim()) lines.push({ label: "Phone", text: sig.phone.trim(), href: telHref(sig.phone) });
  if (sig.mobile.trim()) lines.push({ label: "Mobile", text: sig.mobile.trim(), href: telHref(sig.mobile) });
  const office = company.phone.trim();
  if (sig.showCompanyPhone && office && office !== sig.phone.trim() && office !== sig.mobile.trim()) {
    lines.push({ label: "Office", text: office, href: telHref(office) });
  }
  if (sig.email.trim()) lines.push({ label: "Email", text: sig.email.trim(), href: `mailto:${sig.email.trim()}` });
  if (sig.showWebsite && company.website.trim()) {
    lines.push({ text: websiteLabel(company.website), href: websiteHref(company.website) });
  }
  if (sig.showAddress) {
    const addr = companyAddress(company);
    if (addr) lines.push({ text: addr });
  }
  if (sig.showLicense && company.licenseNumber.trim()) {
    lines.push({ text: `Delaware business license #${company.licenseNumber.trim().replace(/^#/, "")}` });
  }
  return lines;
}

/** "Owner · Joebros Contracting Services", or whichever part is there. */
function titleLine(sig: SignatureInput, company: Company) {
  return [sig.title.trim(), company.name.trim()].filter(Boolean).join(" · ");
}

/**
 * The signature as email-safe HTML: a single table with inline styles, a logo
 * on the left when there is one, and an accent bar beside the details.
 */
export function renderSignatureHtml(sig: SignatureInput | EmailSignature, company: Company, opts: RenderOptions): string {
  const accent = EMAIL_ACCENTS[sig.accent] ?? EMAIL_ACCENTS.teal;
  const td = (style: string, html: string) => `<td style="${style}">${html}</td>`;
  const row = (html: string, size = 13, color = INK, extra = "") =>
    `<tr>${td(`font-family:${FONT};font-size:${size}px;line-height:${Math.round(size * 1.4)}px;color:${color};padding:0;${extra}`, html)}</tr>`;
  const link = (l: Line) =>
    l.href ? `<a href="${esc(l.href)}" style="color:${accent};text-decoration:none;">${esc(l.text)}</a>` : esc(l.text);

  const rows: string[] = [];
  rows.push(row(`<strong>${esc(sig.fullName.trim())}</strong>`, 16, INK, "font-weight:bold;"));
  const tl = titleLine(sig, company);
  if (tl) rows.push(row(esc(tl), 13, MUTED, "padding-bottom:6px;"));
  for (const l of detailLines(sig, company)) {
    const label = l.label ? `<span style="color:${MUTED};">${esc(l.label)}&nbsp;</span>` : "";
    rows.push(row(label + link(l)));
  }
  if (sig.tagline.trim()) rows.push(row(`<em>${esc(sig.tagline.trim())}</em>`, 12, MUTED, "padding-top:6px;font-style:italic;"));

  const details = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${rows.join("")}</table>`;
  const logo =
    sig.showLogo && opts.logoUrl
      ? td(
          `vertical-align:top;padding:0 12px 0 0;width:${EMAIL_LOGO_SIZE}px;`,
          `<img src="${esc(opts.logoUrl)}" width="${EMAIL_LOGO_SIZE}" height="${EMAIL_LOGO_SIZE}" alt="${esc(company.name.trim() || "Logo")}" style="display:block;width:${EMAIL_LOGO_SIZE}px;height:${EMAIL_LOGO_SIZE}px;border:0;outline:none;object-fit:contain;">`,
        )
      : "";
  const body = td(`vertical-align:top;padding:0 0 0 12px;border-left:3px solid ${accent};`, details);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr>${logo}${body}</tr></table>`;
}

/** The same signature as plain text, for emails sent without formatting. */
export function renderSignatureText(sig: SignatureInput | EmailSignature, company: Company): string {
  const out = [sig.fullName.trim()];
  const tl = titleLine(sig, company);
  if (tl) out.push(tl);
  for (const l of detailLines(sig, company)) out.push(l.label ? `${l.label}: ${l.text}` : l.text);
  if (sig.tagline.trim()) out.push(sig.tagline.trim());
  return out.join("\n");
}

/** A whole .htm file, for Outlook on Windows (its Signatures folder takes these). */
export function signatureHtmlFile(html: string, title: string): string {
  return `<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>${esc(title)}</title></head><body>${html}</body></html>\n`;
}
