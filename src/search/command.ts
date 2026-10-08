import { CliError, createRenderer, type Streams } from "@leemour/cli-core"
import { parseLocator } from "@leemour/cli-messaging"
import { searchStore } from "@leemour/cli-messaging/services"
import type { AccountKey, MessageStore } from "@leemour/cli-messaging/store"
import { openStore } from "@leemour/cli-messaging/store"
import type { Command } from "commander"
import { positive } from "../options.js"
import { type AccountScope, selectAccount } from "../store/scope.js"
import { taskPage } from "../tasks/context.js"

export interface EvidenceItem {
  kind: "message" | "note" | "email" | "annotation" | "task"
  locator: string
  provider: string
  account: string
  timestamp: string
  text: string
  match: "structured-words" | "annotation-text" | "task-source"
  source?: string
}

export const unifiedSearch = async (
  store: MessageStore,
  query: string,
  options: { keys: AccountKey[]; limit?: number; offset?: number; annotationText?: string },
): Promise<{
  query: string
  items: EvidenceItem[]
  hasMore: boolean
  nextOffset?: number
  incomplete: boolean
  accounts: AccountKey[]
  coverage: unknown[]
}> => {
  const limit = options.limit ?? 20,
    offset = options.offset ?? 0
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 1000)
    throw new CliError("validation_error", "limit takes 1–100; offset takes 0–1000")
  if (!options.keys.length || options.keys.length > 50) throw new CliError("validation_error", "select 1–50 accounts")
  const answer = await searchStore(store, options.keys[0] as AccountKey, {
    text: query,
    language: "lucene",
    accounts: options.keys,
    limit: Math.min(2000, offset + limit + 1),
    newest: true,
  })
  const items: EvidenceItem[] = answer.items.map((hit) => {
    const key = parseLocator(hit.locator)
    return {
      kind: key.provider === "notes" ? "note" : key.provider === "email" ? "email" : "message",
      locator: hit.locator,
      provider: key.provider,
      account: key.account,
      timestamp: hit.timestamp,
      text: hit.text.slice(0, 2000),
      match: "structured-words",
    }
  })
  const matched = new Set(items.map((hit) => hit.locator))
  const coverage: unknown[] = []
  let incomplete = answer.hasMore
  for (const key of options.keys) {
    if (options.annotationText !== undefined) {
      const notes = await store.knowledge.annotations(key, {
        search: options.annotationText,
        limit: Math.min(500, offset + limit + 1),
      })
      incomplete ||= notes.hasMore
      for (const note of notes.items)
        items.push({
          kind: "annotation",
          locator: `annotation:${key.provider}/${encodeURIComponent(key.account)}/${note.id}`,
          ...key,
          timestamp: note.updatedAt,
          text: note.text.slice(0, 2000),
          match: "annotation-text",
          ...(note.target.type === "message" ? { source: note.target.locator } : {}),
        })
    }
    const taskResults = await taskPage(store, key, {
      state: "open",
      sources: [...matched],
      limit: Math.min(500, offset + limit + 1),
    })
    incomplete ||= taskResults.hasMore
    for (const task of taskResults.items) {
      if (matched.has(task.source))
        items.push({
          kind: "task",
          locator: `task:${task.id}`,
          ...key,
          timestamp: task.createdAt.toISOString(),
          text: task.kind,
          source: task.source,
          match: "task-source",
        })
    }
    coverage.push({
      ...key,
      mail: key.provider === "email" ? ((await store.syncState(key, "mail_coverage"))?.value ?? null) : undefined,
      archives: await store.chatCompleteness(
        key,
        (await store.chats(key, { limit: 500 })).items.map((chat) => chat.id),
      ),
    })
  }
  items.sort(
    (a, b) =>
      b.timestamp.localeCompare(a.timestamp) || a.kind.localeCompare(b.kind) || a.locator.localeCompare(b.locator),
  )
  const unique = [...new Map(items.map((item) => [item.locator, item])).values()]
  const hasMore = unique.length > offset + limit
  return {
    query,
    items: unique.slice(offset, offset + limit),
    hasMore,
    ...(hasMore && offset + limit <= 1000 ? { nextOffset: offset + limit } : {}),
    incomplete: incomplete || (hasMore && offset + limit > 1000),
    accounts: options.keys,
    coverage,
  }
}

export const searchAccounts = async (
  store: MessageStore,
  options: AccountScope & { all?: boolean },
): Promise<AccountKey[]> => {
  if (options.all && (options.provider !== undefined || options.account !== undefined))
    throw new CliError("validation_error", "use --all alone or select one provider/account")
  return options.all ? store.accounts() : [await selectAccount(store, options)]
}

export const searchCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv) => {
  program
    .command("search")
    .description("Structured words across selected messages, email and notes, with linked open tasks")
    .argument("<query>", "shared phrase, Boolean, date/chat/tag query")
    .option("--all", "explicitly search every stored account")
    .option("--provider <provider>")
    .option("--account <account>")
    .option("--annotation-text <text>", "also search this literal substring in owner annotations")
    .option("--limit <n>", "most results, at most 100", positive, 20)
    .option("--offset <n>", "continue from nextOffset", Number, 0)
    .option("--json")
    .action(
      async (
        query: string,
        options: AccountScope & {
          all?: boolean
          limit: number
          offset: number
          annotationText?: string
          json?: boolean
        },
      ) => {
        const store = await openStore({ env })
        try {
          const answer = await unifiedSearch(store, query, {
            keys: await searchAccounts(store, options),
            limit: options.limit,
            offset: options.offset,
            ...(options.annotationText === undefined ? {} : { annotationText: options.annotationText }),
          })
          if (options.json) createRenderer({ format: "json", color: false, streams }).result(answer)
          else
            streams.data(`${answer.items.map((item) => `${item.kind}  ${item.locator}\n  ${item.text}`).join("\n")}\n`)
        } finally {
          await store.close()
        }
      },
    )
}
