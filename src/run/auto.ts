import { execFile } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { CliError, resolvePaths, type Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { installerOf } from "@wirecat/cli-base/update"
import { failingNotice, type LastRun, recordRun } from "@wirecat/cli-core/background"
import { LOCAL_READ, LOCAL_WRITE } from "@wirecat/cli-core/cli"
import { type Command, InvalidArgumentError } from "commander"
import { answers, itemAnswer } from "../answer.js"
import { type Config, loadConfig, updateConfig } from "../config.js"

export const DEFAULT_EVERY = "5m"
const UNIT = "memo-import"

const lastRunPath = (env: NodeJS.ProcessEnv): string =>
  join(resolvePaths({ appName: "cli-memo", prefix: "MEMO", env }).state, "auto", "last.json")

export const lastAutoRun = (env: NodeJS.ProcessEnv): LastRun | undefined => {
  try {
    return JSON.parse(readFileSync(lastRunPath(env), "utf8")) as LastRun
  } catch {
    return undefined
  }
}

/** Only the timer's own runs count: a sync started by hand is watched by whoever started it. */
export const recordAutoRun = (env: NodeJS.ProcessEnv, at: number, reason: string | undefined): void => {
  if (env.MEMO_AUTO !== "1") return
  recordRun(lastRunPath(env), {
    at: new Date(at).toISOString(),
    exitCode: reason === undefined ? 0 : 1,
    output: `journalctl --user -u ${UNIT}.service`,
    ...(reason === undefined ? {} : { reason }),
  })
}

export const autoNotice = (env: NodeJS.ProcessEnv): string | undefined =>
  env.MEMO_AUTO === "1"
    ? undefined
    : failingNotice("memo", [{ job: "sync", last: lastAutoRun(env) }], "memo auto status")

/** `5m`, `90s`, `1h` → systemd's `5min`, `90s`, `1h`; under a minute is refused. */
export const interval = (value: string): string => {
  const match = /^(\d+)(s|m|h)$/.exec(value.trim())
  const seconds = match === null ? 0 : Number(match[1]) * { s: 1, m: 60, h: 3600 }[match[2] as "s" | "m" | "h"]
  if (seconds < 60) throw new InvalidArgumentError("an interval of a minute or more, like 5m, 90s or 1h")
  return value.trim()
}

const systemdSpan = (every: string): string => every.replace(/m$/, "min")

const unitDir = (env: NodeJS.ProcessEnv): string =>
  join(env.XDG_CONFIG_HOME ?? join(env.HOME ?? homedir(), ".config"), "systemd", "user")

const quote = (arg: string): string => `"${arg.replace(/(["\\])/g, "\\$1")}"`

const memoBin = (): string => resolve(dirname(fileURLToPath(import.meta.url)), "../bin/memo.js")

/** The variables that move memo's folders and the store; the timer runs with the ones set at `memo auto start`. */
export const PLACE_VARIABLES = [
  "MEMO_CONFIG_DIR",
  "MEMO_STATE_DIR",
  "MEMO_CACHE_DIR",
  "MESSAGING_STORE",
  "WIRECAT_STATE_DIR",
] as const

export const placesOf = (env: NodeJS.ProcessEnv): Record<string, string> =>
  Object.fromEntries(PLACE_VARIABLES.flatMap((name) => (env[name] ? [[name, env[name]]] : [])))

export const serviceUnit = (env: NodeJS.ProcessEnv, places: Record<string, string> = {}): string =>
  [
    "[Unit]",
    "Description=memo: sync notes and mail into the shared store",
    "",
    "[Service]",
    "Type=oneshot",
    `ExecStart=${[process.execPath, memoBin(), "sync"].map(quote).join(" ")}`,
    // Himalaya and the keyring helper it calls are found on the PATH memo was set up with.
    `Environment=${[`PATH=${env.PATH ?? ""}`, ...Object.entries(places).map(([name, value]) => `${name}=${value}`)]
      .map(quote)
      .join(" ")} MEMO_AUTO=1`,
    "Nice=10",
    "",
  ].join("\n")

export const timerUnit = (every: string): string =>
  [
    "[Unit]",
    `Description=memo: sync notes and mail every ${every}`,
    "",
    "[Timer]",
    "OnActiveSec=1min",
    `OnUnitActiveSec=${systemdSpan(every)}`,
    "AccuracySec=30s",
    "",
    "[Install]",
    "WantedBy=timers.target",
    "",
  ].join("\n")

const systemctl =
  (env: NodeJS.ProcessEnv) =>
  (...args: string[]): Promise<string> =>
    new Promise((done, fail) =>
      execFile(env.MEMO_SYSTEMCTL ?? "systemctl", ["--user", ...args], { env }, (error, stdout, stderr) =>
        error === null
          ? done(stdout)
          : fail(
              new CliError("provider_error", `systemctl ${args.join(" ")}: ${stderr.trim() || error.message}`, {
                reason: "auto.systemctl-failed",
              }),
            ),
      ),
    )

export interface AutoState {
  enabled: boolean
  every: string
  places: Record<string, string>
}

export const autoState = (config: Config): AutoState => ({
  enabled: config.auto?.enabled ?? false,
  every: config.auto?.every ?? DEFAULT_EVERY,
  places: config.auto?.places ?? {},
})

/**
 * Makes the timer match the config: on with its interval, or gone. The config is the one source, so a
 * hand edit of `auto` takes effect at the next timer run, which calls this first.
 */
export const applyAuto = async (env: NodeJS.ProcessEnv, state: AutoState): Promise<void> => {
  const run = systemctl(env)
  const dir = unitDir(env)
  const timerPath = join(dir, `${UNIT}.timer`)
  const servicePath = join(dir, `${UNIT}.service`)
  if (!state.enabled) {
    if (!existsSync(timerPath) && !existsSync(servicePath)) return
    await run("disable", "--now", `${UNIT}.timer`).catch(() => "")
    rmSync(timerPath, { force: true })
    rmSync(servicePath, { force: true })
    await run("daemon-reload")
    return
  }
  const wanted = { [servicePath]: serviceUnit(env, state.places), [timerPath]: timerUnit(state.every) }
  const stale = Object.entries(wanted).filter(
    ([path, text]) => !existsSync(path) || readFileSync(path, "utf8") !== text,
  )
  if (stale.length === 0) return
  mkdirSync(dir, { recursive: true })
  for (const [path, text] of stale) writeFileSync(path, text)
  await run("daemon-reload")
  await run("enable", "--now", `${UNIT}.timer`)
  // A timer already running keeps its old interval until restarted.
  if (stale.some(([path]) => path === timerPath)) await run("restart", `${UNIT}.timer`)
}

/**
 * Where a global install of npm, pnpm or Bun keeps its packages. A memo in any other node_modules belongs to a
 * project or a tool's private folder, which can be deleted at any time.
 */
export const globalRoots = (env: NodeJS.ProcessEnv, execPath = process.execPath): string[] => {
  const home = env.HOME ?? homedir()
  const bin = dirname(execPath)
  const npmPrefix = env.npm_config_prefix ?? env.NPM_CONFIG_PREFIX
  return [
    resolve(bin, "..", "lib", "node_modules"),
    resolve(bin, "node_modules"),
    ...(npmPrefix ? [resolve(npmPrefix, "lib", "node_modules"), resolve(npmPrefix, "node_modules")] : []),
    "/usr/lib/node_modules",
    "/usr/local/lib/node_modules",
    resolve(env.PNPM_HOME ?? join(home, ".local", "share", "pnpm"), "global"),
    resolve(env.BUN_INSTALL ?? join(home, ".bun"), "install", "global"),
  ]
}

const isGlobal = (scriptPath: string, roots: string[]): boolean =>
  roots.some((root) => scriptPath.startsWith(`${root}/`) || scriptPath.startsWith(`${root}\\`))

/**
 * The timer runs the memo that last ran here: after `nvm use` and an install under the new Node, the
 * first memo command points the unit at it, so removing the old Node does not leave the timer broken.
 * Only a global install moves it: a checkout, `npx` or another tool's private install would point it at a
 * folder that goes away.
 */
export const followInstall = async (
  env: NodeJS.ProcessEnv,
  scriptPath?: string,
  roots = globalRoots(env),
): Promise<void> => {
  if (env.MEMO_AUTO === "1") return
  scriptPath ??= realpathSync(memoBin())
  if (!["npm", "pnpm", "bun"].includes(installerOf(scriptPath))) return
  if (!isGlobal(scriptPath, roots)) return
  const state = autoState(loadConfig(env))
  if (state.enabled) await applyAuto(env, state)
}

const failingOf = (last: LastRun | undefined) =>
  last && last.exitCode !== 0
    ? { since: last.failingSince ?? last.at, runs: last.failures ?? 1, reason: last.reason ?? null }
    : null

export const autoCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const run = systemctl(env)
  const { print } = answers(program, streams, env)
  const auto = program.command("auto").description("run memo sync on a systemd user timer, set in the config")

  annotate(auto.command("start"), { effects: LOCAL_WRITE })
    .description("sync every --every (default auto.every, else 5m), starting a minute from now")
    .option("--every <duration>", "how often: 5m, 90s, 1h — a minute or more", interval)
    .action(async (options: { every?: string }) => {
      const config = updateConfig(
        (current) => ({
          ...current,
          auto: { enabled: true, every: options.every ?? autoState(current).every, places: placesOf(env) },
        }),
        env,
      )
      await applyAuto(env, autoState(config))
      streams.data(`memo sync runs every ${autoState(config).every}.\n`)
    })

  annotate(auto.command("stop"), { effects: LOCAL_WRITE })
    .description("stop syncing on a timer and remove the timer")
    .action(async () => {
      const config = updateConfig((current) => ({ ...current, auto: { ...current.auto, enabled: false } }), env)
      await applyAuto(env, autoState(config))
      streams.data("memo sync no longer runs on a timer.\n")
    })

  annotate(auto.command("status"), { effects: LOCAL_READ })
    .description("whether the timer is on, its interval, its next run and how the last one ended")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (options: { json?: boolean }) => {
      const state = autoState(loadConfig(env))
      const show = async (unit: string, properties: string) =>
        Object.fromEntries(
          (await run("show", unit, "--property", properties).catch(() => ""))
            .split("\n")
            .filter(Boolean)
            .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
        )
      const timer = await show(`${UNIT}.timer`, "ActiveState")
      const service = await show(`${UNIT}.service`, "Result")
      // list-timers gives wall-clock times for every kind of timer; `show` leaves them empty for these.
      const listed = JSON.parse(
        (await run("list-timers", `${UNIT}.timer`, "--output=json").catch(() => "[]")) || "[]",
      )[0]
      const when = (micros: unknown) =>
        typeof micros === "number" && micros > 0 ? new Date(micros / 1000).toISOString() : null
      const status = {
        ...state,
        timer: timer.ActiveState ?? "unknown",
        next: when(listed?.next),
        last: when(listed?.last),
        lastResult: service.Result || null,
        failing: failingOf(lastAutoRun(env)),
      }
      print(
        options.json,
        itemAnswer(status),
        `${status.enabled ? `on, every ${status.every}` : "off"} — timer ${status.timer}` +
          (status.next ? `, next ${status.next}` : "") +
          (status.last ? `, last ${status.last} (${status.lastResult ?? "?"})` : "") +
          (status.failing
            ? `\nfailing since ${status.failing.since} (${status.failing.runs} runs)` +
              (status.failing.reason ? `: ${status.failing.reason}` : "")
            : ""),
      )
    })
}
