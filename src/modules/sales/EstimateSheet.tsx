import { formatDocDate, type DocRow, type EstimateDocument } from "../../core/estimate";
import { formatMoney, formatSigned } from "./format";

const itemAmount = (r: DocRow) => (r.kind === "adjust" ? formatSigned(r.amount) : r.amount === 0 ? "Included" : formatMoney(r.amount));

/**
 * The customer estimate as a page of paper. Draws only from the EstimateDocument, the same
 * model the PDF uses, so the two always say the same thing.
 */
export function EstimateSheet({ doc, logoUrl }: { doc: EstimateDocument; logoUrl: string | null }) {
  return (
    <article className="estdoc" aria-label={`Customer estimate: ${doc.title}`}>
      {doc.isDraft && (
        <p className="estdoc-draft" role="note">
          Draft preview. Save a version in the builder before sending it to the customer.
        </p>
      )}
      <header className="estdoc-head">
        <div className="estdoc-from">
          {logoUrl ? <img className="estdoc-logo" src={logoUrl} alt="" /> : <span className="brand-mark estdoc-mark" aria-hidden="true" />}
          <div>
            <p className="estdoc-company">{doc.company.name}</p>
            {doc.company.lines.map((l) => (
              <p key={l} className="estdoc-small">
                {l}
              </p>
            ))}
            {doc.company.licenseNumber && <p className="estdoc-small">DE license {doc.company.licenseNumber}</p>}
          </div>
        </div>
        <div className="estdoc-meta">
          <p className="estdoc-kind">Estimate</p>
          <dl>
            <div>
              <dt>No.</dt>
              <dd data-testid="doc-number">{doc.isDraft ? "Draft" : doc.number}</dd>
            </div>
            <div>
              <dt>Date</dt>
              <dd>{formatDocDate(doc.date)}</dd>
            </div>
            <div>
              <dt>Valid until</dt>
              <dd>{formatDocDate(doc.validUntil)}</dd>
            </div>
          </dl>
        </div>
      </header>

      <section className="estdoc-for" aria-label="Prepared for">
        <p className="estdoc-label">Prepared for</p>
        <p className="estdoc-customer">{doc.customer.name}</p>
        {doc.customer.lines.map((l) => (
          <p key={l}>{l}</p>
        ))}
      </section>

      <h2 className="estdoc-title">{doc.title}</h2>

      {doc.scope.length > 0 && (
        <section className="estdoc-scope" aria-label="Scope of work">
          <p className="estdoc-label">Scope of work</p>
          {doc.scope.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </section>
      )}

      <section className="estdoc-price" aria-label="Price">
        <p className="estdoc-label">Price</p>
        <table>
          {doc.sections.map((s) => (
            <tbody key={s.title}>
              <tr className="estdoc-sec">
                <th scope="colgroup" colSpan={3}>
                  {s.title}
                </th>
              </tr>
              {s.rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.label}</td>
                  <td className="estdoc-detail">{r.detail}</td>
                  <td className="num">{itemAmount(r)}</td>
                </tr>
              ))}
              <tr className="estdoc-sectotal">
                <td colSpan={2}>{s.title} total</td>
                <td className="num">{formatMoney(s.total)}</td>
              </tr>
            </tbody>
          ))}
          <tbody>
            {doc.totals.map((t, i) => (
              <tr key={i} className={`estdoc-t estdoc-t--${t.kind}`}>
                <td colSpan={2}>{t.label}</td>
                <td className="num">{t.kind === "adjust" ? formatSigned(t.amount) : formatMoney(t.amount)}</td>
              </tr>
            ))}
            <tr className="estdoc-total">
              <th scope="row" colSpan={2}>
                Total
              </th>
              <td className="num" data-testid="doc-total">
                {formatMoney(doc.total)}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {doc.terms.length > 0 && (
        <section className="estdoc-terms" aria-label="Terms">
          <p className="estdoc-label">Terms</p>
          {doc.terms.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </section>
      )}

      <div className="estdoc-sign" aria-hidden="true">
        <div>
          <span />
          Customer signature
        </div>
        <div>
          <span />
          Date
        </div>
      </div>
    </article>
  );
}
