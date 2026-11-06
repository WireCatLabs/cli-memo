import { CliError, type Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import type { Body } from "@wirecat/cli-core/cli"
import { LOCAL_READ, parseDuration } from "@wirecat/cli-core/cli"
import type { Command } from "commander"
import { itemAnswer, withStore } from "../answer.js"
import { positive } from "../options.js"
import { gatherDigest, WATCH_TAG } from "./digest.js"
import { digestText, fitDigest } from "./text.js"

/** Roughly 10k tokens of mixed Russian and English: Cyrillic takes two bytes a letter and fewer letters a token. */
const COMPACT_BYTES = 40_000
const FULL_BYTES = 80_000
/** An owed reply older than this is left to `tasks agenda` and `mail review`, which read further back. */
const OWED_WITHIN = 7 * 86_400_000

interface Options {
  sinceTime: string
  limit: number
  maxOutputBytes?: number
  compact?: boolean
  json?: boolean
}

export const sinceOf = (value: string, now = Date.now()): number => {
  const since = /^\d{4}-\d{2}-\d{2}/.test(value) ? Date.parse(value) : now - parseDuration(value, "--since-time")
  if (Number.isNaN(since))
    throw new CliError("validation_error", `--since-time takes 12h, 7d or a date, not "${value}"`, {
      param: "since-time",
    })
  return since
}

type Print = (json: boolean | undefined, body: Body) => void

/** `review agenda`: the morning digest an agent reads first, then follows only the `next` lines it prints. */
export const reviewAgendaCommand = (review: Command, print: Print, streams: Streams, env: NodeJS.ProcessEnv): void => {
  annotate(review.command("agenda"), { effects: LOCAL_READ })
    .summary("the morning digest: watch list, owed replies, mail, meetings, tasks, projects")
    .description(
      "the morning digest, from the store alone with no model call: everything new in what you tagged " +
        `${WATCH_TAG} (chats, mail threads, people, projects, a meeting's series), replies you owe in messengers and ` +
        "personal mail, new personal mail, meetings that ended, tasks due or overdue, projects that moved, proposals " +
        "waiting. Replies owed reach back 7 days. Each item has its reference, who, when, one line of text and why " +
        "it is there; a section cut by --limit or --max-output-bytes says how many it left out and the command that " +
        "reads them. Coverage says how fresh " +
        "each account is, so a quiet account that was not synced does not read as a quiet day",
    )
    .option("--since-time <time>", "how far back: hours or days (12h, 7d) or a start date (2026-11-01)", "1d")
    .option("--limit <n>", "items per section before the size budget", positive, 25)
    .option(
      "--max-output-bytes <bytes>",
      "the text answer's size budget in bytes; 40000 with --compact, else 80000",
      positive,
    )
    .option("--compact", "one line per item, shorter excerpts, the smaller budget: for an agent")
    .option("--json", "print JSON")
    .action(async (given: Options) => {
      if (given.compact && given.json)
        throw new CliError("validation_error", "--compact and --json ask for different output — pick one", {
          reason: "output.conflict",
          param: "--compact",
        })
      const since = sinceOf(given.sinceTime)
      const gathered = await withStore(env, (store) =>
        gatherDigest(store, env, {
          since,
          limit: given.limit,
          excerpt: given.compact ? 100 : 200,
          owedWithin: OWED_WITHIN,
        }),
      )
      const digest = fitDigest(gathered, given.maxOutputBytes ?? (given.compact ? COMPACT_BYTES : FULL_BYTES))
      // Not `print` for the text: its compact renderer would draw the answer generically, without the sections.
      if (given.json) print(true, itemAnswer(digest))
      else streams.data(`${digestText(digest)}\n`)
    })
}
