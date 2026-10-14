import type { ErrorCode } from "@wirecat/cli-base"
import type { Missing } from "@wirecat/cli-base/standards"
import type { NotesFound, SearchAllFound, SearchFound } from "@wirecat/cli-core/services"
import { listAnswer } from "../answer.js"
import { atDetail } from "../output.js"

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

/** `search all`, CLI and MCP alike: the open tasks that point at a hit ride on that hit, so the list stays hits. */
export const allAnswer = (
  found: SearchAllFound & { tasks: { source: string }[]; tasksIncomplete: boolean },
  limit: number,
  exact = false,
) =>
  listAnswer("search all", {
    items: found.items.map((item) => {
      const tasks = found.tasks.filter((task) => task.source === item.ref)
      return tasks.length ? { ...item, tasks } : item
    }),
    limit,
    has_more: found.hasMore,
    missing: [
      ...meaningMissed(found.notes?.meaningSkipped, exact),
      ...(found.tasksIncomplete
        ? [{ field: "tasks", why: "more open tasks point at these results than are shown" }]
        : []),
    ],
    meta: metaOf(found.accounts, found.skipped),
  })

/** `search messages` and `search mail`, CLI and MCP alike. */
export const kindAnswer = (
  kind: "messages" | "mail",
  found: SearchFound,
  limit: number,
  level?: "brief" | "default" | "full",
) =>
  listAnswer(`search ${kind}`, {
    items: atDetail(found.items, level),
    limit,
    has_more: found.hasMore,
    missing: found.wordsReady ? [] : [{ field: "text", why: "the word index is still being built" }],
    meta: metaOf(found.coverage?.accounts ?? found.accounts ?? [], found.skipped),
  })

/** `search notes`, CLI and MCP alike; `args` reruns the same search for the next page. */
export const notesAnswer = (found: NotesFound, limit: number, page: number, args: Record<string, unknown> = {}) =>
  listAnswer("search notes", {
    items: found.hits,
    limit,
    has_more: found.has_more && found.next_offset !== undefined,
    page,
    args,
    missing: meaningMissed(found.meaning_skipped, args.exact === true),
  })
