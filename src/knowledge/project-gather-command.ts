import { annotate, annotateOption } from "@wirecat/cli-base/commands"
import {
  type Body,
  FETCH,
  parseDuration,
  projectAnswerParts,
  projectCutoffTime,
  projectEvidenceText,
  projectWindowOf,
} from "@wirecat/cli-core/cli"
import { gatherStoredProject } from "@wirecat/cli-core/services"
import { type Command, Option } from "commander"
import { itemAnswer, withStore } from "../answer.js"
import { collect, positive, whole } from "../options.js"
import { ACCOUNTS_HELP, contextSourcesOf } from "../store/source-list.js"
import { chatSync, messengerFetcher, syncHint, syncProfileOf } from "./messenger-sync.js"

interface Options {
  source: string
  alias?: string[]
  contextQuery?: string[]
  contact?: string[]
  sinceTime: string
  beforeTime?: string
  limit: number
  maxPages?: number
  cursor?: string
  catchUp: boolean
  beforeN: number
  afterN: number
  syncFirst?: boolean
  syncTime: string
  syncProfile?: Record<string, string>
  json?: boolean
}

/** Off MCP: a tool call ends at about a minute, too soon for a sync, which would fail the whole answer. */
const cliOnly = (option: Option) => annotateOption(option, { mcp: false })

export const projectGatherCommand = (
  projects: Command,
  print: (json: boolean | undefined, body: Body, text?: string) => void,
  env: NodeJS.ProcessEnv,
  warn: (text: string) => void,
) =>
  // Declared as a fetch for --sync-first; cli-base fixes effects per command, and without it nothing leaves this machine.
  annotate(projects.command("evidence"), { effects: FETCH, partial: true })
    .description(
      "cited references about a project in stored messages, mail, meeting transcripts and imported notes folders. The project's name, " +
        "its key, each of its aliases and each --alias, each --context-query and each --contact name is its own search: every word of " +
        "it must appear in one text, in any order, as whole words; their hits are joined. Every message of a chat confirmed as the " +
        "project's (memo relationships add chat:<provider>/<account>/<chat> project:<id>) is read too, when --source holds its " +
        "account, and so is everything a confirmed person member of the project wrote (as --contact person:<id>, " +
        "without aliases). New mail and documents are indexed for search first, unless --no-catch-up. Reads " +
        "what the store holds; with --sync-first it first syncs the linked chats the store lacks for the window by running " +
        "their messenger CLI (tg, max, wa) with the profile signed in to each chat's account, or the one --sync-profile " +
        "names when several are; proposes and confirms nothing. A partial answer exits 0 with meta.complete false",
    )
    .summary("find what the store holds about a project: names, words, people, linked chats")
    .argument("<project>", "an existing project's id, key, exact name or alias, or a new project's name")
    .requiredOption("--source <accounts>", `where to look, or all: ${ACCOUNTS_HELP}`)
    .option("--alias <name>", "another name of the project, searched on its own; repeat for more", collect, [])
    .option("--context-query <words>", "more words that all appear in one text; repeat for another search", collect, [])
    .option(
      "--contact <person>",
      "a name to search, or person:<id> to read what that person's stored identities wrote and search the aliases " +
        "you gave them; what only names them or comes from them is context, not the project",
      collect,
      [],
    )
    .option("--since-time <time>", "how far back: days (90d, at most 730d) or a start date (2026-09-01)", "60d")
    .option("--before-time <time>", "fixed exclusive end: ISO 8601 timestamp with UTC offset; days back count from it")
    .option("--limit <n>", "new references at most, up to 500", positive, 100)
    .option("--max-pages <pages>", "store pages read at most this run, up to 512", positive)
    .option("--cursor <cursor>", "continue a stopped search from its checkpoint, with the same options")
    .option("--before-n <n>", "messages before each message hit, shown as its context, at most 5", whole, 2)
    .option("--after-n <n>", "messages after each message hit, shown as its context, at most 5", whole, 2)
    .option("--no-catch-up", "read the search index as it is, without indexing new mail and documents first")
    .addOption(
      cliOnly(
        new Option(
          "--sync-first",
          "first sync the linked chats the store does not hold back to --since-time, through their messenger CLI; " +
            "off by default",
        ),
      ),
    )
    .addOption(
      cliOnly(new Option("--sync-time <duration>", "time for all of --sync-first's syncs together").default("3m")),
    )
    .addOption(
      cliOnly(
        new Option(
          "--sync-profile <tool=profile>",
          "the messenger profile to sync as when several are signed in to a chat's account, such as max=default; " +
            "repeat for another tool. It must be signed in to that account",
        ).argParser(syncProfileOf),
      ),
    )
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (project: string, options: Options) => {
      const maxFetchMs = parseDuration(options.syncTime, "--sync-time")
      const chosen = options.syncProfile ?? {}
      const found = await withStore(env, async (store) =>
        gatherStoredProject(store, {
          project,
          sources: await contextSourcesOf(store, env, options.source),
          ...projectWindowOf(options.sinceTime),
          ...(options.beforeTime === undefined ? {} : { asOf: projectCutoffTime(options.beforeTime) }),
          limit: options.limit,
          catchUp: options.catchUp,
          beforeN: options.beforeN,
          afterN: options.afterN,
          ...(options.alias ? { aliases: options.alias } : {}),
          ...(options.contextQuery ? { keywords: options.contextQuery } : {}),
          ...(options.contact ? { people: options.contact } : {}),
          ...(options.maxPages === undefined ? {} : { maxReads: options.maxPages }),
          ...(options.cursor === undefined ? {} : { checkpoint: options.cursor }),
          ...(options.syncFirst ? { fetcher: messengerFetcher({ env, note: warn, chosen }), maxFetchMs } : {}),
        }),
      )
      const since = new Date(found.window.after).toISOString().slice(0, 10)
      const syncs = found.linkedChats.map((one) =>
        one.completeness === null || one.completeness.state === "complete" ? null : chatSync(one, since, env, chosen),
      )
      const parts = projectAnswerParts(options.sinceTime, found)
      const blocked = [...new Set(syncs.flatMap((one) => (one && one.command === null ? [one.why] : [])))]
      const missing = [...(parts.missing ?? []), ...blocked.map((why) => ({ field: "sync_command", why }))]
      print(
        options.json,
        itemAnswer(
          {
            ...found,
            linkedChats: found.linkedChats.map((one, i) => ({ ...one, syncCommand: syncs[i]?.command ?? null })),
          },
          { ...parts, ...(missing.length ? { missing } : {}) },
        ),
        projectEvidenceText(found, {
          sync: (chat, at) => syncHint(chat, at, env, chosen),
          showDocument: "memo notes show",
        }),
      )
    })
