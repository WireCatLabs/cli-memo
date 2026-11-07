import type { FinanceTotal, MoneySection } from "@wirecat/cli-core/services"
import { sectionLines } from "./business-text.js"

const totalLine = ({ status, currency, rows, total, open }: FinanceTotal) =>
  `  ${status}  ${total} ${currency}${open === undefined ? "" : `, ${open} open`}  (${rows})`

/** Invoices, payments and orders as stored: a stage named "Won" is not a payment, and none is inferred. */
export const moneyLines = (money: MoneySection): string[] => [
  ...sectionLines(
    "Invoices",
    money.invoices,
    (one) =>
      `  ${one.title}  ${one.ref}  ${one.status}  ${one.total} ${one.currency}, ${one.open} open  ${one.review}  ` +
      `via ${one.linkedBy.join(", ")}`,
  ),
  ...sectionLines(
    "Payments",
    money.payments,
    (one) => `  ${one.title}  ${one.ref}  ${one.amount} ${one.currency}  ${one.date}  ${one.review}`,
  ),
  ...(money.orders
    ? sectionLines(
        "Orders",
        money.orders,
        (one) => `  ${one.title}  ${one.ref}  ${one.status}  ${[one.total, one.currency].filter(Boolean).join(" ")}`,
      )
    : []),
  ...(money.totals.invoices.length ? ["Invoiced, confirmed", ...money.totals.invoices.map(totalLine)] : []),
  ...(money.totals.payments.length ? ["Paid, confirmed", ...money.totals.payments.map(totalLine)] : []),
  ...(money.unconfirmed ? [`  ${money.unconfirmed} not confirmed yet — not in the totals`] : []),
  ...(money.complete ? [] : ["  more rows than one read: the totals may leave some out"]),
]
