import { metaOf } from "@wirecat/cli-base/commands"
import {
  changesAuthority,
  isStoreChange,
  readOnlyLockOf,
  readOnlyRefusal,
  setupPermissionCeiling,
} from "@wirecat/cli-core/cli"
import type { Command } from "commander"
import { APP } from "./app.js"

// cli-core 2.0.0's closed propose tier (PROPOSE_COMMANDS) still names memo's `mail findings add`; the cli-core
// release of the split names `review findings add`, and this line goes.
export const PROPOSES_HERE = "review findings add"

const pathOf = (command: Command): string => {
  const words: string[] = []
  for (let at: Command | null = command; at?.parent; at = at.parent) words.unshift(at.name())
  return words.join(" ")
}

const refusalOf = (command: Command): string | undefined => {
  const { effects, lifetime } = metaOf(command)
  // `mcp` keeps serving reads; writes remain discoverable but are refused.
  if (lifetime === "persistent") return undefined
  if (changesAuthority(command) && command.opts().check !== true) return "change what later runs may access"
  if (command.opts().allowRemote === true) return "send evidence to a model off this machine"
  if (effects?.remote === "write") return "change mail at the provider"
  if (isStoreChange(command) && pathOf(command) !== PROPOSES_HERE) return "change wcat's store or files"
  return undefined
}

/**
 * WC-PERM-12: under WCAT_READ_ONLY every change is refused with permission_error (exit 5) before the action runs.
 * A sync still receives, and a local write fails closed: nothing here marks one as harmless.
 */
/** WCAT_READ_ONLY, or the shared WireCat setup answer "read only", which another tool's `setup` changes. */
const lockOf = (env: NodeJS.ProcessEnv): string | undefined =>
  readOnlyLockOf(APP, env) ??
  (setupPermissionCeiling(env) === "readonly" ? "the WireCat setup answer; `tg setup` changes it" : undefined)

export const refuseWritesUnderLock = (program: Command, env: NodeJS.ProcessEnv): void => {
  program.hook("preAction", (_root, command) => {
    const lock = lockOf(env)
    if (lock === undefined) return
    const refusal = refusalOf(command)
    if (refusal !== undefined) throw readOnlyRefusal(lock, refusal)
  })
}

export const readOnly = (env: NodeJS.ProcessEnv): boolean => lockOf(env) !== undefined

export const readOnlyAvailability = (command: Command, env: NodeJS.ProcessEnv) => {
  const lock = lockOf(env)
  const refusal = lock === undefined ? undefined : refusalOf(command)
  return refusal === undefined ? { available: true } : { available: false, reason: `${lock}: cannot ${refusal}` }
}
