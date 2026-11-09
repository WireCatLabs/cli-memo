import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { CliError, type Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import {
  backfillScheduleRun,
  type CalendarWhen,
  isCalendar,
  LOCAL_WRITE,
  nextRun,
  readSchedule,
  runsBetween,
  SCHEDULE_DEFAULTS,
  scheduleFile,
  slotsOf,
  spentToday,
} from "@wirecat/cli-core/cli"
import { type Command, Option } from "commander"
import { answers, itemAnswer } from "../answer.js"
import { APP } from "../app.js"
import { fromAppOption, whoRuns } from "../author.js"
import { scheduleLimits } from "../config.js"
import { setExitCode } from "../exit-code.js"
import { briefCommand } from "./brief.js"
import { digestCommands } from "./digest-commands.js"
import { agendaFlags, type DigestSource, isDigest, readDefinition, windowStart } from "./digests.js"
import { DIGEST_SCHEDULE, digestSchedule, runTime } from "./tasks.js"

const DAY = 86_400_000
const MINUTE = 60_000
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/

interface Options {
  sinceTime?: string
  untilTime?: string
  from?: string
  to?: string
  yes?: boolean
  json?: boolean
  fromApp?: boolean
}

interface Built {
  date: string
  at: string
  exitCode: number
  costUsd: number | null
}

const localDate = (at: number) => {
  const day = new Date(at)
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`
}

const dateOf = (value: string, flag: string): Date => {
  const [, year, month, day] = DATE.exec(value) ?? []
  const date = new Date(Number(year), Number(month) - 1, Number(day))
  if (!year || localDate(date.getTime()) !== value)
    throw new CliError("validation_error", `${flag} takes a date, YYYY-MM-DD, not "${value}"`, { param: flag })
  return date
}

/**
 * Each run the digest's timer would have started from the first day to the last, with the window it reads: from its
 * previous time, so a weekly digest reads a week and one at 08:30 and 18:00 reads since the other time.
 */
const runsOf = (when: CalendarWhen, from: Date, to: Date) => {
  const end = new Date(to)
  end.setDate(end.getDate() + 1)
  // Two runs on one day are told apart by their time; a digest that runs once a day keeps the plain date.
  const timed = new Set(slotsOf(when).map((slot) => slot.at)).size > 1
  return runsBetween(when, from.getTime(), end.getTime()).map((at) => ({
    date: localDate(at),
    label: timed ? `${localDate(at)} ${new Date(at).toTimeString().slice(0, 5)}` : localDate(at),
    at,
    since: windowStart(when, at),
    next: nextRun(when, at) ?? at + DAY,
  }))
}

/** What the agent reads first: which day it writes and the window its agenda reads, as the skill expects them. */
const inputOf = (date: string, at: number, since: number, sources: readonly DigestSource[]) =>
  `backfill: ${date}\nwindow: ${agendaFlags(since, sources)} --before-time ${new Date(at).toISOString()}\n`

const usd = (value: number) => `$${value.toFixed(2)}`
const cents = (value: number) => Math.round(value * 100) / 100

/**
 * `digest backfill`: the morning digest each past day would have had, built by the schedule's own agent with the
 * agenda as of that day's run time, kept as that day's run and sent nowhere. Each day is a paid model call, so it
 * prints the estimate unless --yes, and only the owner runs it.
 */
export const digestCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const { print } = answers(program, streams, env)
  const digest = program
    .command("digest")
    .description(
      "your digests: each a name, its times, what it reads, where it is sent and your brief; run one now, pause it, " +
        "and build past days",
    )
    .summary("your digests: times, sources, routes, brief, past days")
  briefCommand(digest, print, env)
  digestCommands(digest, print, env)
  fromAppOption(annotate(digest.command("backfill"), { effects: LOCAL_WRITE }))
    .summary("build a digest's past runs, without sending them")
    .description(
      "build each past run a digest would have had: its schedule's agent runs as its timer does (the same skill, " +
        "flags and cost caps), reading the agenda as of that run's time and from the digest's previous time, and the " +
        "result is kept as that run, marked backfill, for WireCat Desktop's digests screen. It is never sent to " +
        "Telegram or mail. A run that already has a digest is skipped. Without --yes it only prints what it would " +
        "build and the estimate: the runs times the last run's cost. Each run is a paid model call: it stops once " +
        "today's runs cost the schedule's daily cap or a run fails, and only you run it, never an agent. The store " +
        "keeps what holds now, so a chat answered since reads as answered",
    )
    .argument("[digest]", `the digest's name, as \`memo digest list\` shows it; ${DIGEST_SCHEDULE} when left out`)
    .option("--since-time <time>", "the first day, YYYY-MM-DD")
    .option("--until-time <time>", "the last day, YYYY-MM-DD; not a day whose run time is still ahead")
    // WireCat Desktop before 0.131.73's rename sends these; kept so an older app still builds past days.
    .addOption(new Option("--from <date>").hideHelp())
    .addOption(new Option("--to <date>").hideHelp())
    .option("--yes", "build them; without it, only the estimate is printed")
    .option("--json", "print JSON")
    .action(async (name: string | undefined, given: Options, command: Command) => {
      const since = given.sinceTime ?? given.from
      const until = given.untilTime ?? given.to
      if (since === undefined || until === undefined)
        throw new CliError("validation_error", "say which days: --since-time YYYY-MM-DD --until-time YYYY-MM-DD", {
          param: since === undefined ? "--since-time" : "--until-time",
        })
      const from = dateOf(since, "--since-time")
      const to = dateOf(until, "--until-time")
      if (from > to)
        throw new CliError("validation_error", "--since-time is after --until-time", { param: "--since-time" })
      const digestName = name ?? DIGEST_SCHEDULE
      if (digestName !== DIGEST_SCHEDULE && !isDigest(env, digestName))
        throw new CliError("not_found", `no digest ${digestName} — \`memo digest list\` names them`, {
          reason: "digest.not-found",
        })
      const { state, schedule } = digestSchedule(env, digestName)
      if (!schedule)
        throw new CliError(
          "not_found",
          `no ${digestName} schedule to build from — memo skill show morning-digest says how to make one`,
          { reason: "backfill.no-schedule" },
        )
      const file = scheduleFile(state, schedule.name)
      const when = readSchedule(file).when
      if (!isCalendar(when))
        throw new CliError("validation_error", `${schedule.name} does not run at set times, so it has no past runs`, {
          reason: "backfill.not-daily",
          schedule: schedule.name,
        })
      const sources = readDefinition(env, digestName)?.sources ?? []
      const all = runsOf(when, from, to)
      if ((all.at(-1)?.at ?? 0) > Date.now())
        throw new CliError(
          "validation_error",
          `the ${until} digest's time has not come yet; --until-time an earlier day`,
          {
            param: "--until-time",
          },
        )
      const runs = join(file, "..", "runs")
      const reported = (existsSync(runs) ? readdirSync(runs) : [])
        .filter((file) => file.endsWith(".report.json"))
        .map(runTime)
      // A run its timer started late, or a backfill a minute off, still counts as that time's digest.
      const done = (run: { at: number; next: number }) => reported.some((at) => at >= run.at - MINUTE && at < run.next)
      const days = all.filter((day) => !done(day))
      const skipped = all.filter(done).map((day) => day.label)
      const lastCost = schedule.last?.costUsd
      const estimate = {
        days: days.map((day) => day.label),
        skipped,
        estimateUsd: typeof lastCost === "number" ? cents(days.length * lastCost) : null,
      }
      const cap =
        readSchedule(file).maxCostPerDay ?? scheduleLimits(env).maxCostPerDay ?? SCHEDULE_DEFAULTS.maxCostPerDay

      if (!given.yes) {
        const room = cap > 0 ? cap - spentToday(file) : Number.POSITIVE_INFINITY
        print(
          given.json,
          itemAnswer(estimate),
          [
            `Would build ${days.length} day(s)${days.length ? `: ${estimate.days.join(", ")}` : ""}.`,
            ...(skipped.length ? [`Skipped, a digest exists: ${skipped.join(", ")}.`] : []),
            estimate.estimateUsd === null
              ? "No digest run has a cost yet, so there is no estimate."
              : `Estimate: ${usd(estimate.estimateUsd)} (${days.length} × the last run's ${usd(lastCost as number)}).`,
            ...(estimate.estimateUsd !== null && estimate.estimateUsd > room
              ? [`Today's cap leaves ${usd(Math.max(0, room))}: it stops there, and the rest waits for another day.`]
              : []),
            ...(days.length ? ["Build them, sending nothing: add --yes."] : []),
          ].join("\n"),
        )
        return
      }

      const who = await whoRuns(command, env, { question: `spend about ${usd(estimate.estimateUsd ?? 0)}?` })
      if (who !== "owner")
        throw new CliError(
          "permission_error",
          "a backfill spends the owner's money on model calls; the owner runs it at a terminal or in WireCat Desktop",
          { reason: "backfill.owner-only" },
        )
      const built: Built[] = []
      const left: string[] = []
      for (const day of days) {
        const failed = built.some((one) => one.exitCode !== 0)
        if (left.length || failed || (cap > 0 && spentToday(file) >= cap)) {
          left.push(day.label)
          continue
        }
        const run = await backfillScheduleRun(command, APP, env, file, {
          at: new Date(day.at),
          input: inputOf(day.date, day.at, day.since, sources),
        })
        built.push({ date: day.label, at: run.at, exitCode: run.exitCode, costUsd: run.costUsd ?? null })
      }
      const costUsd = cents(built.reduce((sum, one) => sum + (one.costUsd ?? 0), 0))
      if (built.some((one) => one.exitCode !== 0)) setExitCode(command, 1)
      print(
        given.json,
        itemAnswer({ ...estimate, built, left, costUsd }),
        [
          ...built.map(
            (one) =>
              `${one.date}: ${one.exitCode === 0 ? "built" : `failed (exit ${one.exitCode})`}${
                one.costUsd === null ? "" : `, ${usd(one.costUsd)}`
              }`,
          ),
          ...(skipped.length ? [`Skipped, a digest exists: ${skipped.join(", ")}.`] : []),
          ...(left.length
            ? [`Not built, after a failed day or once today's cap of ${usd(cap)} was spent: ${left.join(", ")}.`]
            : []),
          `Cost: ${usd(costUsd)}. Nothing was sent.`,
        ].join("\n"),
      )
    })
}
