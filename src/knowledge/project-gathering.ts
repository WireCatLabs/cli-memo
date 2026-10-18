import { CliError } from "@wirecat/cli-base"
import { gatherProjectEvidence, type ProjectGathering } from "@wirecat/cli-core/services"
import type { MessageStore } from "@wirecat/cli-core/store"
import { contextSourcesOf } from "../store/source-list.js"

export interface ProjectGatherInput {
  project: string
  source: string
  aliases?: string[]
  keywords?: string[]
  people?: string[]
  days?: number
  checkpoint?: string
  maxReads?: number
  limit?: number
}

/**
 * An existing project brings its name and aliases; any other name is gathered as given. A name that matches several
 * projects is refused rather than picked.
 */
const projectOf = async (store: MessageStore, reference: string) => {
  const found = await store.knowledge.resolveVocabulary(reference, { kind: "project" })
  if (found.matches.length > 1)
    throw new CliError(
      "validation_error",
      `${reference} names ${found.matches.length} projects; give one by its key, as memo vocabulary show ${reference} lists them`,
      { candidates: found.matches.map((entry) => ({ id: entry.id, key: entry.key, name: entry.name })) },
    )
  const entry = found.matches[0]
  return entry
    ? { ref: `project:${entry.id}`, name: entry.name, aliases: entry.aliases.map((alias) => alias.name) }
    : { ref: null, name: reference, aliases: [] }
}

export type StoredProjectGathering = ProjectGathering & {
  projectRef: string | null
  unreadSources: { source: string; kind: string }[]
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
    throw new CliError("not_found", `${input.source} holds no messenger account, mailbox or notes folder to read`, {
      param: "source",
    })
  const aliases = [...new Set([...project.aliases, ...(input.aliases ?? [])])].filter((a) => a !== project.name)
  const gathered: ProjectGathering = await gatherProjectEvidence(
    { evidence: store.contextEvidence },
    {
      project: { name: project.name, ...(aliases.length ? { aliases } : {}) },
      ...(input.keywords?.length ? { keywords: input.keywords } : {}),
      ...(input.people?.length ? { people: input.people.map((name) => ({ name })) } : {}),
      sources,
      scope,
      ...(input.days === undefined ? {} : { lookbackDays: input.days }),
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
  return { projectRef: project.ref, unreadSources: unread, ...gathered }
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
        `${day(item.at)}  ${item.ref}${item.context === "person-only" ? "  [person only]" : ""}\n    ${item.text}`,
    ),
  ]
  if (found.matchedAgain.length) lines.push(`${found.matchedAgain.length} earlier references found again`)
  if (failed.length) lines.push(`${failed.length} reads failed or had no source: see --json units`)
  if (found.unreadSources.length)
    lines.push(`not read: ${found.unreadSources.map((one) => `${one.source} (${one.kind})`).join(", ")}`)
  lines.push(
    found.checkpoint
      ? `stopped${found.stopped ? ` at the ${found.stopped} budget` : ""}; continue with --cursor <checkpoint from --json> and the same options`
      : "every read finished; a finished search does not prove there is nothing more",
  )
  return lines.join("\n")
}
