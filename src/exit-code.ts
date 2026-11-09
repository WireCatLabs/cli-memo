import type { Command } from "commander"

type SetExitCode = (code: number) => void

const setters = new WeakMap<Command, SetExitCode>()

const rootOf = (command: Command): Command => {
  let root = command
  while (root.parent) root = root.parent
  return root
}

/** `startCli` hands each run its own setter; under `commands --serve` several runs share the one `process.exitCode`. */
export const keepExitCode = (program: Command, set: SetExitCode): void => {
  setters.set(program, set)
}

export const setExitCode = (command: Command, code: number): void => {
  const set = setters.get(rootOf(command))
  if (set) set(code)
  else process.exitCode = code
}
