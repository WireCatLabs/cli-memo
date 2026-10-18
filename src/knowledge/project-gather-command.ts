import { annotate } from "@wirecat/cli-base/commands"
import { type Body, LOCAL_READ } from "@wirecat/cli-core/cli"
import type { Command } from "commander"
import { itemAnswer, withStore } from "../answer.js"
import { collect, positive } from "../options.js"
import { ACCOUNTS_HELP } from "../store/source-list.js"
import { daysOf, gatherStoredProject, projectGatherText } from "./project-gathering.js"

interface Options {
  source: string
  contextQuery?: string[]
  contact?: string[]
  sinceTime: string
  limit: number
  maxPages?: number
  cursor?: string
  json?: boolean
}

export const projectGatherCommand = (
  projects: Command,
  print: (json: boolean | undefined, body: Body, text?: string) => void,
  env: NodeJS.ProcessEnv,
) =>
  annotate(projects.command("evidence"), { effects: LOCAL_READ })
    .description(
      "cited references about a project in stored messages, mail and imported notes folders. The project's name, " +
        "each of its aliases, each --context-query and each --contact name is its own literal search, and their " +
        "hits are joined. Reads only what the store holds; proposes and confirms nothing",
    )
    .summary("find what the store holds about a project, by its names, more words and people")
    .argument("<project>", "an existing project's id, key, exact name or alias, or a new project's name")
    .requiredOption("--source <accounts>", `where to look, or all: ${ACCOUNTS_HELP}`)
    .option("--context-query <words>", "more words that all appear in one text; repeat for another search", collect)
    .option("--contact <person>", "a person's name; what only names them is context, not the project", collect)
    .option("--since-time <time>", "how many days back, at most 730d", "60d")
    .option("--limit <n>", "new references at most, up to 500", positive, 100)
    .option("--max-pages <pages>", "store pages read at most this run, up to 512", positive)
    .option("--cursor <cursor>", "continue a stopped search from its checkpoint, with the same options")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (project: string, options: Options) => {
      const found = await withStore(env, (store) =>
        gatherStoredProject(store, env, {
          project,
          source: options.source,
          days: daysOf(options.sinceTime),
          limit: options.limit,
          ...(options.contextQuery ? { keywords: options.contextQuery } : {}),
          ...(options.contact ? { people: options.contact } : {}),
          ...(options.maxPages === undefined ? {} : { maxReads: options.maxPages }),
          ...(options.cursor === undefined ? {} : { checkpoint: options.cursor }),
        }),
      )
      print(options.json, itemAnswer(found), projectGatherText(found))
    })
