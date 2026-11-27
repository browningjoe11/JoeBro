import type { ReactNode } from "react";

/** Standard page frame every module uses: title, one-line description, then content. */
export function ModulePage({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return (
    <section className="page" aria-labelledby="page-title">
      <header className="page-head">
        <h1 id="page-title">{title}</h1>
        <p>{description}</p>
      </header>
      <div className="page-body">{children}</div>
    </section>
  );
}

/** Placeholder shown until a module's own chunk is built. */
export function ComingSoon({ chunk, items }: { chunk: string; items: string[] }) {
  return (
    <div className="placeholder">
      <p className="placeholder-tag">Arrives in chunk {chunk}</p>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
