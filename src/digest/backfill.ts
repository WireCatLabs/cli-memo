import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { CliError, type Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import {
  backfillScheduleRun,
  LOCAL_WRITE,
  readSchedule,
  SCHEDULE_DEFAULTS,
  scheduleFile,
  spentToday,
} from "@wirecat/cli-core/cli"
import type { Command } from "commander"
import { answers, itemAnswer } from "../answer.js"
import { APP } from "../app.js"
import { fromAppOption, whoRuns } from "../author.js"
import { scheduleLimits } from "../config.js"
import { briefCommand } from "./brief.js"
import { DIGEST_SCHEDULE, digestSchedule, runTime } from "./tasks.js"

const DAY = 86_400_000
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/

interface Options {
  from: string
  to: string
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

/** Each day from `from` to `to`, at the schedule's local time, as its timer would have started it. */
const daysOf = (from: Date, to: Date, time: string) => {
  const [hour, minute] = time.split(":").map(Number) as [number, number]
  const days: { date: string; at: number }[] = []
  for (const day = new Date(from); day <= to; day.setDate(day.getDate() + 1))
    days.push({
      date: localDate(day.getTime()),
      at: new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute).getTime(),
    })
  return days
}

/** What the agent reads first: which day it writes and the window its agenda reads, as the skill expects them. */
const inputOf = (date: string, at: number) =>
  `backfill: ${date}\n` +
  `window: --since-time ${new Date(at - DAY).toISOString()} --before-time ${new Date(at).toISOString()}\n`

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
    .description("the morning digest: your brief on what it collects, and the digests of past days")
    .summary("the morning digest: your brief, past days")
  briefCommand(digest, print, env)
  fromAppOption(annotate(digest.command("backfill"), { effects: LOCAL_WRITE }))
    .summary("build the morning digests of past days, without sending them")
    .description(
      "build the morning digest each past day would have had: the morning-digest schedule's agent runs as its timer " +
        "does (the same skill, flags and cost caps), reading the agenda as of that day's run time, and the result is " +
        "kept as that day's run, marked backfill, for WireCat Desktop's digests screen. It is never sent to Telegram " +
        "or mail. A day that already has a digest is skipped. Without --yes it only prints what it would build and " +
        "the estimate: the days times the last digest run's cost. Each day is a paid model call: it stops once " +
        "today's runs cost the schedule's daily cap or a day fails, and only you run it, never an agent. The store " +
        "keeps what holds now, so a chat answered since reads as answered",
    )
    .requiredOption("--from <date>", "the first day, YYYY-MM-DD")
    .requiredOption("--to <date>", "the last day, YYYY-MM-DD; not a day whose run time is still ahead")
    .option("--yes", "build them; without it, only the estimate is printed")
    .option("--json", "print JSON")
    .action(async (given: Options, command: Command) => {
      const from = dateOf(given.from, "--from")
      const to = dateOf(given.to, "--to")
      if (from > to) throw new CliError("validation_error", "--from is after --to", { param: "--from" })
      const { state, schedule } = digestSchedule(env)
      if (!schedule)
        throw new CliError(
          "not_found",
          `no ${DIGEST_SCHEDULE} schedule to build from — memo skill show morning-digest says how to make one`,
          { reason: "backfill.no-schedule" },
        )
      const file = scheduleFile(state, schedule.name)
      const when = readSchedule(file).when
      if (!("daily" in when))
        throw new CliError(
          "validation_error",
          `${schedule.name} does not run at a daily time, so it has no past days`,
          {
            reason: "backfill.not-daily",
            schedule: schedule.name,
          },
        )
      const all = daysOf(from, to, when.daily)
      if ((all.at(-1)?.at ?? 0) > Date.now())
        throw new CliError("validation_error", `the ${given.to} digest's time has not come yet; --to an earlier day`, {
          param: "--to",
        })
      const runs = join(file, "..", "runs")
      const done = new Set(
        (existsSync(runs) ? readdirSync(runs) : [])
          .filter((name) => name.endsWith(".report.json"))
          .map((name) => localDate(runTime(name))),
      )
      const days = all.filter((day) => !done.has(day.date))
      const skipped = all.filter((day) => done.has(day.date)).map((day) => day.date)
      const lastCost = schedule.last?.costUsd
      const estimate = {
        days: days.map((day) => day.date),
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
          left.push(day.date)
          continue
        }
        const run = await backfillScheduleRun(command, APP, env, file, {
          at: new Date(day.at),
          input: inputOf(day.date, day.at),
        })
        built.push({ date: day.date, at: run.at, exitCode: run.exitCode, costUsd: run.costUsd ?? null })
      }
      const costUsd = cents(built.reduce((sum, one) => sum + (one.costUsd ?? 0), 0))
      if (built.some((one) => one.exitCode !== 0)) process.exitCode = 1
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
