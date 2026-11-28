import { DEFAULT_COMPANY, type CompanySettings } from "../settings/types";
import { memorySignatures } from "./memorySignatures";
import { companyAddress, renderSignatureHtml, renderSignatureText, telHref, websiteHref } from "./render";
import { blankSignature, checkSignature, type EmailSignature } from "./types";

const company: CompanySettings = {
  ...DEFAULT_COMPANY,
  licenseNumber: "2026601234",
  phone: "(302) 555-0100",
  website: "joebros.com",
  street: "12 Main St",
  city: "Milford",
  state: "DE",
  zip: "19963",
};

const joe: EmailSignature = {
  ...blankSignature("u1"),
  fullName: "Joe Browning",
  title: "Owner",
  phone: "302-555-0123",
  email: "joe@joebros.com",
  tagline: "Licensed and insured",
};

const doc = (html: string) => {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el;
};

describe("signature HTML", () => {
  it("lays out name, title with company, contact links, license and closing line", () => {
    const el = doc(renderSignatureHtml(joe, company, { logoUrl: "https://cdn.example.com/logo.png" }));
    expect(el.textContent).toContain("Joe Browning");
    expect(el.textContent).toContain("Owner · Joebros Contracting Services");
    expect(el.textContent).toContain("Delaware business license #2026601234");
    expect(el.textContent).toContain("Licensed and insured");
    const hrefs = [...el.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["tel:+13025550123", "tel:+13025550100", "mailto:joe@joebros.com", "https://joebros.com/"]);
    // Address is off by default.
    expect(el.textContent).not.toContain("Milford");
  });

  it("uses only tables and inline styles, with a sized logo Outlook won't stretch", () => {
    const html = renderSignatureHtml(joe, company, { logoUrl: "https://cdn.example.com/logo.png" });
    expect(html).not.toMatch(/class=|<style|var\(--/);
    const img = doc(html).querySelector("img")!;
    expect(img.getAttribute("src")).toBe("https://cdn.example.com/logo.png");
    expect(img.getAttribute("width")).toBe("72");
    expect(img.getAttribute("height")).toBe("72");
    expect(img.getAttribute("alt")).toBe("Joebros Contracting Services");
  });

  it("leaves out the logo, office phone, website and license when switched off or missing", () => {
    const off = { ...joe, showLogo: false, showCompanyPhone: false, showWebsite: false, showLicense: false, showAddress: true };
    const el = doc(renderSignatureHtml(off, company, { logoUrl: "https://cdn.example.com/logo.png" }));
    expect(el.querySelector("img")).toBeNull();
    expect(el.textContent).not.toContain("555-0100");
    expect(el.textContent).not.toContain("joebros.com/");
    expect(el.textContent).not.toContain("license");
    expect(el.textContent).toContain("12 Main St, Milford, DE 19963");
    expect(doc(renderSignatureHtml(joe, company, { logoUrl: null })).querySelector("img")).toBeNull();
  });

  it("doesn't repeat the office phone when it's the person's own number", () => {
    const text = renderSignatureText({ ...joe, phone: "(302) 555-0100" }, company);
    expect(text.match(/555-0100/g)).toHaveLength(1);
  });

  it("escapes anything typed so it can't break the email", () => {
    const html = renderSignatureHtml({ ...joe, fullName: `<b>Joe</b> "J" & Co`, title: "<script>x</script>" }, company, { logoUrl: null });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;b&gt;Joe&lt;/b&gt; &quot;J&quot; &amp; Co");
  });

  it("applies the accent color to the bar and links", () => {
    const html = renderSignatureHtml({ ...joe, accent: "purple" }, company, { logoUrl: null });
    expect(html).toContain("border-left:3px solid #6d47b8");
    expect(html).toContain('style="color:#6d47b8;text-decoration:none;"');
  });

  it("has a plain text version with the same details", () => {
    expect(renderSignatureText(joe, company)).toBe(
      [
        "Joe Browning",
        "Owner · Joebros Contracting Services",
        "Phone: 302-555-0123",
        "Office: (302) 555-0100",
        "Email: joe@joebros.com",
        "joebros.com",
        "Delaware business license #2026601234",
        "Licensed and insured",
      ].join("\n"),
    );
  });
});

describe("signature helpers", () => {
  it("turns phone numbers and websites into links", () => {
    expect(telHref("(302) 555-0123")).toBe("tel:+13025550123");
    expect(telHref("1 302 555 0123")).toBe("tel:+13025550123");
    expect(telHref("ext 12")).toBeNull();
    expect(websiteHref("https://joebros.com/about")).toBe("https://joebros.com/about");
    expect(websiteHref("joebros")).toBeNull();
    expect(websiteHref("javascript:alert(1)")).toBeNull();
    expect(companyAddress({ ...company, street: "", zip: "" })).toBe("Milford, DE");
  });

  it("checks the name, email and closing line like the table does", () => {
    expect(checkSignature({ ...joe, fullName: " " }).fullName).toBeTruthy();
    expect(checkSignature({ ...joe, email: "joe@" }).email).toBeTruthy();
    expect(checkSignature({ ...joe, tagline: "x".repeat(141) }).tagline).toBeTruthy();
    expect(checkSignature(joe)).toEqual({});
  });

  it("memory store saves trimmed copies and refuses a blank name", async () => {
    const { backend } = memorySignatures();
    expect(await backend.get("u1")).toBeNull();
    const saved = await backend.save({ ...joe, title: "  Owner  " });
    expect(saved.title).toBe("Owner");
    expect(saved.updatedAt).toBeTruthy();
    expect((await backend.get("u1"))?.fullName).toBe("Joe Browning");
    await expect(backend.save({ ...joe, fullName: "" })).rejects.toThrow(/name/);
  });
});
