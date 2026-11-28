/**
 * The customer estimate as a PDF (S4), drawn from the same EstimateDocument as the web page.
 *
 * Text is real PDF text (searchable, sharp when printed, small files). jsPDF is loaded only
 * when someone asks for a PDF, so it doesn't slow down the rest of the app.
 *
 * Colors here are literal on purpose: a PDF can't read the app's CSS tokens. They match the
 * --paper-* tokens in src/styles/tokens.css.
 */
import type { jsPDF as JsPDF } from "jspdf";
import type { EstimateDocument } from "./document";

const INK = "#1b2826";
const MUTED = "#5b6866";
const LINE = "#d5dcda";
const ACCENT = "#1f5e5b";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const fmt = (n: number) => money.format(n);
/** Plain hyphen: the PDF's built-in fonts have no true minus sign. */
const signed = (n: number) => (n < 0 ? `-${fmt(-n)}` : `+${fmt(n)}`);
const longDate = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" });
export const formatDocDate = (iso: string) => longDate.format(new Date(iso));

/**
 * The PDF's built-in fonts only know Latin-1. Swap the common typographic characters for
 * plain ones and drop anything else they can't draw.
 */
export function pdfSafe(text: string): string {
  return text
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/…/g, "...")
    .replace(/[•●]/g, "·")
    .replace(/ /g, " ")
    .replace(/[^\n -~ -ÿ]/g, "");
}

/** Logos can be SVG or WebP, which PDFs can't hold; redraw them as PNG in the browser. Null if that fails. */
export async function logoAsPng(dataUrl: string | null): Promise<{ data: string; width: number; height: number } | null> {
  if (!dataUrl || typeof document === "undefined" || typeof Image === "undefined") return null;
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("logo"));
      img.src = dataUrl;
    });
    const w = img.naturalWidth || 256;
    const h = img.naturalHeight || 256;
    const scale = Math.min(1, 512 / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { data: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height };
  } catch {
    return null;
  }
}

export interface PdfOptions {
  logo?: { data: string; width: number; height: number } | null;
}

/** Builds the PDF and resolves to its bytes as a Blob. */
export async function estimatePdf(doc: EstimateDocument, opts: PdfOptions = {}): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "letter" });
  drawEstimate(pdf, doc, opts);
  return pdf.output("blob");
}

/** Builds the PDF and saves it to the person's Downloads. */
export async function downloadEstimatePdf(doc: EstimateDocument, fileName: string, opts: PdfOptions = {}): Promise<void> {
  const blob = await estimatePdf(doc, opts);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function drawEstimate(pdf: JsPDF, doc: EstimateDocument, opts: PdfOptions = {}): void {
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const M = 48; // 2/3 in margins
  const right = W - M;
  const bottom = H - M - 18; // room for the page footer
  let y = M;

  const font = (size: number, style: "normal" | "bold" = "normal", color = INK) => {
    pdf.setFont("helvetica", style);
    pdf.setFontSize(size);
    pdf.setTextColor(color);
  };
  const rule = (at: number, color = LINE, width = 0.75) => {
    pdf.setDrawColor(color);
    pdf.setLineWidth(width);
    pdf.line(M, at, right, at);
  };
  const ensure = (needed: number) => {
    if (y + needed <= bottom) return;
    pdf.addPage();
    y = M;
  };
  const wrap = (text: string, width: number) => pdf.splitTextToSize(pdfSafe(text), width) as string[];
  const lineH = (size: number) => size * 1.35;

  // ---------- letterhead ----------
  let textLeft = M;
  if (opts.logo) {
    const box = 56;
    const r = Math.min(box / opts.logo.width, box / opts.logo.height);
    const w = opts.logo.width * r;
    const h = opts.logo.height * r;
    try {
      pdf.addImage(opts.logo.data, "PNG", M, y, w, h);
      textLeft = M + w + 14;
    } catch {
      // A logo that won't draw is left off rather than stopping the PDF.
    }
  }
  font(16, "bold");
  pdf.text(pdfSafe(doc.company.name), textLeft, y + 14);
  font(9, "normal", MUTED);
  let cy = y + 30;
  for (const l of doc.company.lines) {
    pdf.text(pdfSafe(l), textLeft, cy);
    cy += lineH(9);
  }
  if (doc.company.licenseNumber) {
    pdf.text(pdfSafe(`DE license ${doc.company.licenseNumber}`), textLeft, cy);
    cy += lineH(9);
  }

  // Title block on the right.
  font(22, "bold", ACCENT);
  pdf.text("ESTIMATE", right, y + 18, { align: "right" });
  font(9, "normal", MUTED);
  const meta = [doc.isDraft ? "Draft, not yet sent" : `No. ${doc.number}`, `Date: ${formatDocDate(doc.date)}`, `Valid until: ${formatDocDate(doc.validUntil)}`];
  meta.forEach((m, i) => pdf.text(pdfSafe(m), right, y + 34 + i * lineH(9), { align: "right" }));
  y = Math.max(cy, y + 34 + meta.length * lineH(9), y + 60) + 10;
  rule(y, ACCENT, 1.5);
  y += 18;

  // ---------- prepared for ----------
  font(8, "bold", MUTED);
  pdf.text("PREPARED FOR", M, y);
  y += 14;
  font(11, "bold");
  pdf.text(pdfSafe(doc.customer.name), M, y);
  y += lineH(11);
  font(10);
  for (const l of doc.customer.lines) {
    pdf.text(pdfSafe(l), M, y);
    y += lineH(10);
  }
  y += 10;

  // ---------- title and scope ----------
  font(15, "bold");
  for (const l of wrap(doc.title, right - M)) {
    ensure(lineH(15));
    pdf.text(l, M, y);
    y += lineH(15);
  }
  y += 4;
  if (doc.scope.length) {
    ensure(30);
    font(8, "bold", MUTED);
    pdf.text("SCOPE OF WORK", M, y);
    y += 14;
    font(10);
    for (const p of doc.scope) {
      for (const l of wrap(p, right - M)) {
        ensure(lineH(10));
        pdf.text(l, M, y);
        y += lineH(10);
      }
      y += 4;
    }
    y += 4;
  }

  // ---------- price ----------
  const amountX = right;
  const detailX = right - 110;
  const labelW = detailX - M - 70;
  const row = (label: string, detail: string, amount: string, o: { bold?: boolean; color?: string; size?: number } = {}) => {
    const size = o.size ?? 10;
    const labelLines = wrap(label, labelW);
    ensure(labelLines.length * lineH(size) + 4);
    font(size, o.bold ? "bold" : "normal", o.color ?? INK);
    labelLines.forEach((l, i) => pdf.text(l, M, y + i * lineH(size)));
    if (detail) {
      font(size, "normal", MUTED);
      pdf.text(pdfSafe(detail), detailX, y, { align: "right" });
    }
    font(size, o.bold ? "bold" : "normal", o.color ?? INK);
    pdf.text(pdfSafe(amount), amountX, y, { align: "right" });
    y += labelLines.length * lineH(size) + 2;
  };
  const itemAmount = (r: { amount: number; kind: string }) => (r.kind === "adjust" ? signed(r.amount) : r.amount === 0 ? "Included" : fmt(r.amount));

  ensure(40);
  font(8, "bold", MUTED);
  pdf.text("PRICE", M, y);
  y += 8;
  rule(y);
  y += 14;

  for (const s of doc.sections) {
    ensure(40);
    row(s.title, "", "", { bold: true, size: 10.5 });
    for (const r of s.rows) row(r.label, r.detail, itemAmount(r));
    row(`${s.title} total`, "", fmt(s.total), { color: MUTED });
    y += 2;
    rule(y - 6);
    y += 4;
  }
  for (const t of doc.totals) {
    const text = t.kind === "adjust" ? signed(t.amount) : fmt(t.amount);
    row(t.label, "", text, { bold: t.kind === "subtotal" });
  }

  ensure(40);
  y += 2;
  rule(y - 8, ACCENT, 1.25);
  y += 10;
  row("Total", "", fmt(doc.total), { bold: true, size: 14, color: ACCENT });
  y += 10;

  // ---------- terms and acceptance ----------
  // Kept together on one page with the signature lines when they fit on a page at all.
  font(9);
  const termLines = doc.terms.map((p) => wrap(p, right - M));
  const closingH = (termLines.length ? 18 + termLines.reduce((h, ls) => h + ls.length * lineH(9) + 3, 0) : 0) + 38;
  if (closingH < bottom - M) ensure(closingH);
  if (doc.terms.length) {
    ensure(40);
    font(8, "bold", MUTED);
    pdf.text("TERMS", M, y);
    y += 14;
    font(9, "normal", MUTED);
    for (const ls of termLines) {
      for (const l of ls) {
        ensure(lineH(9));
        pdf.text(l, M, y);
        y += lineH(9);
      }
      y += 3;
    }
    y += 4;
  }

  ensure(44);
  y += 22;
  const half = (right - M) / 2;
  pdf.setDrawColor(INK);
  pdf.setLineWidth(0.75);
  pdf.line(M, y, M + half - 20, y);
  pdf.line(M + half + 20, y, right, y);
  font(8, "normal", MUTED);
  pdf.text("Customer signature", M, y + 12);
  pdf.text("Date", M + half + 20, y + 12);

  // ---------- footer on every page ----------
  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    font(8, "normal", MUTED);
    const left = pdfSafe(`${doc.company.name} · ${doc.isDraft ? "Draft estimate" : `Estimate ${doc.number}`}`);
    pdf.text(left, M, H - M + 6);
    pdf.text(`Page ${i} of ${pages}`, right, H - M + 6, { align: "right" });
  }
  pdf.setProperties({ title: pdfSafe(`${doc.title} - Estimate ${doc.number || "draft"}`), author: pdfSafe(doc.company.name), creator: "Joebros app" });
}
