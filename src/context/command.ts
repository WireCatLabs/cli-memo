import { createRenderer, type Streams } from "@leemour/cli-core"
import type { ContextMessage } from "@leemour/cli-messaging/services"
import { openStore } from "@leemour/cli-messaging/store"
import type { Command } from "commander"
import { positive } from "../options.js"
import { loadNotesMap } from "../people/notes-map.js"
import { type MemoContext, memoContext } from "./context.js"

const MAX_TEXT = 160

const one = (message: ContextMessage | null): string =>
  message === null
    ? "—"
    : `${message.timestamp.slice(0, 16).replace("T", " ")}  ${message.provider}  ${message.chatTitle ?? message.chatId}: ` +
      message.text.replace(/\s+/g, " ").slice(0, MAX_TEXT)

export const contextText = ({ messages, notes, notRead }: MemoContext): string => {
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
    `Note about them  ${notes.about ?? "none — memo note <identity> <path>"}`,
    ...(notes.mentions.length === 0
      ? []
      : [
          "Notes naming them (by name — may be someone else)",
          ...notes.mentions.map(({ path, line }) => `  ${path}  ${line}`),
          ...(notes.hasMore ? ["  more — raise --limit"] : []),
        ]),
    ...(messages.complete ? [] : ["", `Not read in full: ${messages.notRead.length} chats — store fetch <chat>`]),
    ...notRead.map(({ source, reason }) => `Not read: ${source} — ${reason}`),
  ].join("\n")
}

export const contextCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  program
    .command("context")
    .description("What the store holds about a person — messages, mail and notes — with a link to each source")
    .argument("<person>", "<messenger>:<name or id>, e.g. telegram:Ana or email:ana@example.com")
    .option("--limit <n>", "most messages and notes of each kind", positive, 20)
    .option("--json", "print JSON")
    .action(async (person: string, options: { limit: number; json?: boolean }) => {
      const store = await openStore({ env })
      try {
        const answer = await memoContext(store, person, { limit: options.limit, notesMap: loadNotesMap(env) })
        if (options.json) createRenderer({ format: "json", color: false, streams }).result(answer)
        else streams.data(`${contextText(answer)}\n`)
      } finally {
        await store.close()
      }
    })
}
