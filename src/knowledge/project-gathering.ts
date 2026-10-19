import { CliError } from "@wirecat/cli-base"
import {
  type EvidenceMentions,
  findEvidenceMentions,
  gatherProjectEvidence,
  type ProjectGathering,
  storedNeighbours,
} from "@wirecat/cli-core/services"
import type { MessageStore } from "@wirecat/cli-core/store"
import { contextSourcesOf } from "../store/source-list.js"
import { canonicalProject } from "../vocabulary/project.js"

export interface ProjectGatherInput {
  project: string
  source: string
  aliases?: string[]
  keywords?: string[]
  people?: string[]
  days?: number
  after?: number
  checkpoint?: string
  maxReads?: number
  limit?: number
  catchUp?: boolean
  beforeN?: number
  afterN?: number
}

/**
 * An existing project brings its name and aliases; any other name is gathered as given. An id that names no
 * project, or a name that matches several, is refused rather than guessed.
 */
const projectOf = async (store: MessageStore, reference: string) => {
  const id = /^(project:)?[1-9]\d*$/.test(reference)
  let ref: string
  try {
    ref = await canonicalProject(store, id && !reference.startsWith("project:") ? `project:${reference}` : reference)
  } catch (error) {
    if (!id && error instanceof CliError && error.code === "not_found")
      return { ref: null, name: reference, key: null, aliases: [] }
    throw error
  }
  const entry = (await store.knowledge.vocabulary({ kind: "project" })).entries.find((one) => one.id === ref.slice(8))
  if (!entry) throw new CliError("not_found", "the owner project is unavailable")
  return { ref, name: entry.name, key: entry.key, aliases: entry.aliases.map((alias) => alias.name) }
}

/** Days back (`90d`) or a start date (`2026-09-01`); either way the run freezes its end, so a resume keeps it. */
export const windowOf = (value: string): { days: number } | { after: number } => {
  const days = /^([1-9]\d{0,2})d$/.exec(value)?.[1]
  if (days !== undefined && Number(days) <= 730) return { days: Number(days) }
  const after = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2})?)?$/.test(value) ? Date.parse(value) : Number.NaN
  if (Number.isFinite(after)) return { after }
  throw new CliError(
    "validation_error",
    `--since-time takes 1d to 730d or a date, such as 90d or 2026-09-01 — not ${value}`,
    {
      param: "since_time",
    },
  )
}

export type StoredProjectGathering = ProjectGathering & {
  projectRef: string | null
  unreadSources: { source: string; kind: string }[]
  mentions: EvidenceMentions
}

export const gatherStoredProject = async (
  store: MessageStore,
  env: NodeJS.ProcessEnv,
  input: ProjectGatherInput,
): Promise<StoredProjectGathering> => {
  if (!store.contextEvidence)
    throw new CliError("configuration_error", "Stored context reads are unavailable in this store")
  const project = await projectOf(store, input.project)
  const { sources, unread, scope } = await contextSourcesOf(store, env, input.source)
  if (sources.length === 0)
    throw new CliError(
      "not_found",
      `${input.source} holds no messenger account, mailbox, meeting account or notes folder to read`,
      {
        param: "source",
      },
    )
  const aliases = [...new Set([...project.aliases, ...(input.aliases ?? [])])].filter((alias) => alias !== project.name)
  const gathered: ProjectGathering = await gatherProjectEvidence(
    {
      evidence: store.contextEvidence,
      neighbours: storedNeighbours(store),
      ...(store.contextIndex ? { index: store.contextIndex } : {}),
    },
    {
      project: {
        name: project.name,
        ...(project.key ? { key: project.key } : {}),
        ...(aliases.length ? { aliases } : {}),
      },
      index: input.catchUp === false ? "as-is" : "update",
      around: { before: input.beforeN ?? 2, after: input.afterN ?? 2 },
      ...(input.keywords?.length ? { keywords: input.keywords } : {}),
      ...(input.people?.length ? { people: input.people.map((name) => ({ name })) } : {}),
      sources,
      scope,
      ...(input.days === undefined ? {} : { lookbackDays: input.days }),
      ...(input.after === undefined ? {} : { after: input.after }),
      ...(input.checkpoint === undefined ? {} : { checkpoint: input.checkpoint }),
      ...(input.maxReads === undefined && input.limit === undefined
        ? {}
        : {
            budgets: {
              ...(input.maxReads === undefined ? {} : { maxReads: input.maxReads }),
              ...(input.limit === undefined ? {} : { maxItems: input.limit }),
            },
          }),
    },
  )
  const mentions = await findEvidenceMentions(store.knowledge, gathered, { exclude: project.ref })
  return { projectRef: project.ref, unreadSources: unread, ...gathered, mentions }
}

const day = (at: number) => new Date(at).toISOString().slice(0, 10)

export const projectGatherText = (found: StoredProjectGathering) => {
  const lanes = new Map(found.lanes.map((lane) => [lane.id, `${lane.query} (${lane.kinds.join(", ")})`]))
  const failed = found.units.filter((unit) => unit.state === "failed" || unit.state === "unavailable")
  const lines = [
    `${found.project.name}${found.projectRef ? ` — ${found.projectRef}` : ""}: ${found.items.length} new references, ` +
      `${day(found.window.after)} to ${day(found.window.before)}, ${found.scope.sources.length} sources`,
    `searched: ${[...lanes.values()].join("; ")}`,
    ...found.items.map(
      (item) =>
        `${day(item.at)}  ${item.ref}${item.context === "person-only" ? "  [person only]" : ""}\n    ${item.text}` +
        (item.around ?? [])
          .map((one) => `\n      ${one.found ? "(hit) " : ""}${one.sender ? `${one.sender}: ` : ""}${one.text}`)
          .join(""),
    ),
  ]
  if (found.mentions.items.length)
    lines.push(
      `also names: ${found.mentions.items
        .slice(0, 8)
        .map((one) => `${one.target.kind} ${one.target.name} (${one.matches.length})`)
        .join(", ")} — words found, not membership`,
    )
  if (found.matchedAgain.length) lines.push(`${found.matchedAgain.length} earlier references found again`)
  if (failed.length) lines.push(`${failed.length} reads failed or had no source: see --json units`)
  if (found.index.state === "failed" || found.index.state === "unavailable")
    lines.push(`the search index could not be brought up to date first (${found.index.code ?? found.index.state})`)
  const pending = [
    ...new Set(
      found.units.filter((unit) => unit.issue?.startsWith("index-")).map((unit) => found.scope.sources[unit.source]),
    ),
  ]
  if (pending.length)
    lines.push(
      `not yet searchable: new text in ${pending.map((one) => `${one?.provider}:${one?.account}`).join(", ")} ` +
        "is still waiting for the search index, so it was not found",
    )
  if (pending.some((one) => one?.kind === "mail" || one?.kind === "document") && found.index.state === "as-is")
    lines.push("leave out --no-catch-up to index new mail and documents first")
  if (pending.some((one) => one?.kind === "meeting"))
    lines.push(
      "index stored transcript cues through the meeting provider's indexing workflow; mail/document catch-up does not index them",
    )
  if (found.unreadSources.length)
    lines.push(`not read: ${found.unreadSources.map((one) => `${one.source} (${one.kind})`).join(", ")}`)
  if (found.checkpoint)
    lines.push(
      `stopped${found.stopped ? ` at the ${found.stopped} budget` : ""}; continue with the same options and`,
      `--cursor ${found.checkpoint}`,
    )
  else lines.push("every read finished; a finished search does not prove there is nothing more")
  return lines.join("\n")
}
