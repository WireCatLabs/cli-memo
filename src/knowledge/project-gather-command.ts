import { annotate } from "@wirecat/cli-base/commands"
import { type Body, LOCAL_READ } from "@wirecat/cli-core/cli"
import type { Command } from "commander"
import { itemAnswer, withStore } from "../answer.js"
import { collect, positive, whole } from "../options.js"
import { ACCOUNTS_HELP } from "../store/source-list.js"
import { cutoffTime, gatherMeta, gatherStoredProject, projectGatherText, windowOf } from "./project-gathering.js"

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
  json?: boolean
}

export const projectGatherCommand = (
  projects: Command,
  print: (json: boolean | undefined, body: Body, text?: string) => void,
  env: NodeJS.ProcessEnv,
) =>
  annotate(projects.command("evidence"), { effects: LOCAL_READ })
    .description(
      "cited references about a project in stored messages, mail, meeting transcripts and imported notes folders. The project's name, " +
        "its key, each of its aliases and each --alias, each --context-query and each --contact name is its own search: every word of " +
        "it must appear in one text, in any order, as whole words; their hits are joined. Every message of a chat confirmed as the " +
        "project's (memo relationships add chat:<provider>/<account>/<chat> project:<id>) is read too, when --source holds its " +
        "account, and so is everything a confirmed person member of the project wrote (as --contact person:<id>, " +
        "without aliases). New mail and documents are indexed for search first, unless --no-catch-up. Reads only " +
        "what the store holds; proposes and confirms nothing",
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
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (project: string, options: Options) => {
      const found = await withStore(env, (store) =>
        gatherStoredProject(store, env, {
          project,
          source: options.source,
          ...windowOf(options.sinceTime),
          ...(options.beforeTime === undefined ? {} : { asOf: cutoffTime(options.beforeTime) }),
          limit: options.limit,
          catchUp: options.catchUp,
          beforeN: options.beforeN,
          afterN: options.afterN,
          ...(options.alias ? { aliases: options.alias } : {}),
          ...(options.contextQuery ? { keywords: options.contextQuery } : {}),
          ...(options.contact ? { people: options.contact } : {}),
          ...(options.maxPages === undefined ? {} : { maxReads: options.maxPages }),
          ...(options.cursor === undefined ? {} : { checkpoint: options.cursor }),
        }),
      )
      print(options.json, itemAnswer(found, { meta: gatherMeta(options.sinceTime, found) }), projectGatherText(found))
    })
