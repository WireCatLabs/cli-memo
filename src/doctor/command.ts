import { execFile } from "node:child_process"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { resolvePaths, type Streams } from "@wirecat/cli-base"
import { annotate, customizeSharedCommand } from "@wirecat/cli-base/commands"
import { SKILL_TARGETS, skillPath, skillVersion } from "@wirecat/cli-base/skill"
import { isNewer } from "@wirecat/cli-base/update"
import {
  privateFiles,
  REMOTE_READ,
  runsDirFor,
  sharedCommandTemplate,
  storeSummary,
  withSqliteSidecars,
} from "@wirecat/cli-core/cli"
import { sharedModelsDirectory } from "@wirecat/cli-core/speech"
import { storePath } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { answers, itemAnswer } from "../answer.js"
import { APP } from "../app.js"
import { inspectConfig } from "../config.js"
import { SHELL_OVERRIDES } from "../contract-overrides.js"
import { noteFolders } from "../notes/folders.js"
import { autoState, lastAutoRun } from "../run/auto.js"
import { installer, latest } from "../update.js"
import { VERSION } from "../version.js"

const TEXT_MODEL = "e5-small"

/** Something a person should do, with the command that does it. */
interface Problem {
  what: string
  fix: string
}

const himalayaVersion = (env: NodeJS.ProcessEnv): Promise<string | null> =>
  new Promise((done) =>
    execFile(env.MEMO_HIMALAYA ?? "himalaya", ["--version"], { env, timeout: 3000 }, (error, stdout) =>
      done(error === null ? stdout.trim().split(/\r?\n/)[0] || "unknown" : null),
    ),
  )

const unitPaths = (unit: string): string[] =>
  [...(/^ExecStart=(.*)$/m.exec(unit)?.[1] ?? "").matchAll(/"((?:[^"\\]|\\.)*)"/g)]
    .map(([, path]) => path?.replace(/\\(["\\])/g, "$1") ?? "")
    .filter((path) => path.startsWith("/"))

/** Everything memo needs, read from this computer only: no mail server, no messenger, no npm. */
export const diagnose = async (env: NodeJS.ProcessEnv, program: Command) => {
  const problems: Problem[] = []
  const paths = resolvePaths({ appName: APP.appName, prefix: APP.envPrefix, env })
  // Config problems go to `config.issues`, the shape every WireCat doctor shares, not to `problems`.
  const { config, ...configReport } = inspectConfig(env, program)
  // The same files and folders the shared doctor checks; mail lives in the store.
  const files = privateFiles({
    files: [configReport.path, ...withSqliteSidecars(storePath(env))],
    // A folder the owner chose with MESSAGING_STORE may rightly be shared, like the home folder itself.
    dirs: [dirname(configReport.path), ...(env.MESSAGING_STORE ? [] : [dirname(storePath(env))]), runsDirFor(APP, env)],
  })

  const store = await storeSummary(env)
  if ("error" in store && store.error) problems.push({ what: `the store cannot be read: ${store.error}`, fix: "" })
  if ("writable" in store && store.writable === false)
    problems.push({ what: "the store is from a newer version than this memo", fix: "memo upgrade" })

  const folders = noteFolders(config.notes).map(({ path, id }) => ({
    path,
    exists: existsSync(path),
    bound: id !== null,
  }))
  for (const folder of folders) {
    if (!folder.exists)
      problems.push({
        what: `the notes folder ${folder.path} is missing`,
        fix: "connect its disk; if it moved, memo folders update <id> <new path>",
      })
    else if (!folder.bound)
      problems.push({
        what: `the notes folder ${folder.path} has no folder id`,
        fix: `memo folders add "${folder.path}"`,
      })
  }

  const accounts = (config.mail?.accounts ?? []).map(({ name, address, mode, path, rules }) => ({
    name,
    address,
    mode: mode ?? "gmail",
    ...(mode === "mbox" ? { path: path ?? null, exists: path !== undefined && existsSync(path) } : {}),
    /** Rules still in config.json; the next mail command moves them into the store. */
    rules_in_config: rules?.length ?? 0,
  }))
  const imap = accounts.some(({ mode }) => mode !== "mbox")
  const himalaya = imap ? await himalayaVersion(env) : null
  if (imap && himalaya === null)
    problems.push({ what: "himalaya is not on PATH, so mail cannot be read", fix: "install Himalaya (docs/mail.md)" })
  for (const account of accounts)
    if ("exists" in account && !account.exists)
      problems.push({ what: `the mbox file of mail account ${account.name} is missing`, fix: "check mail.accounts" })

  const modelDir = join(sharedModelsDirectory("text", env), TEXT_MODEL)
  const model = existsSync(modelDir) && readdirSync(modelDir).length > 0

  const state = autoState(config)
  const unitFile = join(
    env.XDG_CONFIG_HOME ?? join(env.HOME ?? homedir(), ".config"),
    "systemd",
    "user",
    "memo-import.service",
  )
  const unit = existsSync(unitFile) ? readFileSync(unitFile, "utf8") : undefined
  const runs = unit ? unitPaths(unit) : []
  const missing = runs.filter((path) => !existsSync(path))
  const last = lastAutoRun(env)
  const failing =
    last && last.exitCode !== 0
      ? { since: last.failingSince ?? last.at, runs: last.failures ?? 1, reason: last.reason ?? null }
      : null
  if (state.enabled && !unit)
    problems.push({ what: "the timer is on in the config but not installed", fix: "memo jobs start" })
  if (missing.length > 0)
    problems.push({ what: `the timer runs a program that is gone: ${missing.join(", ")}`, fix: "memo jobs start" })
  if (failing)
    problems.push({ what: `the timer has failed ${failing.runs} runs since ${failing.since}`, fix: "memo jobs status" })

  const skills = SKILL_TARGETS.map((target) => {
    const path = skillPath(target, APP.appName, env)
    const version = existsSync(path) ? (skillVersion(readFileSync(path, "utf8")) ?? "unknown") : null
    return { target, path, version }
  })
  if (skills.some(({ version }) => version !== null && version !== VERSION))
    problems.push({ what: "an installed skill is from another memo version", fix: "memo skill install --for all" })

  return {
    memo: { version: VERSION, node: process.version, installed_by: installer() },
    config: configReport,
    state: paths.state,
    cache: paths.cache,
    store,
    notes: folders,
    mail: { accounts, himalaya },
    search_model: { name: TEXT_MODEL, path: modelDir, present: model },
    timer: { enabled: state.enabled, every: state.every, unit: unit ? unitFile : null, runs, failing },
    skills,
    files: files.checked
      ? { ...files, problems: files.problems.map(({ path, mode, want }) => ({ path, mode, want })) }
      : files,
    problems,
    fixes: files.checked ? files.problems.map(({ fix }) => fix) : [],
  }
}

type Diagnosis = Omit<Awaited<ReturnType<typeof diagnose>>, "fixes">

const yes = (value: boolean) => (value ? "yes" : "no")

const fileLines = (d: Diagnosis, fixes: readonly string[]): string[] =>
  d.files.checked
    ? d.files.problems.map(
        ({ path, mode, want }, at) =>
          `! ${path} is ${mode}, so others can read it; it should be ${want} — ${fixes[at]}`,
      )
    : []

type Online = Awaited<ReturnType<typeof onlineCheck>>

const onlineLine = ({ version }: Online): string =>
  version.latest === null
    ? "online     npm could not be reached"
    : version.newer
      ? `online     memo ${version.latest} is published (this is ${version.current}) — memo upgrade`
      : `online     memo ${version.current} is the newest published`

export const doctorText = (d: Diagnosis, fixes: readonly string[] = [], online?: Online): string =>
  [
    `memo ${d.memo.version} on Node ${d.memo.node}, installed by ${d.memo.installed_by}`,
    `config     ${d.config.path}${d.config.found ? "" : " (none yet)"}`,
    `state      ${d.state}`,
    `cache      ${d.cache}`,
    `store      ${d.store.path}${
      !d.store.exists
        ? " (none yet; the first memo sync makes it)"
        : "schema" in d.store
          ? ` (schema ${d.store.schema}, memo speaks ${d.store.speaks})`
          : ""
    }`,
    ...d.notes.map((f) => `notes      ${f.path} — exists ${yes(f.exists)}, folder id ${yes(f.bound)}`),
    ...d.mail.accounts.map(
      (a) =>
        `mail       ${a.name} <${a.address}> ${a.mode}` +
        (a.rules_in_config
          ? `, ${a.rules_in_config} rules in the config, moved into the store by the next mail command`
          : ""),
    ),
    ...(d.mail.accounts.some(({ mode }) => mode !== "mbox") ? [`himalaya   ${d.mail.himalaya ?? "not found"}`] : []),
    `search     ${d.search_model.name} ${d.search_model.present ? "present" : "not downloaded — search is by words"}`,
    `timer      ${d.timer.enabled ? `on, every ${d.timer.every}` : "off"}`,
    ...d.skills.map((s) => `skill      ${s.path} ${s.version === null ? "(not installed)" : `(${s.version})`}`),
    ...(online ? [onlineLine(online)] : []),
    "",
    ...(d.problems.length + d.config.issues.length + fileLines(d, fixes).length === 0
      ? ["nothing needs attention"]
      : [
          ...d.config.issues.map(({ what, fix }) => `! ${what}${fix ? ` — ${fix}` : ""}`),
          ...fileLines(d, fixes),
          ...d.problems.map(({ what, fix }) => `! ${what}${fix ? ` — ${fix}` : ""}`),
        ]),
  ].join("\n")

const sharedDoctor = sharedCommandTemplate(APP, "doctor")
const ONLINE_FLAGS = "--online"
const onlineText = sharedDoctor.options.find((option) => option.long === ONLINE_FLAGS)?.description ?? ""

/** Same shape as cli-core's `appDoctorCommand` `--online` answer; memo has no account to read, only npm. */
const onlineCheck = async () => {
  const started = Date.now()
  const newest = await latest()
  return {
    ok: true,
    duration_ms: Date.now() - started,
    version: { current: VERSION, latest: newest ?? null, newer: newest !== undefined && isNewer(newest, VERSION) },
  }
}

const doctorCommandDefinition = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const { print } = answers(program, streams, env)
  annotate(program.command("doctor"), { effects: REMOTE_READ })
    .description(sharedDoctor.description())
    .option(ONLINE_FLAGS, onlineText)
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .addHelpText(
      "after",
      "\nReads this computer only, unless --online: the config, the store, the notes folders, Himalaya, the search " +
        "model, the timer and the agent skill, each problem with the command that fixes it. --online also asks npm " +
        "whether a newer memo is published, and nothing else leaves this computer. Exits 1 when something other than " +
        "the config file or a file mode needs attention; problems in the config file are listed in config.issues, and " +
        "files or folders other users can read in files.problems, and neither changes the exit code.",
    )
    .action(async (options: { json?: boolean; online?: boolean }) => {
      const { fixes, ...diagnosis } = await diagnose(env, program)
      const online = options.online ? await onlineCheck() : undefined
      print(
        options.json,
        itemAnswer(online ? { ...diagnosis, online } : diagnosis),
        doctorText(diagnosis, fixes, online),
      )
      if (options.json) for (const fix of fixes) streams.diagnostic(`to make it private: ${fix}`)
      if (diagnosis.problems.length > 0) process.exitCode = 1
    })
}

export const doctorCommand = (...args: Parameters<typeof doctorCommandDefinition>) => {
  customizeSharedCommand(
    sharedCommandTemplate(APP, "doctor"),
    "Memo diagnoses imported-data paths and stored account configuration without connecting to a messenger or querying a keyring.",
    () => {
      doctorCommandDefinition(...args)
      const command = args[0].commands.find((command) => command.name() === "doctor")
      if (!command) throw new Error("doctor builder did not install its command")
      return command
    },
    SHELL_OVERRIDES.doctor,
  )
}
