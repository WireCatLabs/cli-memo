import { CliError } from "@wirecat/cli-base"
import { formatReference, parseReference } from "@wirecat/cli-core"
import { dateWindow, momentOf } from "@wirecat/cli-core/cli"
import {
  type EvidenceMentions,
  findEvidenceMentions,
  gatherProjectEvidence,
  type ProjectGathering,
  storedNeighbours,
} from "@wirecat/cli-core/services"
import type { MessageStore } from "@wirecat/cli-core/store"
import * as v from "valibot"
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
  asOf?: number
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

interface Contact {
  name?: string
  reference?: string
  senders?: { provider: string; id: string }[]
}

/**
 * A `person:<id>` is read by what their stored identities wrote, and searched only by the short names the owner gave
 * them: their stored name is a messenger display name («Степа Stefan Grachev AVITO M A») that no message spells out.
 * Any other text is a name.
 */
const contactOf = async (store: MessageStore, contact: string): Promise<Contact[]> => {
  if (!contact.startsWith("person:")) return [{ name: contact }]
  const person = await store.people.personByUid(contact.slice("person:".length))
  if (!person) throw new CliError("not_found", `no person ${contact}`, { param: "contact" })
  const senders = person.identities.map((identity) => ({ provider: identity.provider, id: String(identity.id) }))
  const aliases = new Set<string>()
  for (const identity of person.identities)
    for (const account of identity.accounts) {
      const alias = await store.people
        .privateContact({ provider: identity.provider, account }, identity.id)
        .then((one) => one.alias)
        .catch((error) => {
          if (error instanceof CliError && error.code === "not_found") return null
          throw error
        })
      if (alias) aliases.add(alias)
    }
  if (!senders.length && !aliases.size)
    throw new CliError(
      "validation_error",
      `${contact} has no stored identity or alias to search by; pass a name the texts use to --contact`,
      { param: "contact" },
    )
  const names = [...aliases].map((name) => ({ name, reference: contact }))
  return senders.length ? [{ reference: contact, senders }, ...names] : names
}

const LINKED_CHATS = 16

/** Only links the owner confirmed: a suggested one would put a whole chat into the evidence on a guess. */
const linkedChatsOf = async (store: MessageStore, project: string | null) => {
  if (!project) return []
  const chats = []
  for (const relation of await store.knowledge.relations(null, project)) {
    if (!relation.confirmed || relation.kind !== "member-of" || relation.to !== project) continue
    if (!relation.from.startsWith("chat:")) continue
    const reference = parseReference(relation.from)
    if (reference.type === "chat") chats.push(reference)
  }
  return chats.map(({ provider, account, chat }) => ({ provider, account, chat }))
}

/** Days back (`90d`) or a start date (`2026-09-01`); either way the run freezes its end, so a resume keeps it. */
export const windowOf = (value: string): { days: number } | { after: number } => {
  const days = /^([1-9]\d{0,2})d$/.exec(value)?.[1]
  if (days !== undefined && Number(days) <= 730) return { days: Number(days) }
  if (/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2})?)?$/.test(value))
    return { after: momentOf(value, "--since-time") }
  throw new CliError(
    "validation_error",
    `--since-time takes 1d to 730d or a date, such as 90d or 2026-09-01 — not ${value}`,
    {
      param: "since_time",
    },
  )
}

/** The zone a typed start date was read in, and the window the run used, in UTC. */
export const gatherMeta = (sinceTime: string, { window }: ProjectGathering) => {
  const { timezone } = dateWindow({ sinceTime }).meta
  return {
    ...(timezone === undefined ? {} : { timezone }),
    window: { since: new Date(window.after).toISOString(), until: new Date(window.before).toISOString() },
  }
}

export const cutoffTime = (value: string): number => {
  const parsed = v.safeParse(v.pipe(v.string(), v.isoTimestamp()), value)
  const at = parsed.success ? Date.parse(parsed.output) : Number.NaN
  const date = parsed.success ? Date.parse(`${parsed.output.slice(0, 10)}T00:00:00.000Z`) : Number.NaN
  if (
    !parsed.success ||
    !/(Z|[+-]\d{2}:\d{2})$/.test(parsed.output) ||
    !Number.isFinite(at) ||
    at < 1 ||
    !Number.isFinite(date) ||
    new Date(date).toISOString().slice(0, 10) !== parsed.output.slice(0, 10)
  )
    throw new CliError("validation_error", "--before-time needs a real ISO 8601 timestamp with a UTC offset", {
      param: "before_time",
    })
  return at
}

export type StoredProjectGathering = ProjectGathering & {
  projectRef: string | null
  unreadSources: { source: string; kind: string; reason?: "out-of-scope" | "linked-chat-limit" | "unknown-provider" }[]
  mentions: EvidenceMentions
}

export const gatherStoredProject = async (
  store: MessageStore,
  env: NodeJS.ProcessEnv,
  input: ProjectGatherInput,
): Promise<StoredProjectGathering> => {
  if (input.asOf !== undefined && input.after !== undefined && input.asOf <= input.after)
    throw new CliError("validation_error", "--before-time must be later than --since-time", { param: "before_time" })
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
  const people = (
    await Promise.all([...new Set(input.people ?? [])].map((contact) => contactOf(store, contact)))
  ).flat()
  const aliases = [...new Set([...project.aliases, ...(input.aliases ?? [])])].filter((alias) => alias !== project.name)
  const linked = await linkedChatsOf(store, project.ref)
  const linkedChats = linked.slice(0, LINKED_CHATS)
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
      ...(people.length ? { people } : {}),
      ...(linkedChats.length ? { linkedChats } : {}),
      sources,
      scope,
      ...(input.days === undefined ? {} : { lookbackDays: input.days }),
      ...(input.after === undefined ? {} : { after: input.after }),
      ...(input.asOf === undefined ? {} : { asOf: input.asOf }),
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
  const unreadChats = [
    ...gathered.linkedChats
      .filter((one) => one.state === "out-of-scope")
      .map((one) => ({ source: one.ref, kind: "linked-chat", reason: "out-of-scope" as const })),
    ...linked.slice(LINKED_CHATS).map((one) => ({
      source: formatReference({ type: "chat", ...one }),
      kind: "linked-chat",
      reason: "linked-chat-limit" as const,
    })),
  ]
  return { projectRef: project.ref, unreadSources: [...unread, ...unreadChats], ...gathered, mentions }
}

const LABELS: Record<string, string> = {
  "person-only": "  [person only]",
  sender: "  [sent by contact]",
  "linked-chat": "  [linked chat]",
}

const day = (at: number) => new Date(at).toISOString().slice(0, 10)

export const projectGatherText = (found: StoredProjectGathering) => {
  const lanes = new Map(
    found.lanes.map((lane) => [
      lane.id,
      `${lane.query ?? lane.chat ?? `what ${lane.people.join(", ")} wrote`} (${lane.kinds.join(", ")})`,
    ]),
  )
  const linked = found.items.filter((item) => item.context === "linked-chat").length
  const sent = found.items.filter((item) => item.context === "sender").length
  const unreadSenders = found.lanes.filter(
    (lane) => lane.kinds.includes("sender") && !found.units.some((unit) => unit.lane === lane.id),
  )
  const failed = found.units.filter((unit) => unit.state === "failed" || unit.state === "unavailable")
  const lines = [
    `${found.project.name}${found.projectRef ? ` — ${found.projectRef}` : ""}: ${found.items.length} new references, ` +
      `${day(found.window.after)} to ${day(found.window.before)}, ${found.scope.sources.length} sources`,
    `as of: ${new Date(found.window.asOf).toISOString()} (exclusive end; reuse --before-time to repeat this window)`,
    `searched: ${[...lanes.values()].join("; ")}`,
    ...found.items.map(
      (item) =>
        `${day(item.at)}  ${item.ref}${LABELS[item.context] ?? ""}\n    ${item.text}` +
        (item.around ?? [])
          .map((one) => `\n      ${one.found ? "(hit) " : ""}${one.sender ? `${one.sender}: ` : ""}${one.text}`)
          .join(""),
    ),
  ]
  const people = found.people.slice(0, 8)
  const morePeople = found.people.length - people.length + found.peopleOmitted
  if (people.length)
    lines.push(
      `people who wrote these: ${people.map((one) => `${one.name} (${one.items})`).join(", ")}` +
        `${morePeople ? ` and ${morePeople} more` : ""} — by stored contact, not by names in the text; yours left out`,
    )
  if (linked)
    lines.push(`${linked} of these come from the project's linked chats and name nothing: membership, not a word match`)
  if (sent) lines.push(`${sent} of these were written by a contact and may name nothing: matched by sender, not words`)
  for (const lane of unreadSenders)
    lines.push(`${lane.people.join(", ")}: no stored identity in the selected sources, so nothing they wrote was read`)
  if (found.mentions.items.length)
    lines.push(
      `also names: ${found.mentions.items
        .slice(0, 8)
        .map((one) => `${one.target.kind} ${one.target.name} (${one.matches.length})`)
        .join(", ")} — words found, not membership`,
    )
  if (found.matchedAgain.length) lines.push(`${found.matchedAgain.length} earlier references found again`)
  if (found.oversized.length)
    lines.push(
      `too large to read here: ${found.oversized.map((one) => `${one.ref} (${Math.ceil(one.bytes / 1024)} KiB)`).join(", ")}` +
        " — open each with memo notes show",
    )
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
    lines.push(
      `not read: ${found.unreadSources
        .map((one) => `${one.source} (${one.kind}${one.reason ? `, ${one.reason}` : ""})`)
        .join(", ")}`,
    )
  const capped = found.linkedChats.filter((one) => one.capped)
  if (capped.length)
    lines.push(
      `linked chats with more to read, left for --cursor so one chat does not fill the run: ${capped
        .map((one) => `${one.ref} (${one.items} this run)`)
        .join(", ")}`,
    )
  if (found.checkpoint)
    lines.push(
      `stopped${found.stopped ? ` at the ${found.stopped} budget` : ""}; continue with the same options and`,
      `--cursor ${found.checkpoint}`,
    )
  else lines.push("every read finished; a finished search does not prove there is nothing more")
  return lines.join("\n")
}
