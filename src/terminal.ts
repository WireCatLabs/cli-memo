import type { Command } from "commander"

const MACHINE_FLAGS = new Set(["--json", "--jsonl"])

export const optionsOf = (args: readonly string[]) => {
  const end = args.indexOf("--")
  return end < 0 ? args : args.slice(0, end)
}

/** A person at a terminal who did not ask for machine output. */
export const interactiveOf = (args: readonly string[], tty: boolean) =>
  tty && !optionsOf(args).some((flag) => MACHINE_FLAGS.has(flag))

/** Whether a person is at the terminal, and how memo asks them; a test hands both in through `createProgram`. */
export interface Terminal {
  present: boolean
  answer?: (question: string) => Promise<string | null> | string | null
}

const terminals = new WeakMap<Command, Terminal>()
let processTerminal = (): Terminal => ({ present: Boolean(process.stdin.isTTY && process.stdout.isTTY) })

/** The test sandbox's: a suite's runs stand for the owner at a terminal unless a test hands in another. */
export const assumeTerminal = (terminal: Terminal): void => {
  processTerminal = () => terminal
}

export const provideTerminal = (program: Command, terminal: Terminal | undefined): void => {
  terminals.set(program, terminal ?? processTerminal())
}

export const terminalOf = (command: Command): Terminal => {
  let root = command
  while (root.parent) root = root.parent
  return terminals.get(root) ?? { present: false }
}
