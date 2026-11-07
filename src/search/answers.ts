import type { ErrorCode } from "@wirecat/cli-base"
import { MAX_NEXT_STEPS, type Missing, type StepDefinition, stepOf } from "@wirecat/cli-base/standards"
import { kindIn } from "@wirecat/cli-core"
import { allHitItem, coverageGaps, messageHitItem, noteHitItem } from "@wirecat/cli-core/cli"
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

/** A source the search could not read is an issue, as in cli-core's searches; the sentence goes to a person. */
const metaOf = (
  accounts: readonly Account[],
  skipped: readonly { code: ErrorCode; source?: string; resource?: string; why?: string }[] = [],
  heldInPart = false,
) => {
  const issues = skipped.map((one) => ({
    code: one.code,
    // The output standard takes a dotted reason only, as cli-core's search all does.
    ...(one.why && /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/u.test(one.why) ? { reason: one.why } : {}),
    source: one.source ?? one.resource ?? "",
  }))
  return {
    accounts: named(accounts),
    ...(heldInPart ? { complete: false } : {}),
    ...(issues.length ? { issues } : {}),
  }
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

const MEETING_PASSAGE: StepDefinition = {
  id: "hit.passage",
  kind: "command",
  command: "meetings passage",
  args: [
    { name: "reference", required: true },
    { name: "source", required: true },
  ],
  why: "read the lines around this meeting hit before citing it",
}

/** Meeting accounts search all could not read, and those whose index is behind: `search meetings` builds it. */
const meetingsMissed = (found: SearchAllFound): Missing[] => [
  ...(found.meetings ?? [])
    .filter(({ indexing }) => indexing === "pending")
    .map(({ provider, account }) => ({
      field: "items",
      why: `${provider}:${account}: meetings saved since its search index was last built are not found yet`,
      step: "search.meetings",
    })),
  ...found.skipped
    .filter(({ resource, source }) =>
      resource === undefined ? kindIn(source.split(":")[0] ?? "") === "meetings" : resource === "meetings",
    )
    .map(({ resource, source, reason }) => ({ field: "items", why: `${source ?? resource} not searched: ${reason}` })),
]

/**
 * `search all`, CLI and MCP alike. A hit that open tasks point at gets a step listing them, and a meeting transcript
 * hit one opening its passage; the answer keeps the first two.
 */
export const allAnswer = (
  found: SearchAllFound & {
    tasks: { source: string; heldBy: AccountKey }[]
    tasksIncomplete: boolean
  },
  limit: number,
  exact = false,
  /** Kinds the permissions kept out of the search, each with why. */
  leftOut: readonly { why: string }[] = [],
) => {
  const archive = coverageGaps({ coverage: found.coverage }, found.items.length)
  const next = found.items.flatMap((item) => {
    // `meetings passage` opens a transcript cue only; a chat or summary hit's excerpt is all there is to open.
    const passage =
      item.kind === "meeting" && item.cueRef !== undefined
        ? [stepOf(MEETING_PASSAGE, { args: { reference: item.cueRef, source: `${item.provider}:${item.account}` } })]
        : []
    const tasks = found.tasks.filter((task) => task.source === item.ref)
    const held = tasks[0]?.heldBy
    if (held === undefined) return passage
    return [
      stepOf(TASKS_OF_HIT, {
        args: { query: `source:"${item.ref}"`, source: `${held.provider}:${held.account}` },
        values: { count: tasks.length },
      }),
      ...passage,
    ]
  })
  const steps = [...next, ...archive.next].slice(0, MAX_NEXT_STEPS)
  return listAnswer("search all", {
    items: found.items.map(allHitItem),
    limit,
    has_more: found.hasMore,
    ...(steps.length ? { next: steps } : {}),
    missing: [
      ...meetingsMissed(found),
      ...leftOut.map(({ why }) => ({ field: "items", why })),
      ...archive.missing,
      ...meaningMissed(found.notes?.meaningSkipped, exact),
      ...messagesMeaningMissed(found.messages?.meaningSkipped),
      ...(found.events?.meaningSkipped === undefined || exact
        ? []
        : [{ field: "found_by", why: eventsMeaningNote(found.events.meaningSkipped) }]),
      ...(found.unmatched && !found.items.length
        ? [
            {
              field: "items",
              why: `every word must be in one record, and nothing in ${found.searched.join(", ")} holds ${found.unmatched.map((word) => `"${word}"`).join(", ")}`,
            },
          ]
        : []),
    ],
    meta: metaOf(found.accounts, found.skipped, archive.missing.length > 0),
  })
}

/** `search messages` and `search mail`, CLI and MCP alike: each hit the `message.hit` view, `brief` cut shorter. */
export const kindAnswer = (
  kind: "messages" | "mail",
  found: SearchFound,
  limit: number,
  level?: "brief" | "default" | "full",
  query = "",
) => {
  const archive = coverageGaps(found, found.items.length)
  return listAnswer(`search ${kind}`, {
    items: found.items.map((item) =>
      level === "brief" ? briefHit(messageHitItem(item, query)) : messageHitItem(item, query),
    ),
    limit,
    has_more: found.hasMore,
    ...(found.total ? { total: found.total } : {}),
    ...(archive.next.length ? { next: archive.next } : {}),
    missing: [
      ...archive.missing,
      ...(found.wordsReady ? [] : [{ field: "text", why: "the word index is still being built" }]),
    ],
    meta: metaOf(found.coverage?.accounts ?? found.accounts ?? [], found.skipped, archive.missing.length > 0),
  })
}

/** `search notes`, CLI and MCP alike; `args` reruns the same search for the next page. */
export const notesAnswer = (found: NotesFound, limit: number, page: number, args: Record<string, unknown> = {}) =>
  listAnswer("search notes", {
    items: found.hits.map(noteHitItem),
    limit,
    has_more: found.has_more && found.next_offset !== undefined,
    page,
    ...(found.total ? { total: found.total } : {}),
    args,
    missing: meaningMissed(found.meaning_skipped, args.exact === true),
  })
