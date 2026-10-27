import type { ErrorCode } from "@wirecat/cli-base"
import { type Missing, type StepDefinition, stepOf } from "@wirecat/cli-base/standards"
import { allHitItem, messageHitItem, noteHitItem } from "@wirecat/cli-core/cli"
import type { NotesFound, SearchAllFound, SearchFound } from "@wirecat/cli-core/services"
import type { AccountKey } from "@wirecat/cli-core/store"
import { listAnswer } from "../answer.js"
import { briefHit } from "./hits.js"

interface Account {
  provider: string
  account: string
}

const named = (accounts: readonly Account[]) => [
  ...new Set(accounts.map(({ provider, account }) => `${provider}:${account}`)),
]

/** A source the search could not read is an issue, as in cli-core's searches; the reason goes to a person. */
const metaOf = (
  accounts: readonly Account[],
  skipped: readonly { code: ErrorCode; source?: string; resource?: string }[] = [],
) => {
  const issues = skipped.map((one) => ({ code: one.code, source: one.source ?? one.resource ?? "" }))
  return { accounts: named(accounts), ...(issues.length ? { issues } : {}) }
}

/** Meaning not searched because the model is missing is a gap; `--exact` leaving it out is not. */
const meaningMissed = (why: string | undefined, exact = false): Missing[] =>
  why === undefined || exact ? [] : [{ field: "found_by", why }]

type MessagesMeaning = NonNullable<NonNullable<SearchAllFound["messages"]>["meaningSkipped"]>

/** memo has no `conversations rebuild`: the messenger CLI that imported the messages gives them their vectors. */
export const messagesMeaningNote = ({ reason, step, model }: MessagesMeaning) =>
  `Messages by words only: ${reason}${
    step === "models.download"
      ? ` — \`memo models download ${model}\`, then the messenger's \`conversations rebuild\` gives messages their vectors`
      : step === "conversations.rebuild"
        ? " — the messenger's `conversations rebuild` (tg, max, wa) gives messages their vectors"
        : ""
  }`

/** memo has no calendar sync: gcal's `sync --embed` gives events their vectors. */
export const eventsMeaningNote = (reason: string) =>
  `Events by words only: ${reason}${reason.startsWith("no event has vectors") ? " — gcal <profile> sync --embed gives events their vectors" : ""}`

const messagesMeaningMissed = (meaning: MessagesMeaning | undefined): Missing[] =>
  meaning === undefined ? [] : [{ field: "found_by", why: messagesMeaningNote(meaning) }]

const TASKS_OF_HIT: StepDefinition = {
  id: "hit.tasks",
  kind: "command",
  command: "tasks list",
  args: [
    { name: "query", required: true },
    { name: "source", required: true },
  ],
  why: "{count} open tasks point at this result",
}

/** `search all`, CLI and MCP alike: a hit that open tasks point at gets a step listing them, at most two. */
export const allAnswer = (
  found: SearchAllFound & {
    tasks: { source: string; heldBy: AccountKey }[]
    tasksIncomplete: boolean
  },
  limit: number,
  exact = false,
) => {
  const next = found.items.flatMap((item) => {
    const tasks = found.tasks.filter((task) => task.source === item.ref)
    const held = tasks[0]?.heldBy
    if (held === undefined) return []
    return [
      stepOf(TASKS_OF_HIT, {
        args: { query: `source:"${item.ref}"`, source: `${held.provider}:${held.account}` },
        values: { count: tasks.length },
      }),
    ]
  })
  return listAnswer("search all", {
    items: found.items.map(allHitItem),
    limit,
    has_more: found.hasMore,
    ...(next.length ? { next: next.slice(0, 2) } : {}),
    missing: [
      ...meaningMissed(found.notes?.meaningSkipped, exact),
      ...messagesMeaningMissed(found.messages?.meaningSkipped),
      ...(found.events?.meaningSkipped === undefined || exact
        ? []
        : [{ field: "found_by", why: eventsMeaningNote(found.events.meaningSkipped) }]),
    ],
    meta: metaOf(found.accounts, found.skipped),
  })
}

/** `search messages` and `search mail`, CLI and MCP alike: each hit the `message.hit` view, `brief` cut shorter. */
export const kindAnswer = (
  kind: "messages" | "mail",
  found: SearchFound,
  limit: number,
  level?: "brief" | "default" | "full",
  query = "",
) =>
  listAnswer(`search ${kind}`, {
    items: found.items.map((item) =>
      level === "brief" ? briefHit(messageHitItem(item, query)) : messageHitItem(item, query),
    ),
    limit,
    has_more: found.hasMore,
    missing: found.wordsReady ? [] : [{ field: "text", why: "the word index is still being built" }],
    meta: metaOf(found.coverage?.accounts ?? found.accounts ?? [], found.skipped),
  })

/** `search notes`, CLI and MCP alike; `args` reruns the same search for the next page. */
export const notesAnswer = (found: NotesFound, limit: number, page: number, args: Record<string, unknown> = {}) =>
  listAnswer("search notes", {
    items: found.hits.map(noteHitItem),
    limit,
    has_more: found.has_more && found.next_offset !== undefined,
    page,
    args,
    missing: meaningMissed(found.meaning_skipped, args.exact === true),
  })
