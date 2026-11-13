import { join, relative } from "node:path"
import type { Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { isFolderProvider } from "@wirecat/cli-core"
import { DOCUMENTS_LIST_QUERY, documentListRequest, LOCAL_READ, withQuery } from "@wirecat/cli-core/cli"
import { type DocumentEntry, listDocumentSources, listDocuments, showDocument } from "@wirecat/cli-core/services"
import type { MessageStore } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { answers, itemAnswer, listAnswer, plainText, withStore } from "../answer.js"
import { loadConfig } from "../config.js"
import { noteFolders } from "../notes/folders.js"
import { between, collect, positive } from "../options.js"

const NOTE =
  "\nEvery account holding documents is read: Drive accounts, notes folders, sources added by hand and imports. " +
  "Newest change first; a text term keeps that order among what the notes search found. meta.accounts names what " +
  "was read."

/**
 * A notes folder's file opens from where the folder is on this computer, which only memo's config knows. The config
 * names a folder by its stored account id; a row names its account as provider:account.
 */
const withLocalPaths = async (env: NodeJS.ProcessEnv, store: MessageStore) => {
  const roots = new Map(
    noteFolders(loadConfig(env).notes).flatMap(({ id, path }) => (id === null ? [] : [[id, path] as const])),
  )
  const folders = new Map<string, string>(
    (await store.listings.documentAccounts()).flatMap(({ id, provider, account }) => {
      const root = roots.get(String(id))
      return root === undefined ? [] : [[`${provider}:${account}`, root] as const]
    }),
  )
  return <T extends DocumentEntry>(item: T): T => {
    if (item.local_path !== null || item.path === null || !isFolderProvider(item.source.provider)) return item
    const root = folders.get(item.source.source)
    if (root === undefined) return item
    const path = join(root, item.path)
    // The path comes from the store: one that climbs out of the folder is not opened.
    return relative(root, path).startsWith("..") ? item : { ...item, local_path: path }
  }
}

export const documentsCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const { print } = answers(program, streams, env)
  const documents = program
    .command("documents")
    .description("every document the store holds, of every account: Drive, notes folders, added sources, imports")
    .summary("documents of every account")

  withQuery(
    annotate(documents.command("list"), { effects: LOCAL_READ, output: { entity: "document_entry" } })
      .description("documents of every account, newest change first, with their source, folder and kind")
      .summary("documents of every account, newest first"),
    DOCUMENTS_LIST_QUERY,
  )
    .addHelpText("after", NOTE)
    .option("--limit <n>", "documents per page, 1–500", between(1, 500), 50)
    .option("--page <n>", "which page, from 1", positive, 1)
    .option("--json", "print JSON; --json=ref,title keeps only those fields")
    .action(
      async (words: string[], { json, limit, page }: { limit: number; page: number; json?: boolean }, command) => {
        const request = documentListRequest(words, { limit, page })
        const { found, local } = await withStore(env, async (store) => ({
          found: await listDocuments(store, request),
          local: await withLocalPaths(env, store),
        }))
        const body = listAnswer("documents list", {
          items: found.items.map(local),
          limit,
          page,
          total: found.total,
          // A capped total says only "at least": a full page then may have more after it.
          has_more:
            request.offset + found.items.length < found.total.value ||
            (found.total.relation === "gte" && found.items.length === limit),
          args: { query: words.join(" ") || undefined, limit },
          meta: { accounts: found.accounts },
        })
        print(json, body, plainText(body, command))
      },
    )

  annotate(documents.command("tree"), { effects: LOCAL_READ, output: { entity: "document_source" } })
    .description("the accounts holding documents, each with its folders and how many documents each holds")
    .summary("accounts and folders holding documents, with counts")
    .option(
      "--source <accounts>",
      "only this provider:account, or every account of a provider; repeat for more",
      collect,
    )
    .option("--depth <n>", "folder levels to list, 0–20", between(0, 20), 3)
    .option("--json", "print JSON; --json=source,count keeps only those fields")
    .action(async ({ json, source, depth }: { source?: string[]; depth: number; json?: boolean }, command) => {
      const items = await withStore(env, (store) =>
        listDocumentSources(store, { ...(source ? { sources: source } : {}), depth }),
      )
      const body = listAnswer("documents tree", {
        items,
        limit: Math.max(1, items.length),
        has_more: false,
        meta: { accounts: items.map(({ source }) => source) },
      })
      print(json, body, plainText(body, command))
    })

  annotate(documents.command("show"), { effects: LOCAL_READ, output: { entity: "document_entry_details" } })
    .description("one document: a part of its text, its tags, the people it names and its meetings")
    .summary("one document with its text")
    .argument("<document>", "document:<id>, from documents list")
    .option(
      "--cursor <cursor>",
      "the character its text starts at: where the last read ended",
      between(0, Number.MAX_SAFE_INTEGER),
      0,
    )
    .option("--max-chars <n>", "characters of text at most, 1–200000", between(1, 200_000), 20_000)
    .option("--json", "print JSON; --json=ref,text keeps only those fields")
    .action(async (ref: string, { json, cursor, maxChars }: { cursor: number; maxChars: number; json?: boolean }) => {
      const item = await withStore(env, async (store) =>
        (await withLocalPaths(env, store))(await showDocument(store, ref, { offset: cursor, limit: maxChars })),
      )
      print(json, itemAnswer(item))
    })
}
