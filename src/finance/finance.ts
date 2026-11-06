import { CliError } from "@wirecat/cli-base"
import type { QueryRegistry } from "@wirecat/cli-base/query"
import {
  FINANCE_REVIEWS,
  INVOICE_DIRECTIONS,
  INVOICE_STATUSES,
  MONEY_DIRECTIONS,
  minorUnits,
  moneyOf,
} from "@wirecat/cli-core"
import { queryTerms, termField } from "@wirecat/cli-core/cli"
import type { FinancePayment, Invoice, MessageStore } from "@wirecat/cli-core/store"
import { pageOf } from "../page.js"
import { canonicalProject } from "../vocabulary/project.js"

export const INVOICE_QUERY = {
  entity: "invoice",
  backend: "native",
  fields: [
    termField("project", "kw", "project:PMED"),
    termField("direction", "enum", "direction:receivable", { values: INVOICE_DIRECTIONS }),
    termField("status", "enum", "status:partly_paid", { values: INVOICE_STATUSES }),
    termField("review", "enum", "review:proposed", { values: FINANCE_REVIEWS }),
    termField("counterparty", "ref", 'counterparty:"organization:3"'),
    termField("number", "kw", "number:FACT-2026-00012"),
    termField("open", "bool", "open:true"),
  ],
} as const satisfies QueryRegistry

export const PAYMENT_QUERY = {
  entity: "payment",
  backend: "native",
  fields: [
    termField("project", "kw", "project:PMED"),
    termField("direction", "enum", "direction:in", { values: MONEY_DIRECTIONS }),
    termField("review", "enum", "review:proposed", { values: FINANCE_REVIEWS }),
    termField("party", "ref", 'party:"organization:3"'),
  ],
} as const satisfies QueryRegistry

const projectTerm = async (store: MessageStore, project: string | undefined) =>
  project === undefined ? {} : { project: await canonicalProject(store, project) }

const reviewTerm = (review: string | undefined) =>
  review === undefined ? {} : { review: review as (typeof FINANCE_REVIEWS)[number] }

export const listInvoices = async (
  store: MessageStore,
  words: readonly string[] | string | undefined,
  limit?: number,
) => {
  const terms = queryTerms(words, INVOICE_QUERY, "invoices list")
  const filter = {
    ...(await projectTerm(store, terms.get("project"))),
    ...reviewTerm(terms.get("review")),
    ...(terms.has("direction") ? { direction: terms.get("direction") as Invoice["direction"] } : {}),
    ...(terms.has("status") ? { status: terms.get("status") as Invoice["status"] } : {}),
    ...(terms.has("counterparty") ? { counterparty: terms.get("counterparty") as string } : {}),
    ...(terms.has("number") ? { number: terms.get("number") as string } : {}),
    ...(terms.has("open") ? { open: terms.get("open") === "true" } : {}),
  }
  return pageOf("invoices list", limit, (most) => store.finance.invoices({ ...filter, limit: most }))
}

export const listPayments = async (
  store: MessageStore,
  words: readonly string[] | string | undefined,
  limit?: number,
) => {
  const terms = queryTerms(words, PAYMENT_QUERY, "payments list")
  const filter = {
    ...(await projectTerm(store, terms.get("project"))),
    ...reviewTerm(terms.get("review")),
    ...(terms.has("direction") ? { direction: terms.get("direction") as FinancePayment["direction"] } : {}),
    ...(terms.has("party") ? { party: terms.get("party") as string } : {}),
  }
  return pageOf("payments list", limit, (most) => store.finance.payments({ ...filter, limit: most }))
}

/** `--person 7`, `--person person:7` or `--organization organization:3`: the one party a row names. */
export const partyOf = (
  { person, organization }: { person?: string | undefined; organization?: string | undefined },
  required: boolean,
): string | undefined => {
  if (person !== undefined && organization !== undefined)
    throw new CliError("validation_error", "name one party: --person or --organization", { param: "--organization" })
  const [kind, value] = person !== undefined ? ["person", person] : ["organization", organization]
  if (value === undefined) {
    if (!required) return undefined
    throw new CliError("validation_error", "name the counterparty: --person or --organization", {
      param: "--organization",
    })
  }
  const trimmed = value.trim()
  return /^\d+$/.test(trimmed) ? `${kind}:${trimmed}` : trimmed
}

export const today = () => new Date().toLocaleDateString("sv-SE")

/** `2026-11-01` from `2026-11-01` or `2026-11-01T10:00:00+03:00`: the store keeps a payment's day. */
export const dayOf = (time: string | undefined): string | undefined => time?.trim().slice(0, 10)

interface Total {
  direction: Invoice["direction"]
  currency: string
  billed: number
  paid: number
  owed: number
  /** Confirmed payments of the project in this direction not matched to any invoice. */
  unallocated: number
  invoices: string[]
  payments: string[]
}

const DIRECTION_OF_PAYMENT = { in: "receivable", out: "payable" } as const

/**
 * What the project's confirmed books say, per direction and currency: billed, paid and still owed on its invoices,
 * and the payments behind them. Nothing is converted, and a proposed row counts for nothing until the owner confirms it.
 */
export const financeOf = async (store: MessageStore, projects: readonly string[]) => {
  const totals = new Map<string, Total>()
  const totalOf = (direction: Total["direction"], currency: string) => {
    const key = `${direction} ${currency}`
    const found = totals.get(key)
    if (found) return found
    const made: Total = { direction, currency, billed: 0, paid: 0, owed: 0, unallocated: 0, invoices: [], payments: [] }
    totals.set(key, made)
    return made
  }
  for (const project of projects) {
    for (const invoice of await store.finance.invoices({ project, review: "confirmed", limit: 500 })) {
      if (invoice.status === "void" || invoice.status === "draft") continue
      const total = totalOf(invoice.direction, invoice.currency)
      total.billed += minorUnits(invoice.total, invoice.currency)
      total.paid += minorUnits(invoice.paid, invoice.currency)
      total.owed += minorUnits(invoice.open, invoice.currency)
      total.invoices.push(invoice.ref)
    }
    for (const payment of await store.finance.payments({ project, review: "confirmed", limit: 500 })) {
      const total = totalOf(DIRECTION_OF_PAYMENT[payment.direction], payment.currency)
      total.unallocated += minorUnits(payment.unallocated, payment.currency)
      total.payments.push(payment.ref)
    }
  }
  return [...totals.values()]
    .sort((a, b) => a.direction.localeCompare(b.direction) || a.currency.localeCompare(b.currency))
    .map((total) => ({
      direction: total.direction,
      currency: total.currency,
      billed: moneyOf(total.billed, total.currency).amount,
      paid: moneyOf(total.paid, total.currency).amount,
      owed: moneyOf(total.owed, total.currency).amount,
      unallocated: moneyOf(total.unallocated, total.currency).amount,
      invoices: total.invoices,
      payments: total.payments,
    }))
}

export type FinanceBlock = Awaited<ReturnType<typeof financeOf>>

const WHO = { receivable: "billed by you", payable: "billed to you" } as const

export const financeText = (block: FinanceBlock): string[] =>
  block.length === 0
    ? []
    : [
        "books (confirmed invoices and payments):",
        ...block.map((one) => {
          const refs = [...one.invoices, ...one.payments]
          const shown = refs.slice(0, 6).join(" ") + (refs.length > 6 ? ` +${refs.length - 6}` : "")
          const loose = one.unallocated === moneyOf(0, one.currency).amount ? "" : `, ${one.unallocated} not matched`
          return (
            `  ${WHO[one.direction]} ${one.currency}: billed ${one.billed}, paid ${one.paid}, owed ${one.owed}` +
            `${loose} · ${shown}`
          )
        }),
      ]
