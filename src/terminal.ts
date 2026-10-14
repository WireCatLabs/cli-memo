const MACHINE_FLAGS = new Set(["--json", "--jsonl"])

export const optionsOf = (args: readonly string[]) => {
  const end = args.indexOf("--")
  return end < 0 ? args : args.slice(0, end)
}

/** A person at a terminal who did not ask for machine output. */
export const interactiveOf = (args: readonly string[], tty: boolean) =>
  tty && !optionsOf(args).some((flag) => MACHINE_FLAGS.has(flag))
