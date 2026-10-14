import { execFile } from "node:child_process"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { createRenderer, resolvePaths, type Streams } from "@wirecat/cli-base"
import { SKILL_TARGETS, skillPath, skillVersion } from "@wirecat/cli-base/skill"
import { storeSummary } from "@wirecat/cli-core/cli"
import { sharedModelsDirectory } from "@wirecat/cli-core/speech"
import type { Command } from "commander"
import { APP } from "../app.js"
import { type Config, configPath, loadConfig } from "../config.js"
import { noteFolders } from "../notes/folders.js"
import { metaOf, snakeKeys } from "../output.js"
import { autoState, lastAutoRun } from "../run/auto.js"
import { installer } from "../update.js"
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

const readConfig = (env: NodeJS.ProcessEnv): { config: Config; error?: string } => {
  try {
    return { config: loadConfig(env) }
  } catch (error) {
    return { config: {}, error: error instanceof Error ? error.message : String(error) }
  }
}

/** Everything memo needs, read from this computer only: no mail server, no messenger, no npm. */
export const diagnose = async (env: NodeJS.ProcessEnv) => {
  const problems: Problem[] = []
  const paths = resolvePaths({ appName: APP.appName, prefix: APP.envPrefix, env })
  const { config, error: configError } = readConfig(env)
  if (configError) problems.push({ what: `the config cannot be read: ${configError}`, fix: `fix ${configPath(env)}` })

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
    if (!folder.exists) problems.push({ what: `the notes folder ${folder.path} is missing`, fix: "memo folders" })
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
    rules: rules?.length ?? 0,
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
    problems.push({ what: "the timer is on in the config but not installed", fix: "memo auto start" })
  if (missing.length > 0)
    problems.push({ what: `the timer runs a program that is gone: ${missing.join(", ")}`, fix: "memo auto start" })
  if (failing)
    problems.push({ what: `the timer has failed ${failing.runs} runs since ${failing.since}`, fix: "memo auto status" })

  const skills = SKILL_TARGETS.map((target) => {
    const path = skillPath(target, APP.appName, env)
    const version = existsSync(path) ? (skillVersion(readFileSync(path, "utf8")) ?? "unknown") : null
    return { target, path, version }
  })
  if (skills.some(({ version }) => version !== null && version !== VERSION))
    problems.push({ what: "an installed skill is from another memo version", fix: "memo skill install --for all" })

  return {
    memo: { version: VERSION, node: process.version, installed_by: installer() },
    config: { path: configPath(env), exists: existsSync(configPath(env)) },
    state: paths.state,
    cache: paths.cache,
    store,
    notes: folders,
    mail: { accounts, himalaya },
    search_model: { name: TEXT_MODEL, path: modelDir, present: model },
    timer: { enabled: state.enabled, every: state.every, unit: unit ? unitFile : null, runs, failing },
    skills,
    problems,
  }
}

type Diagnosis = Awaited<ReturnType<typeof diagnose>>

const yes = (value: boolean) => (value ? "yes" : "no")

export const doctorText = (d: Diagnosis): string =>
  [
    `memo ${d.memo.version} on Node ${d.memo.node}, installed by ${d.memo.installed_by}`,
    `config     ${d.config.path}${d.config.exists ? "" : " (none yet)"}`,
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
    ...d.mail.accounts.map((a) => `mail       ${a.name} <${a.address}> ${a.mode}, ${a.rules} rules`),
    ...(d.mail.accounts.some(({ mode }) => mode !== "mbox") ? [`himalaya   ${d.mail.himalaya ?? "not found"}`] : []),
    `search     ${d.search_model.name} ${d.search_model.present ? "present" : "not downloaded — search is by words"}`,
    `timer      ${d.timer.enabled ? `on, every ${d.timer.every}` : "off"}`,
    ...d.skills.map((s) => `skill      ${s.path} ${s.version === null ? "(not installed)" : `(${s.version})`}`),
    "",
    ...(d.problems.length === 0
      ? ["nothing needs attention"]
      : d.problems.map(({ what, fix }) => `! ${what}${fix ? ` — ${fix}` : ""}`)),
  ].join("\n")

export const doctorCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  program
    .command("doctor")
    .description("where memo keeps its files and what needs attention; connects to nothing")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .addHelpText(
      "after",
      "\nReads this computer only: the config, the store, the notes folders, Himalaya, the search model, the timer " +
        "and the agent skill. Exits 1 when something needs attention, each with the command that fixes it.",
    )
    .action(async (options: { json?: boolean }) => {
      const startedAt = Date.now()
      const diagnosis = await diagnose(env)
      if (options.json)
        createRenderer({ format: "json", color: false, streams }).result({
          item: snakeKeys(diagnosis),
          meta: metaOf(startedAt),
        })
      else streams.data(`${doctorText(diagnosis)}\n`)
      if (diagnosis.problems.length > 0) process.exitCode = 1
    })
}
