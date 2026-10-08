import { createRenderer, type Streams } from "@leemour/cli-core"
import type { ContextMessage } from "@leemour/cli-messaging/services"
import { openStore } from "@leemour/cli-messaging/store"
import type { Command } from "commander"
import { boundFolders } from "../notes/bound.js"
import { positive } from "../options.js"
import { importNotesMap } from "../people/notes-map.js"
import { type MemoContext, memoContext } from "./context.js"

const MAX_TEXT = 160

const one = (message: ContextMessage | null): string =>
  message === null
    ? "—"
    : `${message.timestamp.slice(0, 16).replace("T", " ")}  ${message.provider}  ${message.chatTitle ?? message.chatId}: ` +
      message.text.replace(/\s+/g, " ").slice(0, MAX_TEXT)

export const contextText = ({ messages, notes, notRead, tasks, yourNotes }: MemoContext): string => {
  const { person, last, recent, shared } = messages
  return [
    `${person.name ?? person.uid}`,
    ...person.identities.map(({ provider, id, name }) => `  ${provider}:${id}  ${name ?? ""}`),
    "",
    `Last from them   ${one(last.fromThemAnywhere ?? last.fromThem)}`,
    `Last from me     ${one(last.fromMe)}`,
    `In common        ${shared.length} chats`,
    ...(recent.direct.length === 0 ? [] : ["", "Recent, direct", ...recent.direct.map((m) => `  ${one(m)}`)]),
    ...(recent.groups.length === 0 ? [] : ["", "Recent, in groups", ...recent.groups.map((m) => `  ${one(m)}`)]),
    "",
    "",
    ...(notes.about.length === 0
      ? ["Note about them  none — memo note <identity> <path>"]
      : ["Notes about them", ...notes.about.map((note) => `  ${note.path ?? note.ref}`)]),
    ...(notes.linking.length === 0
      ? []
      : ["Notes linking them", ...notes.linking.map((note) => `  ${note.path ?? note.ref}`)]),
    ...(notes.throughNotes.length === 0
      ? []
      : ["Notes linking a note about them", ...notes.throughNotes.map((note) => `  ${note.path ?? note.ref}`)]),
    ...(notes.hasMore ? ["  more — raise --limit"] : []),
    ...(messages.complete ? [] : ["", `Not read in full: ${messages.notRead.length} chats — store fetch <chat>`]),
    ...notRead.map(({ source, reason }) => `Not read: ${source} — ${reason}`),
    ...(tasks.items.length
      ? [
          "",
          "Open tasks",
          ...tasks.items.map(
            (task) =>
              `  ${task.id}  ${task.kind}  ${task.source}  ${task.note?.text ?? task.message?.text ?? "source unavailable"}`,
          ),
        ]
      : []),
    ...(yourNotes.length ? ["", "Your notes", ...yourNotes.map((note) => `  ${note.id}  ${note.text}`)] : []),
  ].join("\n")
}

export const contextCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  program
    .command("context")
    .description("What the store holds about a person — messages, mail and notes — with a link to each source")
    .argument("<person>", "<messenger>:<name or id>, e.g. telegram:Ana or email:ana@example.com")
    .option("--limit <n>", "most messages and notes of each kind", positive, 20)
    .option("--json", "print JSON")
    .option("--account <id>", "required when several accounts of the requested provider are stored")
    .action(async (person: string, options: { limit: number; json?: boolean; account?: string }) => {
      const store = await openStore({ env })
      try {
        await importNotesMap(store, env, await boundFolders(store, env, { strict: false }))
        const answer = await memoContext(store, person, {
          limit: options.limit,
          ...(options.account === undefined ? {} : { account: options.account }),
        })
        if (options.json) createRenderer({ format: "json", color: false, streams }).result(answer)
        else streams.data(`${contextText(answer)}\n`)
      } finally {
        await store.close()
      }
    })
}
