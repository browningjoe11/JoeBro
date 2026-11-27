import type { ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: string;
  /** Right-align and use tabular digits (money, hours, quantities). */
  numeric?: boolean;
  render: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption?: string;
  /** Shown when there are no rows. */
  empty?: ReactNode;
  /** Optional totals row. */
  footer?: ReactNode;
}

/** Plain, readable table. Scrolls sideways inside its own box on narrow screens. */
export function DataTable<T>({ columns, rows, rowKey, caption, empty = "Nothing here yet.", footer }: DataTableProps<T>) {
  return (
    <div className="table-wrap">
      <table className="table">
        {caption && <caption>{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={c.numeric ? "num" : undefined}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="table-empty">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((c) => (
                  <td key={c.key} className={c.numeric ? "num" : undefined}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
        {footer && <tfoot>{footer}</tfoot>}
      </table>
    </div>
  );
}
