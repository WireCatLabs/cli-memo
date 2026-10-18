import { metaOf } from "@wirecat/cli-base/commands"
import { changesAuthority, isStoreChange, readOnlyLockOf, readOnlyRefusal } from "@wirecat/cli-core/cli"
import type { Command } from "commander"
import { APP } from "./app.js"

const refusalOf = (command: Command): string | undefined => {
  const { effects, lifetime } = metaOf(command)
  // `mcp` keeps serving reads; the server leaves its writing tools out instead.
  if (lifetime === "persistent") return undefined
  if (changesAuthority(command) && command.opts().check !== true) return "install another version"
  if (command.opts().allowRemote === true) return "send evidence to a model off this machine"
  if (effects?.remote === "write") return "change mail at the provider"
  if (isStoreChange(command)) return "change memo's store or files"
  return undefined
}

/**
 * WC-PERM-12: under MEMO_READ_ONLY every change is refused with permission_error (exit 5) before the action runs.
 * A sync still receives, and a local write fails closed: nothing here marks one as harmless.
 */
export const refuseWritesUnderLock = (program: Command, env: NodeJS.ProcessEnv): void => {
  program.hook("preAction", (_root, command) => {
    const lock = readOnlyLockOf(APP, env)
    if (lock === undefined) return
    const refusal = refusalOf(command)
    if (refusal !== undefined) throw readOnlyRefusal(lock, refusal)
  })
}

export const readOnly = (env: NodeJS.ProcessEnv): boolean => readOnlyLockOf(APP, env) !== undefined
