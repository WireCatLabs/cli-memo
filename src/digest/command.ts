import { CliError, type Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import type { Body } from "@wirecat/cli-core/cli"
import { LOCAL_READ, parseDuration } from "@wirecat/cli-core/cli"
import type { Command } from "commander"
import { itemAnswer, withStore } from "../answer.js"
import { APP } from "../app.js"
import { positive } from "../options.js"
import { gatherDigest, WATCH_TAG } from "./digest.js"
import { DIGEST_SOURCES, type DigestSource, readDefinition, runningDigest } from "./digests.js"
import { digestText, fitDigest } from "./text.js"

/** Roughly 10k tokens of mixed Russian and English: Cyrillic takes two bytes a letter and fewer letters a token. */
const COMPACT_BYTES = 40_000
const FULL_BYTES = 80_000
/** An owed reply older than this is left to `tasks agenda` and `mail review`, which read further back. */
const OWED_WITHIN = 7 * 86_400_000

interface Options {
  sinceTime: string
  beforeTime?: string
  limit: number
  maxOutputBytes?: number
  compact?: boolean
  json?: boolean
  source?: DigestSource[]
}

/** A digest's run keeps to the digest's sources even when its agent leaves out `--source`. */
const scheduledSources = (env: NodeJS.ProcessEnv): DigestSource[] =>
  env[`${APP.envPrefix}_SCHEDULED`] ? (readDefinition(env, runningDigest(env))?.sources ?? []) : []

/** `--source telegram,mail`, repeatable: what the agenda reads; each one a part it can leave out. */
export const sourcesOf = (value: string, before: DigestSource[] = []): DigestSource[] => {
  const words = value
    .split(",")
    .map((word) => word.trim().toLowerCase())
    .filter(Boolean)
  const unknown = words.filter((word) => !(DIGEST_SOURCES as readonly string[]).includes(word))
  if (unknown.length)
    throw new CliError("validation_error", `--source takes ${DIGEST_SOURCES.join(", ")}; not ${unknown.join(", ")}`, {
      param: "source",
    })
  return [...new Set([...before, ...(words as DigestSource[])])]
}

export const sinceOf = (value: string, now = Date.now()): number => {
  const since = /^\d{4}-\d{2}-\d{2}/.test(value) ? Date.parse(value) : now - parseDuration(value, "--since-time")
  if (Number.isNaN(since))
    throw new CliError("validation_error", `--since-time takes 12h, 7d or a date, not "${value}"`, {
      param: "since-time",
    })
  return since
}

/** A past moment, as an ISO time or a date (its local midnight); it must not be in the future. */
export const beforeOf = (value: string, now = Date.now()): number => {
  const at = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`).getTime() : Date.parse(value)
  if (!/^\d{4}-\d{2}-\d{2}/.test(value) || Number.isNaN(at))
    throw new CliError("validation_error", `--before-time takes an ISO time or a date, not "${value}"`, {
      param: "before-time",
    })
  if (at > now)
    throw new CliError("validation_error", "--before-time is in the future; leave it out for now", {
      param: "before-time",
    })
  return at
}

type Print = (json: boolean | undefined, body: Body) => void

/** `review agenda`: the morning digest an agent reads first, then follows only the `next` lines it prints. */
export const reviewAgendaCommand = (review: Command, print: Print, streams: Streams, env: NodeJS.ProcessEnv): void => {
  annotate(review.command("agenda"), { effects: LOCAL_READ })
    .summary("the morning digest: watch list, owed replies, mail, meetings, tasks, projects")
    .description(
      "the morning digest, from the store alone with no model call: everything new in what you tagged " +
        `${WATCH_TAG} (chats, mail threads, people, projects, a meeting's series), replies you owe to people in ` +
        "messengers and personal mail (not bots or service chats), new personal mail, meetings that ended, tasks, " +
        "projects that moved, memories and facts whose sources changed (source reviews raised since), proposals " +
        "waiting. Tasks are the open ones created since the last morning-digest run (a " +
        "day back when none ran) and those overdue, due today or due tomorrow, each with who asked and who does it. " +
        "Replies owed reach back 7 days; owed mail lists only senders you know (linked to a person with other " +
        "identities, or written to before), and mail from new senders is one count with the command that lists it. " +
        "Each item has its reference, who, when, one line of text and why it is there; a section cut by --limit or " +
        "--max-output-bytes says how many it left out and the command that reads them. `scope` says what was read " +
        "(the window, sources, counts), `tasks` counts each task group and, as `undated`, every open task with no due " +
        "date, and `health` names each account whose sync failed, that nothing syncs, or that is quiet for longer " +
        "than usual, so an unsynced account does not read as a quiet day; an account stored or synced within a day " +
        "is never named",
    )
    .option("--since-time <time>", "how far back: hours or days (12h, 7d) or a start date (2026-11-01)", "1d")
    .option(
      "--before-time <time>",
      "build it as of this past ISO time or date, for a past day's digest: --since-time counts back from it, and " +
        "what came later is left out; a chat or thread answered since reads as answered",
    )
    .option(
      "--source <accounts>",
      `only these, comma-separated or repeated: ${DIGEST_SOURCES.join(", ")}; watched items, projects and proposals stay. ` +
        "A digest's run reads the digest's own sources without it",
      sourcesOf,
    )
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
      const until = given.beforeTime === undefined ? undefined : beforeOf(given.beforeTime)
      const since = sinceOf(given.sinceTime, until)
      const gathered = await withStore(env, (store) =>
        gatherDigest(store, env, {
          since,
          ...(until === undefined ? {} : { until }),
          limit: given.limit,
          excerpt: given.compact ? 100 : 200,
          owedWithin: OWED_WITHIN,
          sources: given.source ?? scheduledSources(env),
        }),
      )
      const digest = fitDigest(gathered, given.maxOutputBytes ?? (given.compact ? COMPACT_BYTES : FULL_BYTES))
      // Not `print` for the text: its compact renderer would draw the answer generically, without the sections.
      if (given.json) print(true, itemAnswer(digest))
      else streams.data(`${digestText(digest)}\n`)
    })
}
