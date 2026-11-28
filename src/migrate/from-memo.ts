import {
  closeSync,
  cpSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { dirname, join } from "node:path"
import { isMovedRun, type KeyringStore, type Paths, resolvePaths, systemKeyring } from "@wirecat/cli-base"
import { type ServerSystem, thisMachine } from "@wirecat/cli-core/background"
import { pauseSchedule, readSchedule, type Schedule, writeSchedule } from "@wirecat/cli-core/cli"
import { APP } from "../app.js"
import { applyAuto, autoState, unitDir } from "../run/auto.js"
import { replaceMemoSkill } from "./skill.js"

/** memo's names before the rename: its folders, its variables, its keyring service and its units. */
export const OLD_APP = { ...APP, command: "memo", appName: "cli-memo", envPrefix: "MEMO" }
const OLD_JOBS_UNIT = "memo-import"
const NEW_PREFIX = `${APP.envPrefix}_`
const OLD_PREFIX = `${OLD_APP.envPrefix}_`

export const MARKER = "migrated-from-memo.json"
const PENDING_SCHEDULES = "migrating-schedules.json"
const LOCK_STALE_MS = 5 * 60_000

/** The keyring accounts memo and the cli-core code it calls write under its own service, besides one per AI address. */
const FIXED_ACCOUNTS = [
  "embeddings:openai",
  "embeddings:anthropic",
  "embeddings:endpoint:openai",
  "embeddings:endpoint:anthropic",
  // A key the owner stored by hand under the provider's own name, which cli-core still reads.
  "openai",
  "anthropic",
  "registries:cas",
]

export interface Migration {
  env: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
  /** The account's own home; tests pass their temp home so the run does not count as moved. */
  home?: string
  keyring?: KeyringStore
  system?: ServerSystem
  warn?: (line: string) => void
}

type KeyringStep = "done" | "retry"
interface Marker {
  at: string
  keyring: KeyringStep
}

export type MigrationResult = "moved-run" | "done-before" | "busy" | "migrated" | "keyring-retried"

const isEmptyDir = (path: string): boolean => {
  try {
    return statSync(path).isDirectory() && readdirSync(path).length === 0
  } catch {
    return false
  }
}

const readJson = <T>(path: string): T | undefined => {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T
  } catch {
    return undefined
  }
}

/**
 * Moves one folder. Across file systems the copy goes to a sibling first and is renamed into place, so a copy cut
 * short never sits at the new name and passes for the moved folder on the next start.
 */
const moveFolder = (from: string, to: string): void => {
  mkdirSync(dirname(to), { recursive: true })
  try {
    renameSync(from, to)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error
    const partial = `${to}.moving`
    rmSync(partial, { recursive: true, force: true })
    cpSync(from, partial, { recursive: true, preserveTimestamps: true, verbatimSymlinks: true })
    renameSync(partial, to)
    rmSync(from, { recursive: true, force: true })
  }
  // On Windows state and cache share one cli-memo folder; it goes once both are out.
  try {
    if (isEmptyDir(dirname(from)) && dirname(from).endsWith(OLD_APP.appName)) rmdirSync(dirname(from))
  } catch {}
}

const KINDS = ["config", "state", "cache"] as const

/** Moves each folder that only memo has. Answers the kinds whose old and new folders both hold files. */
export const moveFolders = (old: Paths, now: Paths): (typeof KINDS)[number][] => {
  const kept: (typeof KINDS)[number][] = []
  for (const kind of KINDS) {
    if (!existsSync(old[kind])) continue
    if (existsSync(now[kind]) && !isEmptyDir(now[kind])) {
      kept.push(kind)
      continue
    }
    if (isEmptyDir(now[kind])) rmdirSync(now[kind])
    moveFolder(old[kind], now[kind])
  }
  return kept
}

/** The remote MCP login memo kept under its own name in its state folder, renamed where wcat's server looks. */
const moveHttpTokens = (state: string): void => {
  for (const ending of [".json", ".lock"]) {
    const from = join(state, "mcp-http", `memo${ending}`)
    const to = join(state, "mcp-http", `wcat${ending}`)
    if (existsSync(from) && !existsSync(to)) renameSync(from, to)
  }
}

/** `endpointKeyName` of cli-core: the name of a key kept per AI address that is not one of the two providers. */
const endpointKey = (url: string): string | undefined => {
  try {
    const host = new URL(url).host
    return ["openai", "anthropic"].includes(host) ? `endpoint:${host}` : host
  } catch {
    return undefined
  }
}

/** Every http(s) address in a settings file: a key for a custom AI address is named after its host. */
const addressesIn = (value: unknown): string[] => {
  if (typeof value === "string") return /^https?:\/\//.test(value) ? [value] : []
  if (Array.isArray(value)) return value.flatMap(addressesIn)
  if (value && typeof value === "object") return Object.values(value).flatMap(addressesIn)
  return []
}

export const keyringAccounts = (settingsFiles: readonly string[]): string[] => [
  ...new Set([
    ...FIXED_ACCOUNTS,
    ...settingsFiles
      .flatMap((file) => addressesIn(readJson(file)))
      .flatMap((url) => {
        const key = endpointKey(url)
        return key ? [`embeddings:${key}`] : []
      }),
  ]),
]

/**
 * Moves each entry from memo's keyring service to wcat's: read, write, read back and compare, and only then delete
 * the old one. No keyring at all (no D-Bus, a locked one that refuses) counts as done: a key kept in a file instead
 * lives in the config folder, which moved. Any other failure keeps the old entry for the next start.
 */
export const moveKeyring = (keyring: KeyringStore, accounts: readonly string[]): KeyringStep => {
  let failed = false
  for (const account of accounts) {
    let secret: string | null
    try {
      secret = keyring.get(OLD_APP.appName, account)
    } catch {
      return failed ? "retry" : "done"
    }
    if (secret === null) continue
    try {
      const present = keyring.get(APP.appName, account)
      // A key set under wcat already is the newer one; the old entry stays rather than lose a secret.
      if (present !== null && present !== secret) continue
      if (present === null) keyring.set(APP.appName, account, secret)
      if (keyring.get(APP.appName, account) !== secret) {
        failed = true
        continue
      }
      keyring.delete(OLD_APP.appName, account)
    } catch {
      failed = true
    }
  }
  return failed ? "retry" : "done"
}

const renamedVariables = (variables: Record<string, string>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(variables).map(([name, value]) => [
      name.startsWith(OLD_PREFIX) ? `${NEW_PREFIX}${name.slice(OLD_PREFIX.length)}` : name,
      value,
    ]),
  )

// Only before a command word, so "a memo to Kai" in a prompt stays as written.
const PROMPT_COMMAND =
  /\bmemo (?=(?:actions|answers|commands|context|digest|facts|guide|mail|meetings|memories|messages|organizations|people|projects|reminders|review|schedule|search|show|skill|sync|tags|tasks|templates)\b)/g

/** What an agent was asked in memo's words, in wcat's: the program name, and the two moved `mail` commands. */
export const renamedPrompt = (prompt: string): string =>
  prompt
    .replace(/\bmemo mail findings\b/g, "wcat review findings")
    .replace(/\bmemo mail review\b/g, "wcat review mail")
    .replace(PROMPT_COMMAND, "wcat ")

const renamedArgv = ({ kind, argv }: Schedule): string[] => {
  // An agent schedule made before its spec was saved runs its argv, prompt included.
  // `Bash(memo:*)` is the agent's allowed tool: with wcat's words in the prompt it has to allow wcat.
  if (kind === "agent") return argv.map((word) => renamedPrompt(word).replace(/^Bash\(memo([: ])/, "Bash(wcat$1"))
  if (argv[0] !== "mail") return argv
  if (argv[1] === "findings") return ["review", "findings", ...argv.slice(2)]
  if (argv[1] === "review") return ["review", "mail", ...argv.slice(2)]
  return argv
}

export const renamedSchedule = (schedule: Schedule): Schedule => {
  const argv = renamedArgv(schedule)
  return {
    ...schedule,
    argv,
    environment: renamedVariables(schedule.environment),
    ...(schedule.agent ? { agent: { ...schedule.agent, prompt: renamedPrompt(schedule.agent.prompt) } } : {}),
  }
}

const listSchedules = (state: string): Schedule[] => {
  const dir = join(state, "schedules")
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .map((name) => join(dir, name, "schedule.json"))
    .filter((file) => existsSync(file))
    .map((file) => readSchedule(file))
}

/**
 * Takes memo's schedules off their timers while their files are still in memo's folder, and keeps each as it was in a
 * file that moves with the folder, so `restoreSchedules` puts them back on wcat's timers even after a cut-short start.
 */
const holdSchedules = async (site: { env: NodeJS.ProcessEnv; system: ServerSystem }, state: string) => {
  // Held by a start that was cut short: those files are paused now, and the pending file has them as they were.
  if (existsSync(join(state, PENDING_SCHEDULES))) return
  const schedules = listSchedules(state)
  if (schedules.length === 0) return
  writeFileSync(join(state, PENDING_SCHEDULES), `${JSON.stringify(schedules, null, 2)}\n`, { mode: 0o600 })
  for (const schedule of schedules) {
    const profile = schedule.environment[`${OLD_PREFIX}PROFILE`] ?? ""
    await pauseSchedule({ app: OLD_APP, system: site.system, env: site.env, profile }, schedule.name, true)
  }
}

const restoreSchedules = async (
  site: { env: NodeJS.ProcessEnv; system: ServerSystem },
  state: string,
  warn: (line: string) => void,
) => {
  const pending = join(state, PENDING_SCHEDULES)
  const schedules = readJson<Schedule[]>(pending)
  if (schedules === undefined) return
  for (const schedule of schedules.map(renamedSchedule)) {
    const profile = schedule.environment[`${NEW_PREFIX}PROFILE`] ?? ""
    try {
      await writeSchedule({ app: APP, system: site.system, env: site.env, profile }, schedule)
    } catch (error) {
      warn(
        `wcat: schedule ${schedule.name} is not on a timer: ${(error as Error).message}; ` +
          `run wcat schedule resume ${schedule.name}`,
      )
    }
  }
  rmSync(pending, { force: true })
}

/** `Environment="PATH=…" "WCAT_CONFIG_DIR=…"` of a unit memo wrote: the timer keeps the PATH it was set up with. */
const unitEnvironment = (text: string): Record<string, string> => {
  const line = /^Environment=(.*)$/m.exec(text)?.[1] ?? ""
  return Object.fromEntries(
    [...line.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((match) => {
      const pair = (match[1] ?? "").replace(/\\(["\\])/g, "$1")
      return [pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1)]
    }),
  )
}

/**
 * Replaces `memo jobs`' systemd timer with wcat's, through the same writer `wcat jobs start` uses. The config, already
 * in wcat's folder, says whether the timer is on; its saved variables get wcat's prefix.
 */
const moveJobsTimer = async (env: NodeJS.ProcessEnv, configFile: string): Promise<void> => {
  const raw = readJson<{ auto?: { places?: Record<string, string> } }>(configFile)
  if (raw?.auto?.places && Object.keys(raw.auto.places).some((name) => name.startsWith(OLD_PREFIX))) {
    raw.auto.places = renamedVariables(raw.auto.places)
    writeFileSync(configFile, `${JSON.stringify(raw, null, 2)}\n`)
  }
  const oldService = join(unitDir(env), `${OLD_JOBS_UNIT}.service`)
  if (!existsSync(oldService) && !existsSync(join(unitDir(env), `${OLD_JOBS_UNIT}.timer`))) return
  const saved = existsSync(oldService) ? unitEnvironment(readFileSync(oldService, "utf8")) : {}
  const state = autoState(raw ?? {})
  await applyAuto(env, { ...state, enabled: false }, OLD_JOBS_UNIT)
  // The unit keeps the PATH memo's timer had; systemctl itself runs on this start's PATH.
  if (state.enabled) await applyAuto(env, state, undefined, saved.PATH ?? env.PATH)
}

/** Takes the lock beside wcat's state folder, or answers false while another start holds it. */
const lock = (path: string): (() => void) | undefined => {
  mkdirSync(dirname(path), { recursive: true })
  try {
    closeSync(openSync(path, "wx"))
  } catch {
    try {
      if (Date.now() - statSync(path).mtimeMs < LOCK_STALE_MS) return undefined
      rmSync(path, { force: true })
      closeSync(openSync(path, "wx"))
    } catch {
      return undefined
    }
  }
  return () => rmSync(path, { force: true })
}

/**
 * wcat's first start after memo: memo's config, state and cache folders, its keyring entries, its timers and its agent
 * skill move to wcat's names. A marker in wcat's state folder makes it once; a keyring step that failed is tried again
 * on the next start. A run with moved folders is a test or a sandbox and moves nothing. Nothing goes to stdout.
 */
export const migrateFromMemo = async ({
  env,
  platform = process.platform,
  home,
  keyring = systemKeyring,
  system,
  warn = () => undefined,
}: Migration): Promise<MigrationResult> => {
  const moved =
    isMovedRun({ appName: APP.appName, prefix: APP.envPrefix, env, platform, home }) ||
    isMovedRun({ appName: OLD_APP.appName, prefix: OLD_APP.envPrefix, env, platform, home })
  if (moved) return "moved-run"
  const now = resolvePaths({ appName: APP.appName, prefix: APP.envPrefix, env, platform })
  const old = resolvePaths({ appName: OLD_APP.appName, prefix: OLD_APP.envPrefix, env, platform })
  const markerPath = join(now.state, MARKER)
  const before = existsSync(markerPath) ? readJson<Marker>(markerPath) : undefined
  if (before && before.keyring === "done") return "done-before"
  const unlock = lock(`${now.state}.migrating`)
  if (!unlock) return "busy"
  try {
    const accounts = () =>
      keyringAccounts([
        join(now.config, "config.json"),
        join(resolvePaths({ appName: "WireCat", prefix: "WIRECAT", env, platform }).config, "config.json"),
      ])
    if (before) {
      const keys = moveKeyring(keyring, accounts())
      writeFileSync(markerPath, `${JSON.stringify({ ...before, keyring: keys })}\n`)
      return "keyring-retried"
    }
    const site = { env, system: system ?? thisMachine() }
    const stateMoves = existsSync(old.state) && (!existsSync(now.state) || isEmptyDir(now.state))
    if (stateMoves) await holdSchedules(site, old.state)
    const tasksOf = (appName: string, prefix: string) => resolvePaths({ appName, prefix, env, platform })
    // The task commands keep their settings in a folder of their own.
    const tasks = [tasksOf("cli-memo-tasks", "MEMO_TASKS"), tasksOf("wcat-tasks", "WCAT_TASKS")] as const
    for (const [from, to] of [[old, now], tasks] as const) {
      const kept = moveFolders(from, to)
      if (kept.length > 0)
        warn(
          `wcat: memo's ${kept.join(", ")} folder stayed where it was, because wcat's already holds files; ` +
            `wcat uses its own (${kept.map((kind) => to[kind]).join(", ")})`,
        )
    }
    moveHttpTokens(now.state)
    await restoreSchedules(site, now.state, warn)
    if (platform === "linux")
      await moveJobsTimer(env, join(now.config, "config.json")).catch((error: Error) =>
        warn(`wcat: memo's sync timer was not replaced: ${error.message}; run wcat jobs start`),
      )
    try {
      replaceMemoSkill(env)
    } catch (error) {
      warn(`wcat: memo's agent skill was not replaced: ${(error as Error).message}; run wcat skill install`)
    }
    const keys = moveKeyring(keyring, accounts())
    mkdirSync(now.state, { recursive: true })
    writeFileSync(markerPath, `${JSON.stringify({ at: new Date().toISOString(), keyring: keys } satisfies Marker)}\n`)
    return "migrated"
  } finally {
    unlock()
  }
}
