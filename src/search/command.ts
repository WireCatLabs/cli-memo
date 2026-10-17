import { CliError, type Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { LOCAL_READ } from "@wirecat/cli-core/cli"
import type { SearchedResource, SearchFound } from "@wirecat/cli-core/services"
import { type Command, InvalidArgumentError } from "commander"
import { answers, withStore } from "../answer.js"
import { searchMemoriesCommand } from "../memories/command.js"
import { modelHint } from "../notes/embed.js"
import { searchText } from "../notes/search.js"
import { positive } from "../options.js"
import { SAVE_HELP } from "../save-help.js"
import { MAIL_SOURCES, mailboxesOf } from "../store/source-list.js"
import { allAnswer, kindAnswer, notesAnswer } from "./answers.js"
import { keyDocumentsFirst, mailAddressOf, searchEverywhere, searchKind, searchNotes } from "./search.js"

const onlyOf = (value: string): SearchedResource[] => {
  const selected = value.split(",").map((part) => part.trim())
  if (!selected.length || selected.some((part) => !["messages", "mail", "notes"].includes(part)))
    throw new InvalidArgumentError("choose messages,mail,notes, separated by commas")
  return [...new Set(selected)] as SearchedResource[]
}

export type Level = "brief" | "full"

const levelOf = ({ brief, full }: { brief?: boolean; full?: boolean }): Level | undefined => {
  if (brief && full) throw new CliError("validation_error", "--brief and --full ask for opposite things — pick one")
  return brief ? "brief" : full ? "full" : undefined
}

const line = (text: string) => text.replace(/\s+/g, " ").trim()

/**
 * A found message or email for a reader: its reference first, then when and from whom, who else it went to and
 * where it is filed, its subject or chat, and an excerpt — the whole text only with --full.
 */
export const found = (item: SearchFound["items"][number], level: Level | undefined): string => {
  const mail = item.email
  const names = (people: { name: string | null; address: string }[]) =>
    people.map(({ name, address }) => line(name ?? address)).join(", ")
  const between = mail
    ? [
        mail.to.length ? `to ${names(mail.to)}` : "",
        mail.cc.length ? `cc ${names(mail.cc)}` : "",
        mail.labels.join(", "),
      ]
        .filter(Boolean)
        .join(" · ")
    : ""
  const who = line(item.senderName ?? item.senderId ?? "unknown")
  const lines = [
    item.locator,
    `  ${item.timestamp}  ${who}${level === "brief" || !between ? "" : `  ${between}`}`,
    ...(level === "brief" || !item.chatTitle ? [] : [`  ${line(item.chatTitle)}`]),
    `  ${level === "full" ? item.text.replace(/\n/g, "\n  ") : line(item.excerpt ?? item.text)}`,
  ]
  return lines.join("\n")
}

const PROJECT_HELP =
  "rank the key documents of this project (id, key or project:<id>) first, labelled key; nothing is left out"
const PROJECT_ORDER_HELP = "rank the key documents of this project (id, key or project:<id>) first; nothing is left out"

export const searchCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv) => {
  const group = program
    .command("search")
    .description("search stored messages, mail, notes and memories; search all when unsure where")
  const { print } = answers(group, streams, env)
  const queryOptions = (leaf: Command) =>
    leaf
      .addHelpText("after", SAVE_HELP)
      .argument("<query...>", "words, phrases, Boolean operators and field queries")
      .option(
        "--limit <n>",
        "most results, at most 100",
        (value: string) => {
          const limit = positive(value)
          if (limit > 100) throw new InvalidArgumentError("at most 100")
          return limit
        },
        20,
      )
      .option("--exact", "words as written; skip meaning search")
      .option("--timezone <zone>", "IANA timezone for calendar date boundaries")
      .option("--json", "print JSON; --json=id,title keeps only those fields")
      .option("--brief", "each message or email as reference, time, sender and excerpt only")
      .option("--full", "each message or email with its whole text; --json keeps the excerpt, messages show the text")

  queryOptions(
    annotate(group.command("all"), { effects: LOCAL_READ, output: { entity: "hit" } })
      .description(
        "messages, mail and notes ranked together; not people, memories, projects or decisions. A kind you know " +
          "reads better with its own search, with all its fields",
      )
      .summary("messages, mail and notes ranked together"),
  )
    .option("--only <resources>", "messages,mail,notes, separated by commas", onlyOf)
    .option("--project <project>", PROJECT_ORDER_HELP)
    .addHelpText(
      "after",
      `
content: narrows a search to the text of files, transcript: to voice transcripts, filename: to file names — memo search all 'content:invoice'.
--json: the list is items, each a hit as in tg search all: ref, kind, title, timestamp, excerpt.`,
    )
    .action(
      async (
        words: string[],
        options: {
          limit: number
          only?: SearchedResource[]
          exact?: boolean
          timezone?: string
          project?: string
          json?: boolean
        },
      ) => {
        const answer = await withStore(env, async (store) => {
          const found = await searchEverywhere(store, env, {
            text: words.join(" "),
            limit: options.limit,
            ...(options.only === undefined ? {} : { only: options.only }),
            ...(options.exact ? { exact: true } : {}),
            ...(options.timezone === undefined ? {} : { timezone: options.timezone }),
          })
          return { ...found, items: await keyDocumentsFirst(store, found.items, options.project) }
        })
        if (!options.json) {
          streams.diagnostic(
            `searched: ${answer.accounts.map(({ provider, account }) => `${provider}:${account}`).join(", ") || "nothing"}\n`,
          )
          for (const skipped of answer.skipped)
            streams.diagnostic(`${skipped.resource} not searched: ${skipped.reason}\n`)
          if (answer.notes?.meaningSkipped)
            streams.diagnostic(`Notes by words only: ${modelHint(answer.notes.meaningSkipped)}\n`)
        }
        print(
          options.json,
          allAnswer(answer, options.limit, options.exact),
          [
            ...answer.items.map((item) => `${"key" in item ? "key  " : ""}${item.kind}  ${item.ref}\n  ${item.text}`),
            ...answer.tasks.map((task) => `task  task:${task.id}  ${task.kind}  ${task.source}`),
          ].join("\n"),
        )
      },
    )

  for (const kind of ["messages", "mail"] as const) {
    const leaf = queryOptions(
      annotate(group.command(kind), { effects: LOCAL_READ, output: { entity: "message", view: "hit" } }).description(
        kind === "mail" ? "imported emails only" : "stored messenger messages only",
      ),
    )
    if (kind === "mail")
      leaf
        .option("--source <accounts>", `the mailboxes to search (default: every one): ${MAIL_SOURCES}`)
        .option("--account <account>", "deprecated: --source email:<account>")
    leaf.addHelpText(
      "after",
      kind === "messages"
        ? `
content: narrows a search to the text of files, transcript: to voice transcripts, filename: to file names — memo search messages
'content:invoice'. Compare it with tg search messages 'content:invoice', a plain word with a plain word.
has:voice, has:file or NOT has:attachment keeps voice messages, files or plain text — memo search messages 'friday has:voice'.
--json: the list is items, each a hit as in tg search messages: ref (msg:…), timestamp, sender_name, excerpt.`
        : `
content: narrows a search to the text of attachments, filename: to their names — memo search mail 'content:invoice'.
Mail sent to many is in the mailbox bulk; NOT mailbox:bulk leaves it out, and bills and bookings with it.
--json: the list is items, each a hit as in tg search mail: ref (msg:email/…), timestamp, email, excerpt.`,
    )
    leaf.action(
      async (
        words: string[],
        options: {
          limit: number
          exact?: boolean
          timezone?: string
          account?: string
          source?: string
          json?: boolean
          brief?: boolean
          full?: boolean
        },
      ) => {
        const level = levelOf(options)
        if (options.account !== undefined && options.source !== undefined)
          throw new CliError("validation_error", "--account is the old --source email:<account>; give one of them")
        if (options.account !== undefined)
          streams.diagnostic(`--account is deprecated: use --source email:${options.account}\n`)
        const account = options.account === undefined ? undefined : mailAddressOf(env, options.account)
        const text = words.join(" ")
        const answer = await withStore(env, async (store) => {
          const mailboxes = options.source === undefined ? undefined : await mailboxesOf(store, env, options.source)
          return searchKind(store, kind, {
            text,
            limit: options.limit,
            ...(account === undefined ? {} : { account }),
            ...(mailboxes === undefined ? {} : { accounts: mailboxes }),
            ...(options.exact ? { exact: true } : {}),
            ...(options.timezone === undefined ? {} : { timezone: options.timezone }),
          })
        })
        print(
          options.json,
          kindAnswer(kind, answer, options.limit, level, words.join(" ")),
          answer.items.map((item) => found(item, level)).join("\n"),
        )
      },
    )
  }

  queryOptions(
    annotate(group.command("notes"), { effects: LOCAL_READ, output: { entity: "note", view: "hit" } }).description(
      "native notes by words and, with the local model, meaning",
    ),
  )
    .addHelpText(
      "after",
      "\nsource:internal keeps the notes written in memo, source:file the notes from a folder — 'budget source:internal'." +
        "\n--source notes:<folder id> is different: it chooses which notes accounts are read." +
        "\ntag: in --filter keeps the notes with that tag and leaves the search by meaning as it is — --filter 'tag:work'." +
        "\n--json: each note's reference is ref (note: or document:).",
    )
    .option("--filter <query>", "another query every note must match")
    .option(
      "--source <accounts>",
      "only these notes accounts, separated by commas: notes:internal for notes written in memo, notes:<folder id> " +
        "as a hit shows it, notes or group:<name>",
    )
    .option("--page <n>", "which page, from 1", positive, 1)
    .option("--project <project>", PROJECT_HELP)
    .action(
      async (
        words: string[],
        options: {
          limit: number
          page: number
          filter?: string
          source?: string
          project?: string
          exact?: boolean
          timezone?: string
          json?: boolean
        },
      ) => {
        const answer = await withStore(env, (store) => searchNotes(store, env, words.join(" "), options))
        if (answer.meaning_skipped && !options.json)
          streams.diagnostic(`Searched by words only: ${modelHint(answer.meaning_skipped)}\n`)
        for (const { source, reason } of answer.skipped) streams.diagnostic(`${source} not searched: ${reason}\n`)
        const { limit, page, json, ...rest } = options
        print(json, notesAnswer(answer, limit, page, { query: words.join(" "), ...rest }), searchText(answer))
      },
    )
  searchMemoriesCommand(group, streams, env)
  // A source left unread is named in meta.issues; the rest is still the answer, so the search exits 0.
  for (const leaf of group.commands) annotate(leaf, { partial: true })
}
