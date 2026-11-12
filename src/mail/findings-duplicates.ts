import type { MailFinding, MailFindingsInput } from "@wirecat/cli-core/mail"
import type { MessageStore } from "@wirecat/cli-core/store"

export const DUPLICATE_REASON = "findings.duplicate"

export interface Duplicate {
  finding: string
  kind: string
  duplicateOf: string
  reason: typeof DUPLICATE_REASON
}

const PAGE = 50
const NEWEST = 500

const fold = (text: string): string =>
  text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()

const amount = (value: string): string => {
  const plain = value.replace(/\s/g, "").replace(",", ".")
  return plain.includes(".") ? plain.replace(/0+$/, "").replace(/\.$/, "") : plain
}

const link = (url: string): string => url.trim().replace(/#.*$/, "").replace(/\/+$/, "").toLowerCase()

/** Party keys of a stored or proposed side: the reference and the folded name, so either spelling finds the other. */
const party = (reference: string | null | undefined, name: string | null | undefined): string[] => [
  ...(reference ? [reference] : []),
  ...(name && fold(name) ? [`name:${fold(name)}`] : []),
]

/** A dry run reads the batch unvalidated, so any field may be missing or not text; such a finding has no key. */
const text = (value: unknown): string | undefined => (typeof value === "string" && value.trim() ? value : undefined)

const present = <T>(parts: (T | undefined)[]): T[] => parts.filter((part): part is T => part !== undefined)

/** The keys a finding is the same record under; two findings sharing one key describe one thing. */
const keysOf = (finding: MailFinding): string[] => {
  const raw = (finding ?? {}) as unknown as Record<string, unknown>
  const [shop, number, url, id] = [raw.supplierName, raw.number, raw.sourceUrl, raw.externalId].map(text)
  switch (raw.kind) {
    case "order":
      return present([shop && number && `order:${fold(shop)}/${fold(number)}`, url && `url:${link(url)}`])
    case "invoice": {
      const [reference, name] = [raw.counterparty, raw.counterpartyName].map(text)
      return number ? party(reference, name).map((side) => `invoice:${side}/${fold(number)}`) : []
    }
    case "payment": {
      const [direction, sum, currency, date] = [raw.direction, raw.amount, raw.currency, raw.date].map(text)
      if (!direction || !sum || !currency || !date) return []
      const [payer, payerName, payee, payeeName] = [raw.payer, raw.payerName, raw.payee, raw.payeeName].map(text)
      return [...party(payer, payerName), ...party(payee, payeeName)].map(
        (side) => `payment:${direction}/${amount(sum)}/${currency.toUpperCase()}/${date}/${side}`,
      )
    }
    case "task":
      return present([id && `task-id:${id.toLowerCase()}`, url && `url:${link(url)}`])
    case "fact": {
      const statement = text(raw.statement)
      return statement ? [`fact:${fold(statement)}/${text(raw.subject) ?? ""}`] : []
    }
    default:
      return []
  }
}

type Seen = Map<string, string>

const remember = (seen: Seen, keys: string[], ref: string) => {
  for (const key of keys) if (!seen.has(key)) seen.set(key, ref)
}

const CHECKED = new Set(["order", "invoice", "payment", "task", "fact"])

/** What the store already holds or has waiting, as key → the reference that holds it; only the kinds the batch has. */
const known = async (store: MessageStore, kinds: Set<string>): Promise<Seen> => {
  const seen: Seen = new Map()
  const live = <T extends { review: string }>(rows: T[]) => rows.filter((row) => row.review !== "rejected")
  const tasks: Promise<void>[] = []
  if (kinds.has("order"))
    tasks.push(
      store.orders.list({ limit: NEWEST }).then(({ items: orders }) => {
        for (const one of live(orders))
          remember(
            seen,
            [
              ...(one.number ? [`order:${fold(one.supplierName)}/${fold(one.number)}`] : []),
              ...(one.sourceUrl ? [`url:${link(one.sourceUrl)}`] : []),
            ],
            one.ref,
          )
      }),
    )
  if (kinds.has("invoice"))
    tasks.push(
      store.finance.invoices({ limit: NEWEST }).then(({ items: invoices }) => {
        for (const one of live(invoices))
          if (one.number)
            remember(
              seen,
              party(one.counterparty.ref, one.counterparty.name).map(
                (side) => `invoice:${side}/${fold(one.number as string)}`,
              ),
              one.ref,
            )
      }),
    )
  if (kinds.has("payment"))
    tasks.push(
      store.finance.payments({ limit: NEWEST }).then(({ items: payments }) => {
        for (const one of live(payments)) {
          const sides = [one.payer, one.payee].filter((side) => side && !side.owner)
          remember(
            seen,
            sides
              .flatMap((side) => party(side?.ref, side?.name))
              .map(
                (side) =>
                  `payment:${one.direction}/${amount(one.amount)}/${one.currency.toUpperCase()}/${one.date}/${side}`,
              ),
            one.ref,
          )
        }
      }),
    )
  if (kinds.has("task"))
    tasks.push(
      store.tasks.find({ limit: NEWEST }).then(({ items: found }) => {
        for (const one of found)
          remember(
            seen,
            [
              ...(one.externalId ? [`task-id:${one.externalId.toLowerCase()}`] : []),
              ...(one.sourceUrl ? [`url:${link(one.sourceUrl)}`] : []),
            ],
            one.ref,
          )
      }),
    )
  if (kinds.has("fact"))
    tasks.push(
      store.facts.list({ limit: NEWEST, order: "created" }).then(({ items: facts }) => {
        for (const one of facts)
          if (one.status === "proposed" || one.status === "accepted")
            remember(seen, [`fact:${fold(one.statement)}/${one.subject ?? ""}`], one.ref)
      }),
    )
  await Promise.all(tasks)
  return seen
}

/**
 * Every proposed batch's findings, newest batch first, so the nearest holder of a thing is the one named. The batch
 * staged under `key` is this run's own and holds nothing against it.
 */
const waiting = async (store: MessageStore, seen: Seen, key: string, own: Set<string>): Promise<void> => {
  for (let offset = 0; ; offset += PAGE) {
    const { items, hasMore } = await store.mailFindings.list({ status: "proposed", limit: PAGE, offset })
    for (const batch of items) {
      if (batch.input.key === key) for (const finding of batch.input.findings) own.add(finding.id)
      else for (const finding of batch.input.findings) remember(seen, keysOf(finding), `${batch.id}/${finding.id}`)
    }
    if (!hasMore) return
  }
}

/** The findings of a batch already staged or decided under this key: a rerun of the run must not lose them. */
const ownFindings = async (store: MessageStore, key: string): Promise<Set<string>> => {
  const { items } = await store.mailFindings.list({ limit: PAGE })
  const held = items.find((batch) => batch.input.key === key)
  return new Set(held?.input.findings.map((finding) => finding.id))
}

/**
 * Splits a batch into the findings worth staging and the duplicates: a finding whose order, invoice, payment, task or
 * fact is stored, waits in a proposed batch, or came earlier in this batch. A finding the batch already staged under
 * this key stays, so a rerun gets the same batch back.
 */
export const withoutDuplicates = async (
  store: MessageStore,
  input: MailFindingsInput,
): Promise<{ input: MailFindingsInput; duplicates: Duplicate[] }> => {
  if (!Array.isArray(input.findings)) return { input, duplicates: [] }
  const kinds = new Set(input.findings.map((finding) => finding?.kind))
  if (![...kinds].some((kind) => CHECKED.has(kind))) return { input, duplicates: [] }
  const own = await ownFindings(store, input.key)
  const seen = await known(store, kinds)
  await waiting(store, seen, input.key, own)

  const kept: MailFinding[] = []
  const duplicates: Duplicate[] = []
  for (const finding of input.findings) {
    if (!finding || typeof finding !== "object") {
      kept.push(finding)
      continue
    }
    const keys = keysOf(finding)
    const held = own.has(finding.id) ? undefined : keys.map((key) => seen.get(key)).find((ref) => ref !== undefined)
    if (held) duplicates.push({ finding: finding.id, kind: finding.kind, duplicateOf: held, reason: DUPLICATE_REASON })
    else {
      kept.push(finding)
      remember(seen, keys, `finding:${finding.id}`)
    }
  }
  return { input: { ...input, findings: kept }, duplicates }
}
