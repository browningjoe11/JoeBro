import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useCurrentUser } from "../../core/currentUser";
import { checkTitle, useEstimates } from "../../core/estimate";
import { ModulePage } from "../../core/ModulePage";
import { STAGE_LABELS, useTickets, type TicketSummary } from "../../core/tickets";
import { Button, SelectField, TextField } from "../../ui";

/** Stages where starting an estimate also moves the ticket to Estimating. */
const MOVE_FROM = new Set(["lead", "site_visit"]);

export function NewEstimate() {
  const backend = useEstimates();
  const tickets = useTickets();
  const user = useCurrentUser();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const wanted = Number(params.get("ticket")) || null;

  const [list, setList] = useState<TicketSummary[] | null>(null);
  const [ticketId, setTicketId] = useState("");
  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    tickets
      .list()
      .then((ts) => {
        const open = ts.filter((t) => t.stage !== "paid" && t.stage !== "lost");
        setList(open);
        const pre = open.find((t) => t.number === wanted);
        if (pre) {
          setTicketId(pre.id);
          setTitle(pre.title);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [tickets, wanted]);

  const ticket = useMemo(() => list?.find((t) => t.id === ticketId), [list, ticketId]);
  const titleError = tried ? (checkTitle(title) ?? undefined) : undefined;

  async function create() {
    setTried(true);
    if (!ticket || checkTitle(title)) return;
    setBusy(true);
    setError(null);
    try {
      const id = await backend.create({ ticketId: ticket.id, title }, user.id);
      if (MOVE_FROM.has(ticket.stage)) {
        // Best effort: the estimate is made even if this role can't move the ticket.
        await tickets.move(ticket.id, "estimating").catch(() => undefined);
      }
      navigate(`/sales/estimates/${id}`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <ModulePage title="New estimate" description="Pick the ticket the estimate is for. You'll add time, materials and charges next.">
      <p className="back-link">
        <Link to="/sales">← All estimates</Link>
      </p>
      <form
        className="settings-form est-new"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <SelectField
          label="Ticket"
          value={ticketId}
          error={tried && !ticket ? "Pick the ticket this estimate is for." : undefined}
          onChange={(e) => {
            setTicketId(e.target.value);
            const t = list?.find((x) => x.id === e.target.value);
            if (t && !titleTouched) setTitle(t.title);
          }}
          hint={ticket && MOVE_FROM.has(ticket.stage) ? `This ticket is at ${STAGE_LABELS[ticket.stage]}; starting the estimate moves it to Estimating.` : undefined}
        >
          <option value="">{list === null ? "Loading tickets…" : "Choose a ticket"}</option>
          {(list ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              #{t.number} {t.title} · {t.customer}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Estimate name"
          value={title}
          error={titleError}
          onChange={(e) => {
            setTitle(e.target.value);
            setTitleTouched(true);
          }}
          hint="Usually the job, like “Deck rebuild”. Make a second estimate on the same ticket for another option."
        />
        {error && (
          <p className="settings-error" role="alert">
            {error}
          </p>
        )}
        <div className="settings-actions">
          <Button type="submit" variant="primary" disabled={busy}>
            Start estimate
          </Button>
        </div>
      </form>
    </ModulePage>
  );
}
