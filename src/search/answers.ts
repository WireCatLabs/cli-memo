import type { Missing } from "@wirecat/cli-base/standards"
import type { NotesFound, SearchAllFound, SearchFound } from "@wirecat/cli-core/services"
import { metaOf } from "../output.js"

interface Account {
  provider: string
  account: string
}

interface Skip {
  resource?: string
  source?: string
  reason: string
}

const named = (accounts: Account[] = []) => [
  ...new Set(accounts.map(({ provider, account }) => `${provider}:${account}`)),
]

const notSearched = (skipped: Skip[] = []): Missing[] =>
  skipped.map(({ resource, source, reason }) => ({
    field: "items",
    why: `${resource ?? source ?? "a source"} not searched: ${reason}`,
  }))

const byWordsOnly = (why: string | undefined): Missing[] => (why === undefined ? [] : [{ field: "found_by", why }])

const listed = <T>(
  items: T[],
  page: object,
  missing: Missing[],
  startedAt: number,
  accounts: string[],
): { items: T[]; page: object; missing?: Missing[]; meta: ReturnType<typeof metaOf> } => ({
  items,
  page,
  ...(missing.length ? { missing } : {}),
  meta: metaOf(startedAt, accounts.length ? { accounts } : {}),
})

/** `search all`: the open tasks that point at a hit ride on that hit, so the list stays one list. */
export const allAnswer = (
  found: SearchAllFound & {
    accounts: Account[]
    tasks: { source?: string | null }[]
    tasksIncomplete: boolean
  },
  limit: number,
  startedAt: number,
) =>
  listed(
    found.items.map((item) => {
      const tasks = found.tasks.filter((task) => task.source === item.ref)
      return tasks.length ? { ...item, tasks } : item
    }),
    { mode: "page", limit, has_more: found.hasMore },
    [
      ...notSearched(found.skipped),
      ...byWordsOnly(found.notes?.meaningSkipped),
      ...(found.tasksIncomplete
        ? [{ field: "tasks", why: "more open tasks point at these results than are shown" }]
        : []),
    ],
    startedAt,
    named(found.accounts),
  )

/** `search messages` and `search mail`. */
export const kindAnswer = (found: SearchFound, limit: number, startedAt: number) =>
  listed(
    found.items,
    { mode: "page", limit, has_more: found.hasMore },
    [
      ...notSearched(found.skipped),
      ...(found.wordsReady ? [] : [{ field: "text", why: "the word index is still being built" }]),
    ],
    startedAt,
    named(found.accounts ?? found.coverage?.accounts),
  )

/** `search notes`: it pages by offset, so the next page is a cursor `--offset` takes. */
export const notesAnswer = (
  found: NotesFound & { accounts?: Account[]; skipped?: Skip[] },
  limit: number,
  startedAt: number,
) =>
  listed(
    found.hits,
    {
      mode: "cursor",
      limit,
      has_more: found.has_more,
      ...(found.has_more && found.next_offset !== undefined ? { next_cursor: String(found.next_offset) } : {}),
    },
    [...notSearched(found.skipped), ...byWordsOnly(found.meaning_skipped)],
    startedAt,
    named(found.accounts),
  )
