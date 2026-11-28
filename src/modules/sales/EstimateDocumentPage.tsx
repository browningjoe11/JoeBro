import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  buildEstimateDocument,
  calculateEstimate,
  documentFileName,
  downloadEstimatePdf,
  logoAsPng,
  useEstimates,
  type DetailLevel,
  type Estimate,
  type EstimateVersion,
} from "../../core/estimate";
import { ModulePage } from "../../core/ModulePage";
import { useSettings } from "../../core/settings";
import { useTickets, type Ticket } from "../../core/tickets";
import { Button, SelectField } from "../../ui";
import { EstimateSheet } from "./EstimateSheet";
import { formatDateTime, formatMoney } from "./format";

/**
 * /sales/estimates/:id/document?version=N|draft&detail=summary|itemized
 *
 * The customer-facing estimate. Shows the latest saved version unless another version
 * (or the draft) is picked. The price is always worked out by calculateEstimate, the same
 * as in the builder.
 */
export function EstimateDocumentPage() {
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const backend = useEstimates();
  const tickets = useTickets();
  const { company } = useSettings();

  const [estimate, setEstimate] = useState<Estimate | null | undefined>(undefined);
  const [versions, setVersions] = useState<EstimateVersion[]>([]);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const e = await backend.get(id);
        if (!live) return;
        if (!e) return setEstimate(null);
        const [vs, list] = await Promise.all([backend.versions(id), tickets.list()]);
        const summary = list.find((t) => t.id === e.ticketId);
        const full = summary ? await tickets.get(summary.number) : null;
        if (!live) return;
        setVersions(vs);
        setTicket(full);
        setEstimate(e);
      } catch (err) {
        if (live) setLoadError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      live = false;
    };
  }, [backend, tickets, id]);

  const wanted = params.get("version");
  const detail: DetailLevel = params.get("detail") === "itemized" ? "itemized" : "summary";
  // No version picked: the newest saved one, or the draft when nothing is saved yet.
  const version: EstimateVersion | null = wanted === "draft" ? null : (versions.find((v) => String(v.version) === wanted) ?? (wanted ? null : (versions[0] ?? null)));
  const missingVersion = !!wanted && wanted !== "draft" && !version && versions.length > 0;

  const doc = useMemo(() => {
    if (!estimate) return null;
    const source = version ?? estimate;
    return buildEstimateDocument(
      {
        title: source.title,
        lines: source.lines,
        notes: source.notes,
        version: version ? version.version : null,
        date: version ? version.createdAt : new Date().toISOString(),
        ticket: ticket ? { number: ticket.number, customer: ticket.customer, site: ticket.site, phone: ticket.phone, email: ticket.email } : null,
        company,
        detail,
      },
      calculateEstimate(source.lines),
    );
  }, [estimate, version, ticket, company, detail]);

  function pick(next: { version?: string; detail?: DetailLevel }) {
    const p = new URLSearchParams(params);
    if (next.version !== undefined) p.set("version", next.version);
    if (next.detail !== undefined) p.set("detail", next.detail);
    setParams(p, { replace: true });
  }

  async function download() {
    if (!doc) return;
    setBusy(true);
    setPdfError(null);
    try {
      await downloadEstimatePdf(doc, documentFileName(doc), { logo: await logoAsPng(company.logoDataUrl) });
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <ModulePage title="Customer estimate" description="">
        <p className="settings-error" role="alert">
          Couldn't load the estimate: {loadError}
        </p>
      </ModulePage>
    );
  }
  if (estimate === undefined) return <ModulePage title="Customer estimate" description="Loading…" />;
  if (estimate === null || !doc) {
    return (
      <ModulePage title="Estimate not found" description="It may have been deleted, or your role can't open it.">
        <p className="back-link">
          <Link to="/sales">← All estimates</Link>
        </p>
      </ModulePage>
    );
  }

  const shownTotal = formatMoney(doc.total);
  return (
    <ModulePage title={`Customer estimate: ${doc.title}`} description={doc.isDraft ? "Preview of the current draft." : `Version ${doc.version}, as the customer sees it.`}>
      <p className="back-link estdoc-noprint">
        <Link to={`/sales/estimates/${estimate.id}`}>← Back to the builder</Link>
        {ticket && (
          <>
            {" · "}
            <Link to={`/tickets/${ticket.number}`}>Ticket #{ticket.number}</Link>
          </>
        )}
      </p>

      <div className="estdoc-toolbar estdoc-noprint">
        <SelectField label="Version" value={version ? String(version.version) : "draft"} onChange={(e) => pick({ version: e.target.value })}>
          {versions.map((v) => (
            <option key={v.id} value={String(v.version)}>
              Version {v.version} · {formatDateTime(v.createdAt)} · {formatMoney(v.total)}
            </option>
          ))}
          <option value="draft">Current draft (not saved as a version)</option>
        </SelectField>
        <SelectField
          label="Show the customer"
          value={detail}
          onChange={(e) => pick({ detail: e.target.value as DetailLevel })}
          info="The summary shows one price for labor, materials and additional items. Itemized lists every line with its quantity and price. Your cost and markup never show."
        >
          <option value="summary">Summary by part</option>
          <option value="itemized">Every line, itemized</option>
        </SelectField>
        <div className="estdoc-actions">
          <Button variant="primary" disabled={busy} onClick={() => void download()}>
            {busy ? "Making PDF…" : "Download PDF"}
          </Button>
          <Button onClick={() => window.print()}>Print</Button>
        </div>
      </div>
      {missingVersion && (
        <p className="settings-error estdoc-noprint" role="alert">
          There's no version {wanted}; showing the current draft instead.
        </p>
      )}
      {pdfError && (
        <p className="settings-error estdoc-noprint" role="alert">
          Couldn't make the PDF: {pdfError}
        </p>
      )}
      {doc.issueCount > 0 && (
        <p className="settings-error estdoc-noprint" role="alert">
          {doc.issueCount === 1 ? "1 number is" : `${doc.issueCount} numbers are`} blank or not valid, so {doc.issueCount === 1 ? "it's" : "they're"} left out of the {shownTotal} total.
          Fix {doc.issueCount === 1 ? "it" : "them"} in the builder before sending.
        </p>
      )}

      <div className="estdoc-stage">
        <EstimateSheet doc={doc} logoUrl={company.logoDataUrl} />
      </div>
    </ModulePage>
  );
}
