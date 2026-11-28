const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** "$1,234.50" */
export const formatMoney = (n: number) => money.format(n);

/** "+$120.00" / "−$40.00" for adjustments. */
export const formatSigned = (n: number) => (n < 0 ? `−${money.format(-n)}` : `+${money.format(n)}`);

const dateTime = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
export const formatDateTime = (v: string) => (v ? dateTime.format(new Date(v)) : "");
