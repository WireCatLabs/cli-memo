import { execFile } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { CliError, createRenderer, resolvePaths, type Streams } from "@wirecat/cli-base"
import { failingNotice, type LastRun, recordRun } from "@wirecat/cli-core/background"
import { type Command, InvalidArgumentError } from "commander"
import { type Config, loadConfig, updateConfig } from "../config.js"
import { snakeKeys } from "../output.js"

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

export const serviceUnit = (env: NodeJS.ProcessEnv): string =>
  [
    "[Unit]",
    "Description=memo: sync notes and mail into the shared store",
    "",
    "[Service]",
    "Type=oneshot",
    `ExecStart=${[process.execPath, memoBin(), "sync"].map(quote).join(" ")}`,
    // Himalaya and the keyring helper it calls are found on the PATH memo was set up with.
    `Environment=${quote(`PATH=${env.PATH ?? ""}`)} MEMO_AUTO=1`,
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
}

export const autoState = (config: Config): AutoState => ({
  enabled: config.auto?.enabled ?? false,
  every: config.auto?.every ?? DEFAULT_EVERY,
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
  const wanted = { [servicePath]: serviceUnit(env), [timerPath]: timerUnit(state.every) }
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

const failingOf = (last: LastRun | undefined) =>
  last && last.exitCode !== 0
    ? { since: last.failingSince ?? last.at, runs: last.failures ?? 1, reason: last.reason ?? null }
    : null

export const autoCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const run = systemctl(env)
  const auto = program.command("auto").description("run memo sync on a systemd user timer, set in the config")

  auto
    .command("start")
    .description("sync every --every (default auto.every, else 5m), starting a minute from now")
    .option("--every <interval>", "how often: 5m, 90s, 1h — a minute or more", interval)
    .action(async (options: { every?: string }) => {
      const config = updateConfig(
        (current) => ({ ...current, auto: { enabled: true, every: options.every ?? autoState(current).every } }),
        env,
      )
      await applyAuto(env, autoState(config))
      streams.data(`memo sync runs every ${autoState(config).every}.\n`)
    })

  auto
    .command("stop")
    .description("stop syncing on a timer and remove the timer")
    .action(async () => {
      const config = updateConfig((current) => ({ ...current, auto: { ...current.auto, enabled: false } }), env)
      await applyAuto(env, autoState(config))
      streams.data("memo sync no longer runs on a timer.\n")
    })

  auto
    .command("status")
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
      if (options.json) createRenderer({ format: "json", color: false, streams }).result(snakeKeys(status))
      else
        streams.data(
          `${status.enabled ? `on, every ${status.every}` : "off"} — timer ${status.timer}` +
            (status.next ? `, next ${status.next}` : "") +
            (status.last ? `, last ${status.last} (${status.lastResult ?? "?"})` : "") +
            (status.failing
              ? `\nfailing since ${status.failing.since} (${status.failing.runs} runs)` +
                (status.failing.reason ? `: ${status.failing.reason}` : "")
              : "") +
            "\n",
        )
    })
}
