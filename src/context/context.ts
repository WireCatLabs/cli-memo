import { CliError } from "@leemour/cli-core"
import { type PersonContext, personContext } from "@leemour/cli-messaging/services"
import type { Annotation, KnowledgeRelation, MessageStore } from "@leemour/cli-messaging/store"
import type { NotesMap } from "../people/notes-map.js"
import { selectAccount } from "../store/scope.js"
import { personTasks } from "../tasks/context.js"

export interface NoteMention {
  locator: string
  path: string
  /** The first line naming them. */
  line: string
  match: "name"
  confidence: "weak"
}

export interface MemoContext {
  /** Messages and mail, from the store: every identity linked to the person, by id. */
  messages: PersonContext
  notes: {
    /** The note about them, as `memo note` named it. */
    about: string | null
    /** Stored notes naming them in full — by name, so possibly someone else. */
    mentions: NoteMention[]
    hasMore: boolean
  }
  /** Sources that gave nothing, and why. */
  notRead: { source: string; reason: string }[]
  tasks: Awaited<ReturnType<typeof personTasks>>
  annotations: { items: Annotation[]; hasMore: boolean }
  relationships: KnowledgeRelation[]
}

const MAX_LINE = 200
/** Shorter names, or a single word, match too much ordinary text to mean anyone. */
const MIN_NAME = 5

const literal = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/**
 * One answer about a person: what the store holds of them across messengers and mail (cli-messaging's
 * person context), the note about them, and the notes that name them.
 */
export const memoContext = async (
  store: MessageStore,
  reference: string,
  { limit = 20, notesMap = {}, account }: { limit?: number; notesMap?: NotesMap; account?: string } = {},
): Promise<MemoContext> => {
  const [, provider, who] = /^([a-z][a-z0-9-]*):(.+)$/.exec(reference.trim()) ?? []
  if (provider === undefined || who === undefined)
    throw new CliError("validation_error", `"${reference}" names no messenger — write it as <messenger>:<name or id>`)
  const accounts = await store.accounts()
  const asked = await selectAccount(store, { provider, ...(account === undefined ? {} : { account }) })

  const messages = await personContext(store, asked, who, { messages: limit })
  const about = notesMap[messages.person.uid] ?? null

  const names = [
    ...new Set(
      [messages.person.name, ...messages.person.identities.map(({ name }) => name)].map((name) => name?.trim()),
    ),
  ].filter((name): name is string => !!name && name.length >= MIN_NAME && /\s/.test(name))
  const notRead: MemoContext["notRead"] = []
  let mentions: NoteMention[] = []
  let hasMore = false
  if (!accounts.some((account) => account.provider === "notes")) {
    notRead.push({ source: "notes", reason: "no notes imported — memo notes import" })
  } else if (names.length > 0) {
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(${names.map(literal).join("|")})(?![\\p{L}\\p{N}])`, "iu")
    const found = await store.find({ provider: "notes", pattern, limit: limit + 1 })
    hasMore = found.items.length > limit || found.hasMore
    mentions = found.items
      .slice(0, limit)
      .filter(({ id }) => about === null || !about.endsWith(`/${id}`))
      .map((hit) => ({
        locator: hit.locator,
        path: hit.id,
        line: (hit.text.split("\n").find((line) => pattern.test(line)) ?? "").trim().slice(0, MAX_LINE),
        match: "name" as const,
        confidence: "weak" as const,
      }))
  }
  if (!messages.person.identities.some((identity) => identity.provider === "email"))
    notRead.push({
      source: "mail",
      reason: "no mail address linked to them — tg contacts link <person> email:<address>",
    })

  const tasks = await personTasks(store, messages.person, accounts, limit)
  const annotations: MemoContext["annotations"] = { items: [], hasMore: false }
  for (const key of accounts) {
    const identities = messages.person.identities.filter(
      (identity) => identity.provider === key.provider && identity.accounts.includes(key.account),
    )
    if (!identities.length) continue
    for (const target of [
      { type: "person" as const, id: messages.person.uid },
      ...identities.map((identity) => ({ type: "contact" as const, id: identity.id })),
    ]) {
      const page = await store.knowledge.annotations(key, { target, limit: Math.min(limit, 500) })
      annotations.items.push(...page.items)
      annotations.hasMore ||= page.hasMore
    }
  }
  annotations.hasMore ||= annotations.items.length > limit
  annotations.items = annotations.items.slice(0, limit)
  const relationships = (await store.knowledge.relations(asked, `person:${messages.person.uid}`)).filter(
    (relation) => relation.confirmed,
  )
  return { messages, notes: { about, mentions, hasMore }, notRead, tasks, annotations, relationships }
}
