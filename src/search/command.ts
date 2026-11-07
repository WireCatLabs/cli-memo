import { CliError, type Streams } from "@wirecat/cli-base"
import { annotate, customizeSharedCommand } from "@wirecat/cli-base/commands"
import { parseLucene } from "@wirecat/cli-base/query"
import { LOCAL_READ, sharedCommandTemplate, shownOf } from "@wirecat/cli-core/cli"
import { hitText } from "@wirecat/cli-core/mail"
import { RESOURCES_SEARCHED, type SearchedResource } from "@wirecat/cli-core/services"
import type { MessageStore } from "@wirecat/cli-core/store"
import { type Command, InvalidArgumentError } from "commander"
import { answers, withStore } from "../answer.js"
import { APP } from "../app.js"
import { SHELL_OVERRIDES } from "../contract-overrides.js"
import { searchMemoriesCommand } from "../memories/command.js"
import { searchText } from "../notes/search.js"
import { positive } from "../options.js"
import { SAVE_HELP } from "../save-help.js"
import { accountsByKind, groupScopeOf } from "../store/group.js"
import { ACCOUNTS_HELP, MAIL_SOURCES, mailboxesOf } from "../store/source-list.js"
import { allAnswer, eventsMeaningNote, kindAnswer, messagesMeaningNote, notesAnswer } from "./answers.js"
import { lanesFor } from "./lane-gates.js"
import { peopleAnswer, peopleText, searchPeople } from "./people.js"
import { hasSource, keyDocumentsFirst, searchEverywhere, searchKind, searchNotes } from "./search.js"

/** `search messages` takes no `--source`; in a group it reads the group's messenger accounts only. */
const groupMessengers = async (store: MessageStore, env: NodeJS.ProcessEnv, text: string) => {
  const scope = await groupScopeOf(store, env)
  if (scope === undefined) return undefined
  if (hasSource(parseLucene(text).root))
    throw new CliError(
      "validation_error",
      `in group ${scope.run.name} search messages reads the group's accounts — leave in: out of the query`,
    )
  const { messages } = accountsByKind(scope)
  if (messages.length === 0) throw new CliError("not_found", `group ${scope.run.name} holds no messenger account`)
  return messages
}

const ONLY = ["messages", "mail", "notes", "events", "crm", "business"]

const onlyOf = (value: string): SearchedResource[] => {
  const selected = value.split(",").map((part) => part.trim())
  if (!selected.length || selected.some((part) => !ONLY.includes(part)))
    throw new InvalidArgumentError(`choose ${ONLY.join(",")}, separated by commas`)
  return [...new Set(selected)] as SearchedResource[]
}

export type Level = "brief" | "full"

const levelOf = ({ brief, full }: { brief?: boolean; full?: boolean }): Level | undefined => {
  if (brief && full) throw new CliError("validation_error", "--brief and --full ask for opposite things — pick one")
  return brief ? "brief" : full ? "full" : undefined
}

const PROJECT_HELP =
  "rank the key documents of this project (id, project:<id>, key, exact name or alias) first, labelled key; " +
  "nothing is left out"
const PROJECT_ORDER_HELP =
  "rank the key documents of this project (id, project:<id>, key, exact name or alias) first; nothing is left out"

const searchCommandDefinition = (program: Command, streams: Streams, env: NodeJS.ProcessEnv) => {
  const group = program
    .command("search")
    .description("search messages, mail, notes, memories and people; search all when unsure where")
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

  queryOptions(
    annotate(group.command("all"), { effects: LOCAL_READ, output: { entity: "hit" } })
      .description(
        "messages, mail, notes, calendar events, deals, leads and business data ranked together; not people, memories, " +
          "projects or decisions. " +
          "A kind you know reads better with its own search, with all its fields",
      )
      .summary("messages, mail, notes, events and deals ranked together"),
  )
    .option("--only <resources>", `${ONLY.join(",")}, separated by commas`, onlyOf)
    .option("--plain-order", "best first by the words alone, without moving mail from suspicious senders down")
    .option("--project <project>", PROJECT_ORDER_HELP)
    .addHelpText(
      "after",
      `
content: narrows a search to the text of files, transcript: to voice transcripts, filename: to file names — memo search all 'content:invoice'.
Calendar events come from every calendar gcal stored; an event's title, description and place are written by whoever sent the invitation.
crm finds deals and leads by the words of their title only.
business finds invoices, payments, orders, contracts, subscriptions, products and wallets by the words of their numbers and names.
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
          plainOrder?: boolean
        },
        command: Command,
      ) => {
        const gate = lanesFor(command, options.only)
        const answer = await withStore(env, async (store) => {
          const found = await searchEverywhere(store, env, {
            text: words.join(" "),
            limit: options.limit,
            ...(gate.only === undefined ? {} : { only: gate.only }),
            ...(gate.shows === undefined ? {} : { shows: gate.shows }),
            ...(gate.crmKinds === undefined ? {} : { crmKinds: gate.crmKinds }),
            ...(options.exact ? { exact: true } : {}),
            ...(options.plainOrder ? { plainOrder: true } : {}),
            ...(options.timezone === undefined ? {} : { timezone: options.timezone }),
          })
          return {
            ...found,
            skipped: [...gate.skipped, ...found.skipped],
            items: await keyDocumentsFirst(store, found.items, options.project),
          }
        })
        if (!options.json) {
          streams.diagnostic(
            `searched: ${answer.accounts.map(({ provider, account }) => `${provider}:${account}`).join(", ") || "nothing"}\n`,
          )
          for (const skipped of answer.skipped)
            streams.diagnostic(`${skipped.resource ?? skipped.source} not searched: ${skipped.reason}\n`)
          if (answer.notes?.meaningSkipped) streams.diagnostic(`Notes by words only: ${answer.notes.meaningSkipped}\n`)
          if (answer.events?.meaningSkipped) streams.diagnostic(`${eventsMeaningNote(answer.events.meaningSkipped)}\n`)
          if (answer.messages?.meaningSkipped)
            streams.diagnostic(`${messagesMeaningNote(answer.messages.meaningSkipped)}\n`)
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
    const one = kind === "mail" ? "email" : "message"
    const leaf = queryOptions(
      annotate(group.command(kind), { effects: LOCAL_READ, output: { entity: "message", view: "hit" } }).description(
        kind === "mail" ? "imported emails only" : "stored messenger messages only",
      ),
    )
      .option("--brief", `each ${one} as reference, time, sender and excerpt only`)
      .option("--full", `each ${one} with its whole text; --json still gives the excerpt`)
    if (kind === "mail")
      leaf
        .option("--source <accounts>", `the mailboxes to search (default: every one): ${MAIL_SOURCES}`)
        .option("--plain-order", "best first by the words alone, without moving mail from suspicious senders down")
    leaf.addHelpText(
      "after",
      kind === "messages"
        ? `
content: narrows a search to the text of files, transcript: to voice transcripts, filename: to file names — memo search messages
'content:invoice'. Compare it with tg search messages 'content:invoice', a plain word with a plain word.
has:voice, has:file or NOT has:attachment keeps voice messages, files or plain text — memo search messages 'friday has:voice'.
A question finds messages holding some of its words, and a short reply by the message it answers — memo search messages
'when is the price sync?'. Plain words must all be in the message; --exact keeps a question to that too.
--json: the list is items, each a hit as in tg search messages: ref (msg:…), timestamp, sender_name, excerpt.
For an agent: read with --compact, one line per hit with its reference. Never write message text to a file.`
        : `
content: narrows a search to the text of attachments, filename: to their names — memo search mail 'content:invoice'.
Mail sent to many is in the mailbox bulk; NOT mailbox:bulk leaves it out, and bills and bookings with it.
Mail from senders with signs of fraud (mail <profile> account inspect) comes after the rest of the page; --plain-order keeps it in place.
--json: the list is items, each a hit as in tg search mail: ref (msg:email/…), timestamp, email, excerpt.
For an agent: read with --compact, one line per hit with its reference. Never write mail text to a file.`,
    )
    leaf.action(
      async (
        words: string[],
        options: {
          limit: number
          exact?: boolean
          timezone?: string
          source?: string
          json?: boolean
          brief?: boolean
          full?: boolean
          plainOrder?: boolean
        },
      ) => {
        const level = levelOf(options)
        const text = words.join(" ")
        const answer = await withStore(env, async (store) => {
          const mailboxes =
            options.source !== undefined
              ? await mailboxesOf(store, env, options.source)
              : kind === "messages"
                ? await groupMessengers(store, env, text)
                : undefined
          return searchKind(store, kind, {
            text,
            limit: options.limit,
            ...(mailboxes === undefined ? {} : { accounts: mailboxes }),
            ...(options.exact ? { exact: true } : {}),
            ...(options.plainOrder ? { plainOrder: true } : {}),
            ...(options.timezone === undefined ? {} : { timezone: options.timezone }),
          })
        })
        print(
          options.json,
          kindAnswer(kind, answer, options.limit, level, words.join(" ")),
          [
            ...answer.items.map((item) => hitText(item, level)),
            ...[shownOf(answer.items.length, 0, answer.total)].filter((line) => line !== undefined),
          ].join("\n"),
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
        "\nFields in the query or in --filter (tag:, date:) hold for every hit, found by words or by meaning; a query of" +
        "\nfields alone lists the matching notes, newest first — 'budget tag:work', 'date:today'." +
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
          streams.diagnostic(`Searched by words only: ${answer.meaning_skipped}\n`)
        for (const { source, reason } of answer.skipped) streams.diagnostic(`${source} not searched: ${reason}\n`)
        const { limit, page, json, ...rest } = options
        print(
          json,
          notesAnswer(answer, limit, page, { query: words.join(" "), ...rest }),
          searchText(answer, (page - 1) * limit),
        )
      },
    )
  searchMemoriesCommand(group, streams, env)
  annotate(group.command("people"), { effects: LOCAL_READ, output: { entity: "person" } })
    .description(
      "people whose name, username or alias holds every word, in every account unless --source narrows it; " +
        "each with its person:<id> for --contact and its identities",
    )
    .summary("people by name across every account")
    .argument("<name...>", "parts of the name, username or alias; case and accents do not matter")
    .option("--source <accounts>", ACCOUNTS_HELP)
    .option(
      "--limit <n>",
      "most people, at most 100",
      (value: string) => {
        const limit = positive(value)
        if (limit > 100) throw new InvalidArgumentError("at most 100")
        return limit
      },
      20,
    )
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .addHelpText(
      "after",
      "\n--json: the list is items, each a person: ref (person:<id>, or contact:<provider>/<id> for one never linked)," +
        " name, identities (provider, account, id, name, username, alias) and aliases; meta.accounts names what was read.",
    )
    .action(async (words: string[], options: { limit: number; source?: string; json?: boolean }) => {
      const found = await withStore(env, (store) => searchPeople(store, env, words, options))
      if (!options.json)
        streams.diagnostic(
          `searched: ${found.accounts.map(({ provider, account }) => `${provider}:${account}`).join(", ") || "nothing"}\n`,
        )
      print(options.json, peopleAnswer(found, options.limit), peopleText(found))
    })
  // A source left unread is named in meta.issues; the rest is still the answer, so the search exits 0.
  for (const leaf of group.commands) annotate(leaf, { partial: true })
}

export const searchCommand = (...args: Parameters<typeof searchCommandDefinition>) =>
  customizeSharedCommand(
    sharedCommandTemplate(APP, "search"),
    "Memo searches imported accounts, mail and native notes without a live messenger; its scope, ranking and output controls are explicit provider differences.",
    () => {
      searchCommandDefinition(...args)
      const command = args[0].commands.find((command) => command.name() === "search")
      if (!command) throw new Error("search builder did not install its command")
      return command
    },
    SHELL_OVERRIDES.search,
  )
