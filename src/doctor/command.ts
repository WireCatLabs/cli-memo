import { existsSync, readdirSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { resolvePaths } from "@wirecat/cli-base"
import { SKILL_TARGETS, skillPath, skillVersion } from "@wirecat/cli-base/skill"
import {
  appDoctorCommand,
  DOCTOR_DEEP_OPTION,
  overrideSharedContract,
  privateFiles,
  rootOf,
  runsDirFor,
  storeSummary,
  withSqliteSidecars,
} from "@wirecat/cli-core/cli"
import { chosenTextModel, DEFAULT_TEXT_MODEL, textModelsFile } from "@wirecat/cli-core/services"
import { sharedModelsDirectory } from "@wirecat/cli-core/speech"
import { storePath } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { APP } from "../app.js"
import { inspectConfig } from "../config.js"
import { autoState, lastAutoRun, UNIT } from "../run/auto.js"
import { installer, PACKAGE } from "../update.js"
import { VERSION } from "../version.js"

/** Something a person should do, with the command that does it. */
interface Problem {
  what: string
  fix: string
}

/** The addresses an old config's `mail.accounts` names, to say which mailboxes the `mail` CLI should sync. */
const retiredMailAddresses = (mail: unknown): string[] => {
  const accounts = (mail as { accounts?: unknown } | null)?.accounts
  if (!Array.isArray(accounts)) return []
  return accounts
    .map((account) => (account as { address?: unknown } | null)?.address)
    .filter((address): address is string => typeof address === "string")
}

const unitPaths = (unit: string): string[] =>
  [...(/^ExecStart=(.*)$/m.exec(unit)?.[1] ?? "").matchAll(/"((?:[^"\\]|\\.)*)"/g)]
    .map(([, path]) => path?.replace(/\\(["\\])/g, "$1") ?? "")
    .filter((path) => path.startsWith("/"))

/** Everything wcat needs, read from this computer only: no mail server, no messenger, no npm. */
export const diagnose = async (env: NodeJS.ProcessEnv, program: Command, { deep = false }: { deep?: boolean } = {}) => {
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

  const store = await storeSummary(env, { deep, command: "wcat", version: APP.version })
  if ("damage" in store && store.damage) problems.push({ what: store.damage.what, fix: "wcat store recover" })
  else if ("error" in store && store.error) problems.push({ what: `the store cannot be read: ${store.error}`, fix: "" })
  if ("writable" in store && store.writable === false)
    problems.push({ what: "the store is from a newer version than this wcat", fix: "wcat upgrade" })

  if (config.mail !== undefined) {
    const addresses = retiredMailAddresses(config.mail)
    problems.push({
      what:
        "wcat no longer imports mail, so the config's mail settings do nothing; the mail CLI syncs " +
        `${addresses.length ? addresses.join(", ") : "each mailbox"} into the same store (mail <profile> session ` +
        "start --address <address>, then mail <profile> sync), and the mail already stored stays",
      fix: "wcat config unset mail",
    })
  }

  let textModel = DEFAULT_TEXT_MODEL
  try {
    textModel = chosenTextModel(env).id
  } catch (error) {
    problems.push({
      what: `the embedding model choice cannot be read: ${error instanceof Error ? error.message : String(error)}`,
      fix: `fix text_models in ${textModelsFile(env)}, or remove it to go back to ${DEFAULT_TEXT_MODEL}`,
    })
  }
  const modelDir = join(sharedModelsDirectory("text", env), textModel)
  const model = existsSync(modelDir) && readdirSync(modelDir).length > 0

  const state = autoState(config)
  const unitFile = join(
    env.XDG_CONFIG_HOME ?? join(env.HOME ?? homedir(), ".config"),
    "systemd",
    "user",
    `${UNIT}.service`,
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
    problems.push({ what: "the timer is on in the config but not installed", fix: "wcat jobs start" })
  if (missing.length > 0)
    problems.push({ what: `the timer runs a program that is gone: ${missing.join(", ")}`, fix: "wcat jobs start" })
  if (failing)
    problems.push({ what: `the timer has failed ${failing.runs} runs since ${failing.since}`, fix: "wcat jobs status" })

  const skills = SKILL_TARGETS.map((target) => {
    const path = skillPath(target, APP.appName, env)
    const version = existsSync(path) ? (skillVersion(readFileSync(path, "utf8")) ?? "unknown") : null
    return { target, path, version }
  })
  if (skills.some(({ version }) => version !== null && version !== VERSION))
    problems.push({ what: "an installed skill is from another wcat version", fix: "wcat skill install --for all" })

  return {
    wcat: { version: VERSION, node: process.version, installed_by: installer() },
    state: paths.state,
    cache: paths.cache,
    store,
    search_model: { name: textModel, path: modelDir, present: model },
    timer: { enabled: state.enabled, every: state.every, unit: unit ? unitFile : null, runs, failing },
    skills,
    files: files.checked
      ? { ...files, problems: files.problems.map(({ path, mode, want }) => ({ path, mode, want })) }
      : files,
    problems,
    fixes: files.checked ? files.problems.map(({ fix }) => fix) : [],
  }
}

type Diagnosis = Omit<Awaited<ReturnType<typeof diagnose>>, "fixes"> & {
  config: ReturnType<typeof inspectConfig>
  online?: { version: { current: string; latest: string | null; newer: boolean } }
}

const _yes = (value: boolean) => (value ? "yes" : "no")

const fileLines = (d: Diagnosis): string[] =>
  d.files.checked
    ? d.files.problems.map(
        ({ path, mode, want }) => `! ${path} is ${mode}, so others can read it; it should be ${want}`,
      )
    : []

const onlineLine = ({ version }: NonNullable<Diagnosis["online"]>): string =>
  version.latest === null
    ? "online     npm could not be reached"
    : version.newer
      ? `online     wcat ${version.latest} is published (this is ${version.current}) — wcat upgrade`
      : `online     wcat ${version.current} is the newest published`

export const doctorText = (d: Diagnosis): string =>
  [
    `wcat ${d.wcat.version} on Node ${d.wcat.node}, installed by ${d.wcat.installed_by}`,
    `config     ${d.config.path}${d.config.found ? "" : " (none yet)"}`,
    `state      ${d.state}`,
    `cache      ${d.cache}`,
    `store      ${d.store.path}${
      !d.store.exists
        ? " (none yet; the first wcat sync makes it)"
        : "schema" in d.store
          ? ` (schema ${d.store.schema}, wcat speaks ${d.store.speaks})`
          : ""
    }`,
    ...("health" in d.store && d.store.health
      ? [
          `health     ${d.store.health.ok ? "ok" : "DAMAGED"}, checked ${d.store.health.covers}${
            d.store.health.checked === "quick" ? " (wcat doctor --deep reads every page)" : ""
          }`,
        ]
      : []),
    `search     ${d.search_model.name} ${d.search_model.present ? "present" : "not downloaded — search is by words"}`,
    `timer      ${d.timer.enabled ? `on, every ${d.timer.every}` : "off"}`,
    ...d.skills.map((s) => `skill      ${s.path} ${s.version === null ? "(not installed)" : `(${s.version})`}`),
    ...(d.online ? [onlineLine(d.online)] : []),
    "",
    ...(d.problems.length + d.config.issues.length + fileLines(d).length === 0
      ? ["nothing needs attention"]
      : [
          ...d.config.issues.map(({ what, fix }) => `! ${what}${fix ? ` — ${fix}` : ""}`),
          ...fileLines(d),
          ...d.problems.map(({ what, fix }) => `! ${what}${fix ? ` — ${fix}` : ""}`),
        ]),
  ].join("\n")

const configOf = (env: NodeJS.ProcessEnv, command: Command) => {
  const { config: _config, ...report } = inspectConfig(env, rootOf(command))
  return report
}

export const doctorCommand = (): Command =>
  overrideSharedContract(
    appDoctorCommand(APP, null, {
      packageName: PACKAGE,
      config: configOf,
      local: async (env, command) => {
        const { fixes, ...diagnosis } = await diagnose(env, rootOf(command), {
          deep: command.opts<{ deep?: boolean }>().deep === true,
        })
        return {
          fields: diagnosis,
          notes: fixes.map((fix) => `to make it private: ${fix}`),
          failing: diagnosis.problems.length > 0,
        }
      },
      view: (item) => doctorText(item as unknown as Diagnosis),
    }),
    "wcat has no global --json, so doctor takes its own, and --deep reads every page of wcat's store.",
    (command) => {
      command
        .option("--deep", DOCTOR_DEEP_OPTION)
        .option("--json", "print JSON; --json=id,title keeps only those fields")
        .addHelpText(
          "after",
          "\nReads this computer only, unless --online: the config, the store, the search " +
            "model, the timer and the agent skill, each problem with the command that fixes it. --online also asks " +
            "npm whether a newer wcat is published, and nothing else leaves this computer. Exits 1 when something " +
            "other than the config file or a file mode needs attention; problems in the config file are listed in " +
            "config.issues, and files or folders other users can read in files.problems, and neither changes the exit " +
            "code.",
        )
    },
  )
