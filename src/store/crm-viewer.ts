import { CliError } from "@wirecat/cli-base"
import { type DealKind, kindIn } from "@wirecat/cli-core"
import { type CrmViewing, crmViewerOf } from "@wirecat/cli-core/crm"
import type { AccountKey, Deal, MessageStore, Pipeline, PipelineReport } from "@wirecat/cli-core/store"

type CopyViewer = NonNullable<CrmViewing["viewer"]>
type PipelineOptions = NonNullable<Parameters<MessageStore["deals"]["pipeline"]>[1]>

/**
 * What memo may show of one CRM copy (SEC-197): what the user its sync signed in as reads, as cli-core's `search all`
 * reads another account's copy. A copy that limits its users and names none shows nothing; an account that is no CRM,
 * as an ERP's import, shows whole.
 */
export const crmViewing = async (store: MessageStore, key: AccountKey): Promise<CrmViewing> =>
  kindIn(key.provider) === "crm"
    ? crmViewerOf(store, key, (await store.crm.ownUser(key)) ?? null)
    : { viewer: undefined }

/** The viewer of every limited copy among `keys`. */
export const crmViewers = async (store: MessageStore, keys: readonly AccountKey[]): Promise<CopyViewer[]> =>
  (await Promise.all(keys.map(async (key) => (await crmViewing(store, key)).viewer))).filter(
    (one): one is CopyViewer => one !== undefined,
  )

/** Whether memo may show a deal or lead: the owner's own always, a copy's as cli-core's `seenBy` decides. */
export const crmSees = (store: MessageStore) => {
  const known = new Map<string, Promise<CopyViewer | undefined>>()
  return async (row: { account: AccountKey | null; assignee: string | null }) => {
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

/** The rows of `rows` memo may show. A page read before this may come back short. */
export const seenRows = async <T extends { account: AccountKey | null; assignee: string | null }>(
  store: MessageStore,
  rows: readonly T[],
): Promise<T[]> => {
  const sees = crmSees(store)
  const kept = await Promise.all(rows.map(sees))
  return rows.filter((_, at) => kept[at])
}

/** A deal or lead by its ref; one in a copy memo may not show is not found, as cli-core's `show` answers it. */
export const readableDeal = async (store: MessageStore, ref: string): Promise<Deal> => {
  const found = await store.deals.get(ref)
  if (!(await crmSees(store)(found)))
    throw new CliError("not_found", `${ref} is not a copy this store's CRM sign-in may read`, {
      reason: "deal.not-readable",
    })
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
