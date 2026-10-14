import type { Streams } from "@wirecat/cli-base"
import type { ContextMessage } from "@wirecat/cli-core/services"
import type { Command } from "commander"
import { answers, itemAnswer, withStore } from "../answer.js"
import { boundFolders } from "../notes/bound.js"
import { positive } from "../options.js"
import { importNotesMap } from "../people/notes-map.js"
import { type MemoContext, memoContext } from "./context.js"

const MAX_TEXT = 160

const one = (message: ContextMessage | null): string =>
  message === null
    ? "—"
    : `${message.timestamp.slice(0, 16).replace("T", " ")}  ${message.provider}  ${message.chatTitle ?? message.chatId}: ` +
      `${message.text.replace(/\s+/g, " ").slice(0, MAX_TEXT)}  ${message.locator}`

/** A note by the reference `notes show` takes, then where it is. */
const noteLine = (note: { ref: string; path: string | null; title?: string | null }) =>
  `  ${note.ref}${(note.path ?? note.title) ? `  ${note.path ?? note.title}` : ""}`

export const contextText = ({ messages, notes, notRead, tasks, yourNotes }: MemoContext): string => {
  const { person, last, recent, shared } = messages
  return [
    `${person.name ?? person.uid}  person:${person.uid}`,
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
      : ["Notes about them", ...notes.about.map(noteLine)]),
    ...(notes.linking.length === 0 ? [] : ["Notes linking them", ...notes.linking.map(noteLine)]),
    ...(notes.throughNotes.length === 0
      ? []
      : ["Notes linking a note about them", ...notes.throughNotes.map(noteLine)]),
    ...(notes.hasMore ? ["  more — raise --limit"] : []),
    ...(messages.complete ? [] : ["", `Not read in full: ${messages.notRead.length} chats — messages sync <chat>`]),
    ...notRead.map(({ source, reason }) => `Not read: ${source} — ${reason}`),
    ...(tasks.items.length
      ? [
          "",
          "Open tasks",
          ...tasks.items.map(
            (task) =>
              `  task:${task.id}  ${task.kind}  ${task.source}  ${task.note?.text ?? task.message?.text ?? "source unavailable"}`,
          ),
        ]
      : []),
    ...(yourNotes.length
      ? [
          "",
          "Your notes",
          ...yourNotes.map((note) => `  ${note.ref}  ${note.text.replace(/\s+/g, " ").slice(0, MAX_TEXT)}`),
        ]
      : []),
  ].join("\n")
}

export const contextCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const { print } = answers(program, streams, env)
  program
    .command("context")
    .description("messages, mail and notes about a person, each with a link to its source")
    .argument("<person>", "<messenger>:<name or id>, e.g. telegram:Ana or email:ana@example.com")
    .option("--limit <n>", "most messages and notes of each kind", positive, 20)
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .option(
      "--account <account>",
      "the stored account to read; required when the store holds several of that messenger",
    )
    .action(async (person: string, options: { limit: number; json?: boolean; account?: string }) => {
      const answer = await withStore(env, async (store) => {
        await importNotesMap(store, env, await boundFolders(store, env, { strict: false }))
        return memoContext(store, person, {
          limit: options.limit,
          ...(options.account === undefined ? {} : { account: options.account }),
        })
      })
      print(options.json, itemAnswer(answer), contextText(answer))
    })
}
