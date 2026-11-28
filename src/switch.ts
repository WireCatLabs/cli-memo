import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { CliError, createRenderer, resolvePaths, type Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { type FetchLike, hostFetch } from "@wirecat/cli-base/http"
import { type Installer, isNewer, latestVersion, updateCommand } from "@wirecat/cli-base/update"
import { FETCH, grantsAuthority, itemOf, LOCAL_WRITE, renderAnswer, snakeKeys } from "@wirecat/cli-core/cli"
import type { UpdateEnvironment } from "@wirecat/cli-core/update"
import { Command } from "commander"
import { APP } from "./app.js"
import { loadConfig } from "./config.js"
import { installer, latest, PACKAGE, runUpdate } from "./update.js"
import { VERSION } from "./version.js"

/** memo is now wcat: this is the last @wirecat/cli-memo, and `memo upgrade` moves to the new packages. */
export const WIRECAT = "@wirecat/wirecat"
export const FILES = "@wirecat/files-cli"
export const WIRECAT_PROGRAM = "wcat-wirecat"

/** The day the daily "run memo upgrade" line starts. Set to the release day of the split. */
export const SWITCH_NOTICE_FROM = "2026-11-28"

const DAY_MS = 24 * 60 * 60 * 1000

const SCOPE_EXEMPT = "--config.minimumReleaseAgeExclude=@wirecat/*"

/** The install and the removal for a package manager, or `undefined` where memo cannot run one. */
export const switchCommands = (
  installer: Installer,
  packages: readonly string[],
): { install: string[]; remove: string[] } | undefined => {
  const targets = packages.map((name) => `${name}@latest`)
  switch (installer) {
    case "npm":
      return { install: ["npm", "install", "-g", ...targets], remove: ["npm", "rm", "-g", PACKAGE] }
    // pnpm 11 holds a version back for a day; the new packages must install the day they ship.
    case "pnpm":
      return { install: ["pnpm", "add", "-g", ...targets, SCOPE_EXEMPT], remove: ["pnpm", "remove", "-g", PACKAGE] }
    case "bun":
      return { install: ["bun", "add", "-g", ...targets], remove: ["bun", "remove", "-g", PACKAGE] }
    default:
      return undefined
  }
}

export const byHand = (packages: readonly string[]) => `npm rm -g ${PACKAGE} && npm i -g ${packages.join(" ")}`

const hasNotesFolders = (env: NodeJS.ProcessEnv): boolean => {
  try {
    return (loadConfig(env).notes?.folders.length ?? 0) > 0
  } catch {
    return false
  }
}

export interface SwitchResult {
  current: string
  installer: Installer
  memoLatest: string | null
  wirecat: string | null
  packages: string[]
  commands: string[]
  switched: boolean
  removed: boolean
}

export interface SwitchEnvironment extends UpdateEnvironment {
  env?: NodeJS.ProcessEnv
}

const registry = (fetch: FetchLike | undefined) => fetch ?? hostFetch({ hosts: ["registry.npmjs.org"] })

export const upgradeCommand = (streams: Streams, environment: SwitchEnvironment = {}): Command =>
  annotate(upgradeAction(streams, environment), { effects: FETCH })

const upgradeAction = (streams: Streams, environment: SwitchEnvironment): Command =>
  grantsAuthority(
    annotate(new Command("upgrade"), {
      effects: LOCAL_WRITE,
      offline: false,
      examples: ["memo upgrade --check"],
    }),
    { unless: "check" },
  )
    .description("move to wcat: installs @wirecat/wirecat, removes memo; --check only looks")
    .option("--check", "say what would be installed and removed, and change nothing")
    .option("--json", "print JSON")
    .action(async function (this: Command, { check, json }: { check?: boolean; json?: boolean }) {
      if (this.optsWithGlobals<{ offline?: boolean }>().offline)
        throw new CliError("validation_error", "`memo upgrade` asks npm for the new packages; not with --offline")
      const format = json ? "json" : "pretty"
      const renderer = createRenderer({ format, color: false, streams })
      const context = { renderer, format, streams } as const
      const env = environment.env ?? process.env
      const run = (argv: string[]) => {
        renderer.note(`running: ${argv.join(" ")}`)
        return runUpdate(argv, environment)
      }

      const manager = installer(environment)
      const packages = hasNotesFolders(env) ? [WIRECAT, FILES] : [WIRECAT]
      const commands = switchCommands(manager, packages)
      const [memoLatest, wirecat] = await Promise.all([
        latest(environment),
        latestVersion(WIRECAT, registry(environment.fetch), { timeoutMs: 10_000 }),
      ])
      const result: SwitchResult = {
        current: VERSION,
        installer: manager,
        memoLatest: memoLatest ?? null,
        wirecat: wirecat ?? null,
        packages,
        commands: commands ? [commands.install.join(" "), commands.remove.join(" ")] : [byHand(packages)],
        switched: false,
        removed: false,
      }
      const answer = (line: string) => renderAnswer(this, context, itemOf(snakeKeys(result)), () => line)

      // A memo fix released after this one still comes first: its own upgrade then does the switch.
      const memoFix = memoLatest !== undefined && isNewer(memoLatest, VERSION)
      if (memoFix) {
        const argv = updateCommand(manager, PACKAGE)
        result.commands = argv ? [argv.join(" ")] : [`npm i -g ${PACKAGE}@latest`]
        if (check || !argv) return answer(`memo ${memoLatest} is out first: \`${result.commands[0]}\``)
        const code = await run(argv)
        if (code !== 0)
          throw new CliError("provider_error", `${argv[0]} exited with ${code}; memo is still ${VERSION}`, {
            reason: "upgrade.install-failed",
          })
        return answer(`memo ${VERSION} → ${memoLatest}. Run \`memo upgrade\` once more to move to wcat`)
      }
      if (wirecat === undefined)
        return answer(`${WIRECAT} is not on npm yet, so nothing was run. memo keeps working. Try again later`)
      if (check) return answer(`memo is now wcat: \`${result.commands.join(" && ")}\` moves to ${WIRECAT} ${wirecat}`)
      if (!commands) {
        renderer.warn(`cannot tell how memo was installed, so nothing was run`)
        return answer(`memo is now wcat. Move by hand: \`${byHand(packages)}\``)
      }

      // Install first: the new packages share no program name with memo, and a failed install leaves memo working.
      const installed = await run(commands.install)
      if (installed !== 0)
        throw new CliError(
          "provider_error",
          `${commands.install[0]} exited with ${installed}; memo is still installed and works`,
          { reason: "upgrade.install-failed" },
        )
      result.switched = true
      // wcat's first start writes the wcat launcher and moves memo's folders, keys and timers before memo goes.
      if ((await run([WIRECAT_PROGRAM, "--version"])) !== 0)
        renderer.warn(`${WIRECAT_PROGRAM} did not start; run \`wcat --version\` once it is on PATH`)
      const removed = await run(commands.remove)
      result.removed = removed === 0
      if (!result.removed) renderer.warn(`memo was not removed: \`${commands.remove.join(" ")}\``)
      renderer.note("agents: `claude mcp add wirecat -- wcat mcp serve` replaces the memo MCP server")
      return answer(`memo is now wcat ${wirecat}. Start with \`wcat --help\``)
    })

/** The once-a-day line that says to run `memo upgrade`, from `SWITCH_NOTICE_FROM` on. It never asks npm. */
export const switchNotice = (
  argv: readonly string[],
  { env = process.env, now = Date.now(), tty = process.stderr.isTTY === true } = {},
): string | undefined => {
  const quiet = ["--json", "--jsonl", "--quiet", "--help", "-h", "--version", "-V", "upgrade", "mcp", "complete"]
  if (!tty || env.MEMO_AUTO || env.MEMO_NO_UPDATE_CHECK) return undefined
  if (argv.some((word) => quiet.some((q) => word === q || word.startsWith(`${q}=`)))) return undefined
  if (now < Date.parse(SWITCH_NOTICE_FROM)) return undefined
  const path = join(resolvePaths({ appName: APP.appName, prefix: APP.envPrefix, env }).state, "switch-notice.json")
  try {
    const last = (JSON.parse(readFileSync(path, "utf8")) as { shownAt?: number }).shownAt ?? 0
    if (now - last < DAY_MS) return undefined
  } catch {}
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify({ shownAt: now }))
  } catch {
    return undefined
  }
  return "memo is now wcat. Run `memo upgrade` to move: your data, keys and timers come along"
}
