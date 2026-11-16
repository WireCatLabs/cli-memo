import { CliError } from "@wirecat/cli-base"
import { type DealKind, kindIn } from "@wirecat/cli-core"
import { type CrmViewing, crmViewerOf } from "@wirecat/cli-core/crm"
import type { AccountKey, Deal, MessageStore, Pipeline, PipelineReport } from "@wirecat/cli-core/store"

type CopyViewer = NonNullable<CrmViewing["viewer"]>
type PipelineOptions = NonNullable<Parameters<MessageStore["deals"]["pipeline"]>[1]>
type Owned = { account: AccountKey | null; assignee: string | null }

const shortened = new WeakMap<MessageStore, Set<string>>()

/** Why an answer read from this store shows less of a CRM copy than its rule gives, one line per copy. */
export const crmNotes = (store: MessageStore): string[] => [...(shortened.get(store) ?? [])]

/**
 * What memo may show of one CRM copy (SEC-197): what the user its sync signed in as reads, as cli-core's `search all`
 * reads another account's copy. A copy that limits its users and names none shows nothing; an account that is no CRM,
 * as an ERP's import, shows whole. A note on why it shows less is kept for the answer (`crmNotes`).
 */
export const crmViewing = async (store: MessageStore, key: AccountKey): Promise<CrmViewing> => {
  if (kindIn(key.provider) !== "crm") return { viewer: undefined }
  const viewing = await crmViewerOf(store, key, (await store.crm.ownUser(key)) ?? null)
  if (viewing.note) {
    const notes = shortened.get(store) ?? new Set<string>()
    notes.add(`${key.provider}:${key.account}: ${viewing.note}`)
    shortened.set(store, notes)
  }
  return viewing
}

/** The CRM accounts the store holds. */
const crmAccounts = async (store: MessageStore) =>
  (await store.accounts.accounts()).filter((key) => kindIn(key.provider) === "crm")

/** Every CRM copy's rule, as cli-core's contexts take it (`viewing`). */
export const crmViewingAll = async (store: MessageStore): Promise<CrmViewing[]> =>
  Promise.all((await crmAccounts(store)).map((key) => crmViewing(store, key)))

/** The viewer of every limited CRM copy, as `listRelations` takes them. */
export const crmViewersAll = async (store: MessageStore): Promise<CopyViewer[]> =>
  crmViewers(store, await crmAccounts(store))

/** The viewer of every limited copy among `keys`. */
export const crmViewers = async (store: MessageStore, keys: readonly AccountKey[]): Promise<CopyViewer[]> =>
  (await Promise.all(keys.map(async (key) => (await crmViewing(store, key)).viewer))).filter(
    (one): one is CopyViewer => one !== undefined,
  )

/**
 * Whether memo may show a deal or lead: the owner's own always, a copy's by cli-core's `seenBy` rule, which
 * `@wirecat/cli-core/store` declares but does not export at run time.
 */
const crmSees = (store: MessageStore) => {
  const known = new Map<string, Promise<CopyViewer | undefined>>()
  return async (row: Owned) => {
    if (row.account === null) return true
    const id = `${row.account.provider}:${row.account.account}`
    if (!known.has(id))
      known.set(
        id,
        crmViewing(store, row.account).then(({ viewer }) => viewer),
      )
    const viewer = await known.get(id)
    return viewer === undefined || (viewer.assignee !== null && row.assignee === viewer.assignee)
  }
}

/** The rows of `rows` memo may show. */
export const seenRows = async <T extends Owned>(store: MessageStore, rows: readonly T[]): Promise<T[]> => {
  const sees = crmSees(store)
  const kept = await Promise.all(rows.map(sees))
  return rows.filter((_, at) => kept[at])
}

/**
 * A page of `most` rows memo may show, read on past the rows it hides so a page is short only at the end. cli-core's
 * `DealFilter.viewer` cannot do it in SQL here: it hides every row not assigned to the viewer, the owner's own and
 * other accounts' too, and memo lists them together.
 */
export const seenPage = async <T extends Owned>(
  store: MessageStore,
  most: number,
  read: (limit: number, offset: number) => Promise<{ items: T[]; hasMore: boolean }>,
): Promise<{ items: T[]; hasMore: boolean }> => {
  const sees = crmSees(store)
  const kept: T[] = []
  let offset = 0
  let more = true
  while (more && kept.length <= most) {
    const page = await read(most + 1, offset)
    for (const row of page.items) if (await sees(row)) kept.push(row)
    offset += page.items.length
    more = page.hasMore && page.items.length > 0
  }
  return { items: kept.slice(0, most), hasMore: kept.length > most || more }
}

/** A deal or lead by its ref; one in a copy memo may not show is not found, as cli-core's `show` answers it. */
export const readableDeal = async (store: MessageStore, ref: string): Promise<Deal> => {
  const found = await store.deals.get(ref)
  if (!(await crmSees(store)(found))) {
    const why = crmNotes(store)
    throw new CliError(
      "not_found",
      `${ref} is not a copy this store's CRM sign-in may read${why.length ? `: ${why.join("; ")}` : ""}`,
      { reason: "deal.not-readable" },
    )
  }
  return found
}

/** A pipeline's funnel, counting in a CRM copy only the rows memo may show. */
export const readablePipeline = async (
  store: MessageStore,
  ref: string,
  options: PipelineOptions = {},
): Promise<PipelineReport> => {
  const report = await store.deals.pipeline(ref, options)
  if (report.account === null) return report
  const { viewer } = await crmViewing(store, report.account)
  return viewer === undefined ? report : store.deals.pipeline(report.ref, { ...options, viewer })
}

/** Pipelines with each limited copy's stage counts read again as its viewer sees them. */
export const readablePipelines = async (
  store: MessageStore,
  pipelines: readonly Pipeline[],
  kind: DealKind | undefined,
): Promise<Pipeline[]> => {
  const accounts = new Map(
    pipelines.flatMap(({ account }) => (account ? [[`${account.provider}:${account.account}`, account]] : [])),
  )
  const seen = new Map<string, Pipeline>()
  for (const account of accounts.values()) {
    const { viewer } = await crmViewing(store, account)
    if (viewer === undefined) continue
    for (const one of await store.deals.pipelines({ ...(kind === undefined ? {} : { kind }), account, viewer }))
      seen.set(one.ref, one)
  }
  return pipelines.map((one) => seen.get(one.ref) ?? one)
}
