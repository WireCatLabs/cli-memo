import { existsSync } from "node:fs"
import { CliError } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { type ServerSystem, thisMachine } from "@wirecat/cli-core/background"
import {
  type AgentScheduleSpec,
  agentSchedule,
  type BaseEnvironment,
  type Body,
  calendarOf,
  environmentOf,
  grantsAuthority,
  LOCAL_READ,
  LOCAL_WRITE,
  parseRoute,
  pauseSchedule,
  removeSchedule,
  routeText,
  runScheduleNow,
  type Schedule,
  type ScheduleSite,
  scheduleName,
  slotsOfAt,
  writeSchedule,
} from "@wirecat/cli-core/cli"
import type { Command } from "commander"
import { itemAnswer, wholeList, withStore } from "../answer.js"
import { APP } from "../app.js"
import { fromAppOption, whoRuns } from "../author.js"
import { scheduleLimits } from "../config.js"
import { agentInputOf, MAIL_CLI } from "../schedule/command.js"
import { checkedBrief, readBrief, refuseAgent } from "./brief.js"
import { sourcesOf } from "./command.js"
import {
  briefAddress,
  DIGEST_PROMPT,
  DIGEST_SOURCES,
  type DigestSource,
  type DigestView,
  digestNames,
  digestOf,
  digestScheduleFile,
  dropDefinition,
  MORNING_DIGEST,
  readDefinition,
  runCapOf,
  viewOf,
  writeDefinition,
} from "./digests.js"

type Print = (json: boolean | undefined, body: Body, text?: string) => void

/** `--source all` and `--deliver-to none`: an edit's way to clear what an earlier one set. */
const ALL = "all"
const NONE = "none"

interface Options {
  title?: string
  at?: string[]
  source?: DigestSource[] | typeof ALL
  deliverTo?: string[]
  text?: string
  maxCost?: number
  maxCostPerDay?: number
  json?: boolean
  fromApp?: boolean
}

const usdOf = (flag: string, least: "zero" | "above zero") => (value: string) => {
  const usd = Number(value)
  if (!Number.isFinite(usd) || usd < 0 || (least === "above zero" && usd === 0))
    throw new CliError(
      "validation_error",
      `${flag} takes US dollars, ${least === "zero" ? "0 or more" : "more than 0"}; not "${value}"`,
      {
        param: flag,
      },
    )
  return usd
}

const routeOf = (route: string, routes: string[] = []) =>
  route === NONE ? [] : [...routes, routeText(parseRoute(route))]

const sourceOption = (value: string, before: DigestSource[] | typeof ALL = []) =>
  value.trim().toLowerCase() === ALL ? ALL : sourcesOf(value, before === ALL ? [] : before)

/** The options `add` and `edit` share; an edit replaces what each given option says and keeps the rest. */
const withDigestOptions = (command: Command) =>
  fromAppOption(
    command
      .option("--title <title>", "the name the digest is shown under")
      .option(
        "--at <HH:MM>",
        "when it runs: HH:MM every day, or 'mon,fri 09:00' on those days; repeat it for more times, as 08:30 and 18:00",
        (at: string, all: string[] = []) => [...all, at],
      )
      .option(
        "--source <accounts>",
        `what it reads, comma-separated or repeated: ${DIGEST_SOURCES.join(", ")}; ${ALL} (the default) reads everything`,
        sourceOption,
      )
      .option(
        "--deliver-to <route>",
        `where each run is sent: telegram-bot:<profile>/<chat> or email:<profile>/<address>; repeat it for more, ${NONE} for nowhere`,
        routeOf,
      )
      .option("--text <text>", "your brief: what to collect, what to skip, how much; at most 4000 characters")
      .option(
        "--max-cost <usd>",
        "stop a run that costs more than this, in US dollars",
        usdOf("--max-cost", "above zero"),
      )
      .option(
        "--max-cost-per-day <usd>",
        "start no run for the rest of the day once its runs cost this much, in US dollars; 0 for no cap",
        usdOf("--max-cost-per-day", "zero"),
      )
      .option("--json", "print JSON"),
  )

/** The harness, model and per-run cap an existing schedule's argv was made with, so an edit keeps them. */
const kept = (schedule: Schedule): Pick<AgentScheduleSpec, "harness" | "model" | "maxCost"> => {
  const { argv } = schedule
  const model = argv.indexOf("--model")
  const cap = runCapOf(argv)
  return {
    harness: argv[1] === "exec" ? "codex" : "claude",
    ...(model < 0 ? { model: "" } : { model: argv[model + 1] ?? "" }),
    ...(cap === null ? {} : { maxCost: cap }),
  }
}

export const digestCommands = (digest: Command, print: Print, env: NodeJS.ProcessEnv): void => {
  const siteOf = (command: Command): ScheduleSite => ({
    app: APP,
    system: environmentOf<BaseEnvironment & { system?: ServerSystem }>(command).system ?? thisMachine(),
    env,
    profile: "",
    agentRuns: [MAIL_CLI],
    limits: scheduleLimits(env),
  })
  // Each of these spends the owner's money, sets his timers or sends to his chats: he does it, never an agent.
  const owner = async (command: Command, question: string) => {
    refuseAgent(env)
    if ((await whoRuns(command, env, { question })) !== "owner")
      throw new CliError(
        "permission_error",
        "a digest spends your money and writes to your chats; you change or run it at a terminal or in WireCat Desktop",
        { reason: "digest.owner-only" },
      )
  }
  const shown = async (name: string): Promise<DigestView> =>
    viewOf(env, name, { brief: (await readBrief(env, name)) ?? null, limits: scheduleLimits(env) })
  const say = async (json: boolean | undefined, name: string, line: string) =>
    print(json, itemAnswer(await shown(name)), line)
  const saveBrief = async (name: string, text: string | undefined) => {
    if (text === undefined) return
    const body = checkedBrief(text)
    await withStore(env, async (store) => store.templates.save(briefAddress(name), body, "memo"))
  }

  annotate(digest.command("list"), { effects: LOCAL_READ })
    .summary("your digests: when each runs, what it reads, where it goes, last and next run")
    .option("--json", "print JSON")
    .action(async (given: { json?: boolean }) => {
      const items = await Promise.all(digestNames(env).map(shown))
      print(
        given.json,
        wholeList("digest list", items),
        items.length === 0
          ? "No digests. `memo digest add <name> --title … --at 08:30` makes one."
          : items
              .map((one) =>
                [
                  one.name,
                  one.title,
                  one.times.length
                    ? `${one.weekdays.length ? one.weekdays.join(",") : "daily"} ${one.times.join(", ")}`
                    : "no set time",
                  one.scheduled ? "on" : "paused",
                  one.sources.length ? `reads ${one.sources.join(", ")}` : "reads everything",
                  one.routes.length ? `to ${one.routes.join(", ")}` : "sent nowhere",
                  one.last ? `last ${one.last.at.slice(0, 16).replace("T", " ")} ${one.last.ok ? "ok" : "failed"}` : "",
                ]
                  .filter(Boolean)
                  .join("  "),
              )
              .join("\n"),
      )
    })

  withDigestOptions(
    grantsAuthority(annotate(digest.command("add"), { effects: LOCAL_WRITE }))
      .summary("make a digest: its times, sources, routes and brief, on its timer")
      .description(
        "make a digest: an agent that runs memo's morning-digest skill at the given times, reading from its previous " +
          "time (a weekly one reads the week) and only the sources given, and sends what it writes along the routes " +
          "given. It runs read only. Each run is a paid model call; only you make one",
      )
      .argument("<name>", "lowercase letters, digits and dashes"),
  ).action(async (name: string, given: Options, command: Command) => {
    const digestName = scheduleName(name)
    if (existsSync(digestScheduleFile(env, digestName)))
      throw new CliError(
        "validation_error",
        `${digestName} already exists; \`memo digest edit ${digestName}\` changes it`,
        {
          reason: "digest.exists",
        },
      )
    if (!given.at?.length)
      throw new CliError("validation_error", "say when: --at HH:MM, or --at 'mon 09:00'; repeat it for more times", {
        param: "at",
      })
    const when = calendarOf(given.at.flatMap(slotsOfAt))
    if (given.text !== undefined) checkedBrief(given.text)
    await owner(command, `make the digest ${digestName}, a paid model call at each of its times?`)
    const site = siteOf(command)
    const schedule = agentSchedule(site, {
      name: digestName,
      harness: "claude",
      prompt: DIGEST_PROMPT,
      when,
      ...(given.maxCost ? { maxCost: given.maxCost } : {}),
      ...(given.maxCostPerDay === undefined ? {} : { maxCostPerDay: given.maxCostPerDay }),
      ...(given.deliverTo?.length ? { to: given.deliverTo } : {}),
    })
    writeDefinition(env, {
      name: digestName,
      title: given.title?.trim() || digestName,
      sources: given.source === ALL || given.source === undefined ? [] : given.source,
      createdAt: new Date().toISOString(),
    })
    await writeSchedule(site, schedule)
    await saveBrief(digestName, given.text)
    await say(given.json, digestName, `Added ${digestName}.`)
  })

  withDigestOptions(
    grantsAuthority(annotate(digest.command("edit"), { effects: LOCAL_WRITE }))
      .summary("change a digest; each option given replaces what it says, the rest stays")
      .description(
        `change a digest: each option given replaces what it set before (--at all its times, --source all its sources, ` +
          `--deliver-to all its routes), and the rest stays as it was. --source ${ALL} reads everything again, ` +
          `--deliver-to ${NONE} sends nowhere. A paused digest stays paused. Only you change one`,
      )
      .argument("<name>", "the digest's name, as `memo digest list` shows it"),
  ).action(async (name: string, given: Options, command: Command) => {
    const { schedule } = digestOf(env, name)
    if (!schedule.argv.includes(DIGEST_PROMPT))
      throw new CliError(
        "validation_error",
        `${name} runs a prompt of its own, made with \`memo schedule agent\`; an edit here would replace it — change it there`,
        { reason: "digest.own-prompt" },
      )
    const when = given.at?.length ? calendarOf(given.at.flatMap(slotsOfAt)) : schedule.when
    if (given.text !== undefined) checkedBrief(given.text)
    await owner(command, `change the digest ${name}?`)
    const site = siteOf(command)
    const previous = kept(schedule)
    const maxCost = given.maxCost ?? previous.maxCost
    const to = given.deliverTo ?? schedule.to ?? []
    const maxCostPerDay = given.maxCostPerDay ?? schedule.maxCostPerDay
    const rebuilt = agentSchedule(site, {
      name,
      harness: previous.harness,
      prompt: DIGEST_PROMPT,
      when,
      ...(previous.model === undefined ? {} : { model: previous.model }),
      ...(maxCost ? { maxCost } : {}),
      ...(maxCostPerDay === undefined ? {} : { maxCostPerDay }),
      ...(schedule.notify ? { notify: schedule.notify } : {}),
      ...(to.length ? { to } : {}),
      ...(schedule.paused ? { paused: true } : {}),
    })
    const definition = readDefinition(env, name)
    if (given.title !== undefined || given.source !== undefined || definition) {
      writeDefinition(env, {
        name,
        title: given.title?.trim() || definition?.title || (name === MORNING_DIGEST ? "Morning digest" : name),
        sources: given.source === ALL ? [] : (given.source ?? definition?.sources ?? []),
        createdAt: definition?.createdAt || schedule.createdAt,
      })
    }
    await writeSchedule(site, { ...rebuilt, createdAt: schedule.createdAt })
    await saveBrief(name, given.text)
    await say(given.json, name, `Changed ${name}.`)
  })

  fromAppOption(annotate(digest.command("run"), { effects: LOCAL_WRITE }))
    .summary("build a digest now and send it along its routes, or only some, or none")
    .description(
      "build a digest now, as its timer would, paused or not, and keep the run with its others; it is sent along " +
        "its routes, only along those --deliver-to names (each one of its own), or with --no-notify nowhere. A paid " +
        "model call: the day's cost cap holds, and only you run it",
    )
    .argument("<name>", "the digest's name, as `memo digest list` shows it")
    .option("--no-notify", "keep it here: send it nowhere")
    .option(
      "--deliver-to <route>",
      "send it only along this one of the digest's routes; repeat it for more",
      (route: string, routes: string[] = []) => [...routes, routeText(parseRoute(route))],
    )
    .option("--json", "print JSON")
    .action(
      async (name: string, given: { notify: boolean; deliverTo?: string[]; json?: boolean }, command: Command) => {
        const { file } = digestOf(env, name)
        if (!given.notify && given.deliverTo)
          throw new CliError("validation_error", "--no-notify sends nothing; leave out --deliver-to, or --no-notify", {
            param: "deliver-to",
          })
        await owner(command, `run the digest ${name} now, a paid model call?`)
        const routes = given.notify ? given.deliverTo : []
        const last = await runScheduleNow(command, siteOf(command), file, {
          agentInput: agentInputOf(env),
          ...(routes ? { routes } : {}),
        })
        if (!("exitCode" in last)) {
          print(
            given.json,
            itemAnswer({ name, skipped: true, ...last.skipped }),
            `${name}: skipped — ${last.skipped.why}`,
          )
          return
        }
        if (last.exitCode !== 0) process.exitCode = 1
        print(
          given.json,
          itemAnswer({ name, ...last }),
          `${name}: ${last.exitCode === 0 ? "built" : `failed (exit ${last.exitCode})`} — ${last.output}`,
        )
      },
    )

  for (const [verb, paused] of [
    ["pause", true],
    ["resume", false],
  ] as const)
    fromAppOption(grantsAuthority(annotate(digest.command(verb), { effects: LOCAL_WRITE })))
      .summary(
        paused
          ? "take a digest off its timer; it stays, and run still builds it"
          : "put a paused digest back on its timer",
      )
      .argument("<name>", "the digest's name, as `memo digest list` shows it")
      .option("--json", "print JSON")
      .action(async (name: string, given: { json?: boolean }, command: Command) => {
        digestOf(env, name)
        await owner(command, `${verb} the digest ${name}?`)
        await pauseSchedule(siteOf(command), name, paused)
        await say(given.json, name, paused ? `Paused ${name}.` : `Resumed ${name}.`)
      })

  fromAppOption(grantsAuthority(annotate(digest.command("remove"), { effects: LOCAL_WRITE })))
    .summary("remove a digest and its timer; its past runs, brief and templates stay")
    .argument("<name>", "the digest's name, as `memo digest list` shows it")
    .option("--json", "print JSON")
    .action(async (name: string, given: { json?: boolean }, command: Command) => {
      digestOf(env, name)
      await owner(command, `remove the digest ${name}?`)
      await removeSchedule(siteOf(command), name)
      dropDefinition(env, name)
      print(given.json, itemAnswer({ name, removed: true }), `Removed ${name}; its past runs stay.`)
    })
}
