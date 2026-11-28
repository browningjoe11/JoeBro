import { useRef, useState } from "react";
import { useCurrentUser } from "../../core/currentUser";
import { exampleExportJson, runImport, useImport, type ImportReport } from "../../core/import";
import { ModulePage } from "../../core/ModulePage";
import type { ModuleDefinition } from "../../core/modules";
import { Icon } from "../../core/Icon";
import { getSupabase } from "../../lib/supabase";
import { STAGE_LABELS, type Stage } from "../../core/tickets";
import { Badge, Button, DataTable, Section, type Column } from "../../ui";
import "./import.css";

const PREVIEW = !getSupabase();
const SHOW = 25;

function downloadExample() {
  const blob = new Blob([exampleExportJson()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "joebros-crm-export.example.json";
  a.click();
  URL.revokeObjectURL(url);
}

function tally(row: ImportReport["contacts"]): string {
  const parts = [`${row.create} new`];
  if (row.match) parts.push(`${row.match} matched`);
  if (row.skip) parts.push(`${row.skip} already imported`);
  if (row.invalid) parts.push(`${row.invalid} skipped`);
  return parts.join(", ");
}

function stageLine(stages: Record<Stage, number>): string {
  return (Object.entries(stages) as [Stage, number][])
    .filter(([, n]) => n > 0)
    .map(([stage, n]) => `${STAGE_LABELS[stage]} ${n}`)
    .join(", ");
}

function ImportPage() {
  const backend = useImport();
  const user = useCurrentUser();
  const fileRef = useRef<HTMLInputElement>(null);
  const [filename, setFilename] = useState("");
  const [text, setText] = useState<string | null>(null);
  const [dryRun, setDryRun] = useState(true);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(contents: string, name: string, dry: boolean) {
    setBusy(true);
    setError(null);
    try {
      setReport(await runImport(backend, contents, name, { dryRun: dry, actorId: user.id }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 5_000_000) {
      setText(null);
      setReport(null);
      setError("That file is larger than 5 MB. Split it and import the pieces.");
      return;
    }
    const contents = await file.text();
    setFilename(file.name);
    setText(contents);
    await run(contents, file.name, true);
  }

  const saved = report && !report.dryRun && !report.fileError;
  const contactColumns: Column<ImportReport["contactRows"][number]>[] = [
    { key: "name", header: "Customer", render: (r) => r.name },
    { key: "phone", header: "Phone", render: (r) => r.phone || "—" },
    { key: "email", header: "Email", render: (r) => r.email || "—" },
    {
      key: "status",
      header: "Result",
      render: (r) => (
        <Badge tone={r.status === "create" ? "good" : r.status === "match" ? "info" : "neutral"}>
          {r.status === "create" ? "New" : r.status === "match" ? "Matched" : "Already imported"}
        </Badge>
      ),
    },
    { key: "detail", header: "Detail", render: (r) => r.detail },
  ];
  const ticketColumns: Column<ImportReport["ticketRows"][number]>[] = [
    { key: "title", header: "Job", render: (r) => r.title },
    { key: "customer", header: "Customer", render: (r) => r.customer },
    { key: "stage", header: "Stage", render: (r) => STAGE_LABELS[r.stage] },
    {
      key: "status",
      header: "Result",
      render: (r) => <Badge tone={r.status === "create" ? "good" : "neutral"}>{r.status === "create" ? "New" : "Already imported"}</Badge>,
    },
  ];
  const issueColumns: Column<ImportReport["issues"][number]>[] = [
    { key: "entity", header: "Row", render: (r) => r.label },
    {
      key: "severity",
      header: "Kind",
      render: (r) => <Badge tone={r.severity === "skip" ? "bad" : "warn"}>{r.severity === "skip" ? "Skipped" : "Warning"}</Badge>,
    },
    { key: "message", header: "What happened", render: (r) => r.message },
  ];

  return (
    <ModulePage title="Import CRM data" description="Bring customers, job sites, jobs and notes over from the old Joebros CRM.">
      {PREVIEW && (
        <p className="pb-note" role="note">
          Preview mode keeps an import on this screen only. It is not added to the sample customers. Sign in as an admin to write into the database.
        </p>
      )}

      <Section
        title="The export file"
        storageKey="import.file"
        info="The old CRM is a single-page Claude artifact. Its data is not in this app until you upload an export."
      >
        <div className="stack">
          <p className="import-lead">Joseph, the file to upload is one of these:</p>
          <ol className="import-steps">
            <li>
              <strong>joebros-crm-export.json</strong> (best). A JSON file with <code>format</code> &quot;joebros-crm-export&quot;, <code>version</code> 1, a <code>contacts</code> list
              (each customer can include <code>properties</code>) and a <code>tickets</code> list (each job can include <code>notes</code>). Names like customers, jobs, and status are
              accepted too, along with a single full name or a one-line address.
            </li>
            <li>
              <strong>A CSV</strong> with a header row. One row can be one job, with the customer&apos;s name, phone, email and address repeated on that row. A <code>record_type</code>{" "}
              column of contact, property, ticket, or note also works.
            </li>
          </ol>
          <p className="import-lead">How to get it out of the old CRM:</p>
          <ol className="import-steps">
            <li>Open the Joebros CRM artifact in the same Claude account and browser where the customers were entered. The records live in that artifact&apos;s storage, or in that browser if it saved them locally. They are not in this repository.</li>
            <li>If the page has an Export, Backup, or Download button, use it and save the file. Upload that file here. JSON is the right one; a CSV is fine if that is what it downloads.</li>
            <li>If it has no export button, ask in that chat for a Download backup button that saves joebros-crm-export.json in the version 1 shape, then download it. Do this before unpublishing the artifact. Unpublishing a legacy artifact can delete what it stored.</li>
            <li>Leave Dry run checked, upload the file, and read the preview. When the counts look right, turn Dry run off and import. Uploading the same file again will not create a second copy.</li>
          </ol>
          <div className="import-file">
            <Button size="sm" icon={<Icon name="import" />} onClick={downloadExample}>
              Download example file
            </Button>
            <span className="import-filename">Fake customers only, so you can see the shape.</span>
          </div>
        </div>
      </Section>

      <Section title="Upload and preview" storageKey="import.run">
        <div className="stack">
          <div className="import-file">
            <input
              ref={fileRef}
              type="file"
              accept=".json,.csv,application/json,text/csv"
              className="visually-hidden"
              id="crm-export-file"
              aria-label="CRM export file"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
            <Button onClick={() => fileRef.current?.click()}>Choose export file</Button>
            {filename && <span className="import-filename">{filename}</span>}
          </div>
          <label className="check-row">
            <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
            <span>
              Dry run
              <small>Show what would happen and don&apos;t save anything.</small>
            </span>
          </label>
          <div className="settings-actions">
            <Button
              variant="primary"
              disabled={!text || busy}
              onClick={() => text && void run(text, filename, dryRun)}
            >
              {busy ? "Working…" : dryRun ? "Run dry run" : "Import"}
            </Button>
          </div>
          {error && (
            <p className="settings-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </Section>

      {report && (
        <div aria-live="polite">
          {report.fileError ? (
            <p className="settings-error" role="alert">
              {report.fileError}
            </p>
          ) : (
            <Section title={saved ? "Imported" : "Preview"} storageKey="import.preview" defaultOpen>
              <div className="stack">
                <p className={saved ? "settings-notice" : "import-lead"} role="status">
                  {saved
                    ? "Saved. Importing this same file again will not add a second copy."
                    : "Nothing was saved. This is a preview."}
                </p>
                <dl className="import-counts">
                  <div className="import-count">
                    <strong>{report.contacts.create + report.contacts.match}</strong>
                    <span>Customers ({tally(report.contacts)})</span>
                  </div>
                  <div className="import-count">
                    <strong>{report.properties.create}</strong>
                    <span>Properties ({tally(report.properties)})</span>
                  </div>
                  <div className="import-count">
                    <strong>{report.tickets.create}</strong>
                    <span>Jobs ({tally(report.tickets)})</span>
                  </div>
                  <div className="import-count">
                    <strong>{report.notes.create}</strong>
                    <span>Notes ({tally(report.notes)}{report.contactNotes ? `; ${report.contactNotes} on the customer` : ""})</span>
                  </div>
                </dl>
                {stageLine(report.stages) && <p className="import-stages">Jobs by stage: {stageLine(report.stages)}.</p>}
                <DataTable
                  caption="Customers in this file"
                  columns={contactColumns}
                  rows={report.contactRows.slice(0, SHOW)}
                  rowKey={(r) => r.key}
                  empty="No customers in this file."
                />
                {report.contactRows.length > SHOW && <p className="import-more">And {report.contactRows.length - SHOW} more customers.</p>}
                <DataTable
                  caption="Jobs in this file"
                  columns={ticketColumns}
                  rows={report.ticketRows.slice(0, SHOW)}
                  rowKey={(r) => r.key}
                  empty="No jobs in this file."
                />
                {report.ticketRows.length > SHOW && <p className="import-more">And {report.ticketRows.length - SHOW} more jobs.</p>}
                <DataTable
                  caption="Skipped rows and warnings"
                  columns={issueColumns}
                  rows={report.issues.slice(0, SHOW)}
                  rowKey={(r) => `${r.entity}-${r.label}-${r.message}`}
                  empty="Nothing was skipped."
                />
                {report.issues.length > SHOW && <p className="import-more">And {report.issues.length - SHOW} more notes.</p>}
              </div>
            </Section>
          )}
        </div>
      )}
    </ModulePage>
  );
}

export const importModule: ModuleDefinition = {
  id: "import",
  label: "Import",
  description: "Bring the old CRM's customers and jobs into this app.",
  icon: "import",
  group: "admin",
  order: 85,
  roles: ["admin"],
  Page: ImportPage,
};
