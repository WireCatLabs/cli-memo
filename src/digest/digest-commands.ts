import { existsSync } from "node:fs"
import { CliError } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import type { QueryRegistry } from "@wirecat/cli-base/query"
import { type ServerSystem, thisMachine } from "@wirecat/cli-core/background"
import {
  agentSchedule,
  type BaseEnvironment,
  type Body,
  calendarOf,
  environmentOf,
  grantsAuthority,
  HARNESSES,
  type Harness,
  harnessesOn,
  harnessInfo,
  harnessOfArgv,
  LOCAL_READ,
  LOCAL_WRITE,
  parseRoute,
  pauseSchedule,
  queryTerms,
  readSchedule,
  removeSchedule,
  reportsCost,
  routeText,
  runScheduleNow,
  type Schedule,
  type ScheduleSite,
  scheduleName,
  slotsOfAt,
  termField,
  withQuery,
  writeSchedule,
} from "@wirecat/cli-core/cli"
import { type Command, Option } from "commander"
import { itemAnswer, wholeList, withStore } from "../answer.js"
import { APP } from "../app.js"
import { authorOf, fromAppOption, whoRuns } from "../author.js"
import { scheduleLimits } from "../config.js"
import { setExitCode } from "../exit-code.js"
import { readOnly } from "../read-only.js"
import { agentInputOf, MAIL_CLI } from "../schedule/command.js"
import { checkedBrief, readBrief, refuseAgent } from "./brief.js"
import { sourcesOf } from "./command.js"
import {
  agentOf,
  briefAddress,
  DIGEST_PROMPT,
  DIGEST_SOURCES,
  type DigestAgent,
  type DigestSource,
  type DigestView,
  digestNames,
  digestOf,
  digestScheduleFile,
  dropDefinition,
  legacyClaudeDigest,
  MORNING_DIGEST,
  readDefinition,
  runsDigestSkill,
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
  agent?: Harness
  model?: string
  allowDangerous?: boolean
  paused?: boolean
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
      .addOption(
        new Option(
          "--agent <agent>",
          "the agent that writes it; a new digest takes the one agent installed, and asks when there are more. A " +
            "local model needs an agent set up to run one",
        ).choices(HARNESSES),
      )
      .option(
        "--model <model>",
        'the model the agent runs on: an alias such as sonnet or a model id; "" for the agent\'s own default',
      )
      .option(
        "--allow-dangerous",
        "let an agent whose own limits cannot hold it to memo's commands write it, where `memo schedule agents list` " +
          "says allowed_with_ack (codex): it may then run any program inside its sandbox. Only you give this",
      )
      .option(
        "--max-cost <usd>",
        "stop a run that costs more than this, in US dollars; only for an agent that reports its cost",
        usdOf("--max-cost", "above zero"),
      )
      .option(
        "--max-cost-per-day <usd>",
        "start no run for the rest of the day once its runs cost this much, in US dollars; 0 for no cap",
        usdOf("--max-cost-per-day", "zero"),
      )
      .option("--json", "print JSON"),
  )

/** The commands an old claude digest was allowed: memo's own and the mail CLI's. */
const LEGACY_TOOLS = [APP.command, MAIL_CLI.command].map((command) => `Bash(${command}:*)`)

/** What an existing digest's agent was asked, so an edit keeps it; an old file only in the shape memo saved it. */
const kept = (schedule: Schedule): DigestAgent =>
  agentOf(schedule) ??
  legacyClaudeDigest(schedule.argv, LEGACY_TOOLS) ?? { harness: harnessOfArgv(schedule.argv) ?? "claude", model: "" }

/** An agent no schedule may start, or one that needs `--allow-dangerous`, is refused before anything is asked. */
const refuseUnheld = (harness: Harness, accepted: boolean) => {
  const info = harnessInfo(harness)
  if (info.restricted || (info.allowedWithAck && accepted)) return
  throw new CliError(
    "permission_error",
    info.allowedWithAck
      ? `${info.name} writes a digest only with --allow-dangerous, as ${info.restrictedReason}`
      : `${info.name} cannot run on a schedule: ${info.restrictedReason}`,
    { reason: "agent.unrestricted", restricted_reason: info.restrictedReason },
  )
}

/** A cost cap typed for an agent that reports no cost would never stop it, so it is refused rather than kept. */
const refuseUncostedCap = (harness: Harness, given: Options) => {
  if (!reportsCost(harness) && (given.maxCost !== undefined || given.maxCostPerDay))
    throw new CliError(
      "validation_error",
      `${harness} reports no cost, so --max-cost and --max-cost-per-day cannot stop it; leave them out`,
      { reason: "agent.cost-unknown", param: given.maxCost !== undefined ? "max-cost" : "max-cost-per-day" },
    )
}

/**
 * A new digest's agent when none is given: the one installed. With none or several, the owner names it, because a
 * guessed agent may be one without credit.
 */
const installedAgent = (env: NodeJS.ProcessEnv): Harness => {
  const installed = harnessesOn(env, process.platform).filter((one) => one.installed)
  if (installed.length === 1 && installed[0]) return installed[0].id
  const choices = (installed.length ? installed : harnessesOn(env, process.platform)).map(({ id }) => id)
  throw new CliError(
    "validation_error",
    installed.length
      ? `more than one agent is installed; name the one that writes it: --agent ${choices.join("|")}`
      : `no agent is installed; install one and name it with --agent: ${choices.join(", ")}`,
    { param: "agent", reason: "digest.agent-unchosen", choices },
  )
}

/** A digest's schedule rebuilt for `agent`, keeping its notice, pause and creation time. */
const digestSchedule = (
  site: ScheduleSite,
  name: string,
  schedule: Schedule,
  agent: Omit<DigestAgent, "model" | "allowDangerous"> & {
    model: string | undefined
    maxCostPerDay: number | undefined
    allowDangerous?: boolean
    when: Schedule["when"]
    to: string[]
  },
): Schedule => ({
  ...agentSchedule(site, {
    name,
    harness: agent.harness,
    prompt: DIGEST_PROMPT,
    when: agent.when,
    ...(agent.model === undefined ? {} : { model: agent.model }),
    ...(agent.maxCost ? { maxCost: agent.maxCost } : {}),
    ...(agent.allowDangerous ? { allowDangerous: true } : {}),
    ...(agent.maxCostPerDay === undefined ? {} : { maxCostPerDay: agent.maxCostPerDay }),
    ...(schedule.notify ? { notify: schedule.notify } : {}),
    ...(agent.to.length ? { to: agent.to } : {}),
    ...(schedule.paused ? { paused: true } : {}),
  }),
  createdAt: schedule.createdAt,
})

export const digestCommands = (digest: Command, print: Print, env: NodeJS.ProcessEnv): void => {
  const siteOf = (command: Command): ScheduleSite => ({
    app: APP,
    system: environmentOf<BaseEnvironment & { system?: ServerSystem }>(command).system ?? thisMachine(),
    env,
    profile: "",
    agentRuns: [MAIL_CLI],
    limits: scheduleLimits(env),
  })
  /**
   * After cli-core 0.643.0 a timer runs only a schedule that keeps its `agent` (SEC-11). Each old claude digest whose
   * argv is the shape memo saved is saved again once, at the owner's first command; the rest wait in `digest list`.
   * Never in an agent's run or under the read-only lock, where a run could rewrite the owner's timers.
   */
  const saveOldDigests = async (command: Command) => {
    if (readOnly(env) || env[`${APP.envPrefix}_SCHEDULED`] || authorOf(env) !== "owner") return
    for (const name of digestNames(env)) {
      const file = digestScheduleFile(env, name)
      if (!existsSync(file)) continue
      try {
        const schedule = readSchedule(file)
        if (schedule.kind !== "agent" || schedule.agent !== undefined) continue
        const legacy = legacyClaudeDigest(schedule.argv, LEGACY_TOOLS)
        if (!legacy) continue
        const site = siteOf(command)
        await writeSchedule(
          site,
          digestSchedule(site, name, schedule, {
            ...legacy,
            maxCostPerDay: schedule.maxCostPerDay,
            when: schedule.when,
            to: schedule.to ?? [],
          }),
        )
      } catch {
        // A digest that cannot be saved again keeps its old file, and `digest list` says what it needs.
      }
    }
  }
  let root = digest
  while (root.parent) root = root.parent
  root.hook("preAction", (_root, action) => saveOldDigests(action))
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

  const listQuery = {
    entity: "digest",
    backend: "native",
    fields: [termField("name", "kw", "name:weekly")],
  } as const satisfies QueryRegistry
  withQuery(
    annotate(digest.command("list"), { effects: LOCAL_READ }).summary(
      "your digests: when each runs, what it reads, where it goes, last and next run",
    ),
    listQuery,
  )
    .option("--json", "print JSON")
    .action(async (words: string[], given: { json?: boolean }) => {
      const wanted = queryTerms(words, listQuery, "digest list").get("name")
      const names = digestNames(env).filter((name) => wanted === undefined || name === wanted)
      const items = await Promise.all(names.map(shown))
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
                  one.needs ? `needs you: ${one.needs}` : "",
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
      .argument("<name>", "lowercase letters, digits and dashes")
      .option("--paused", "make it without putting it on its timer; `memo digest resume` does"),
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
    const harness = given.agent ?? installedAgent(env)
    refuseUncostedCap(harness, given)
    refuseUnheld(harness, given.allowDangerous === true)
    await owner(command, `make the digest ${digestName}, a paid model call at each of its times?`)
    const site = siteOf(command)
    const schedule = agentSchedule(site, {
      name: digestName,
      harness,
      prompt: DIGEST_PROMPT,
      when,
      ...(given.model === undefined ? {} : { model: given.model }),
      ...(given.maxCost ? { maxCost: given.maxCost } : {}),
      ...(given.allowDangerous && harnessInfo(harness).allowedWithAck ? { allowDangerous: true } : {}),
      ...(given.maxCostPerDay === undefined ? {} : { maxCostPerDay: given.maxCostPerDay }),
      ...(given.deliverTo?.length ? { to: given.deliverTo } : {}),
      ...(given.paused ? { paused: true } : {}),
    })
    writeDefinition(env, {
      name: digestName,
      title: given.title?.trim() || digestName,
      sources: given.source === ALL || given.source === undefined ? [] : given.source,
      createdAt: new Date().toISOString(),
    })
    await writeSchedule(site, schedule)
    await saveBrief(digestName, given.text)
    await say(given.json, digestName, `Added ${digestName}${given.paused ? ", paused" : ""}.`)
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
    if (!runsDigestSkill(schedule))
      throw new CliError(
        "validation_error",
        `${name} runs a prompt of its own, made with \`memo schedule agent\`; an edit here would replace it — change it there`,
        { reason: "digest.own-prompt" },
      )
    const when = given.at?.length ? calendarOf(given.at.flatMap(slotsOfAt)) : schedule.when
    if (given.text !== undefined) checkedBrief(given.text)
    const previous = kept(schedule)
    const harness = given.agent ?? previous.harness
    const same = harness === previous.harness
    const accepted = given.allowDangerous ?? (same && previous.allowDangerous === true)
    refuseUncostedCap(harness, given)
    refuseUnheld(harness, accepted)
    await owner(command, `change the digest ${name}?`)
    const costed = reportsCost(harness)
    const rebuilt = digestSchedule(siteOf(command), name, schedule, {
      harness,
      // Another agent's model names mean nothing to this one; its default applies unless --model names one.
      model: given.model ?? (same ? previous.model : undefined),
      maxCost: costed ? (given.maxCost ?? previous.maxCost) : undefined,
      maxCostPerDay: costed ? (given.maxCostPerDay ?? schedule.maxCostPerDay) : undefined,
      allowDangerous: accepted && harnessInfo(harness).allowedWithAck,
      when,
      to: given.deliverTo ?? schedule.to ?? [],
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
    await writeSchedule(siteOf(command), rebuilt)
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
        if (last.exitCode !== 0) setExitCode(command, 1)
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
