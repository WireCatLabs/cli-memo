import { CliError } from "@leemour/cli-core"
import { type PersonContext, personContext } from "@leemour/cli-messaging/services"
import type { MessageStore } from "@leemour/cli-messaging/store"
import type { NotesMap } from "../people/notes-map.js"

export interface NoteMention {
  locator: string
  path: string
  /** The first line naming them. */
  line: string
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
  { limit = 20, notesMap = {} }: { limit?: number; notesMap?: NotesMap } = {},
): Promise<MemoContext> => {
  const [, provider, who] = /^([a-z][a-z0-9-]*):(.+)$/.exec(reference.trim()) ?? []
  if (provider === undefined || who === undefined)
    throw new CliError("validation_error", `"${reference}" names no messenger — write it as <messenger>:<name or id>`)
  const accounts = await store.accounts()
  const asked = accounts.find((account) => account.provider === provider)
  if (asked === undefined) throw new CliError("not_found", `the store holds no ${provider} account`)

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
      }))
  }
  if (!messages.person.identities.some((identity) => identity.provider === "email"))
    notRead.push({
      source: "mail",
      reason: "no mail address linked to them — tg contacts link <person> email:<address>",
    })

  return { messages, notes: { about, mentions, hasMore }, notRead }
}
