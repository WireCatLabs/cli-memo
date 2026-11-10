import { metaOf } from "@wirecat/cli-base/commands"
import { openStore } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { beforeAll, describe, expect, it } from "vitest"
import { EXAMPLES } from "./examples.js"
import { MOVED_TO_MAIL } from "./mail/moved.js"
import { createProgram } from "./program.js"

/** Groups that also run on their own, so they keep examples of their own. */
const RUNNABLE_GROUPS = ["commands", "recover"]

const leaves = (command: Command, path: string[] = []): string[] =>
  command.commands.flatMap((child) =>
    child.commands.length
      ? [
          ...(RUNNABLE_GROUPS.includes(child.name()) ? [[...path, child.name()].join(" ")] : []),
          ...leaves(child, [...path, child.name()]),
        ]
      : [[...path, child.name()].join(" ")],
  )

/** Leaves whose shared definition (cli-core) carries its own examples; memo need not repeat them. */
const examplesOf = (command: Command, path: string[] = []): Map<string, readonly string[]> =>
  new Map(
    command.commands.flatMap((child) => {
      const at = [...path, child.name()]
      const own = metaOf(child).examples ?? []
      return [...(own.length ? [[at.join(" "), own] as const] : []), ...examplesOf(child, at)]
    }),
  )

/** Splits like a shell does for these examples: single quotes keep spaces, nothing else is special. */
const words = (line: string): string[] =>
  [...line.matchAll(/(?:'[^']*'|[^\s'])+/g)].map(([word]) => word.replaceAll("'", ""))

/** The real parser with every action replaced, so an example is checked without running it. */
const parse = async (args: string[]) => {
  const program = createProgram({ env: {} })
  const quiet = (command: Command): void => {
    command.exitOverride().configureOutput({ writeErr: () => {}, writeOut: () => {} })
    if (command.commands.length === 0 || RUNNABLE_GROUPS.includes(command.name())) command.action(() => {})
    for (const child of command.commands) quiet(child)
  }
  quiet(program)
  await program.parseAsync(args, { from: "user" })
}

describe("examples", () => {
  // The task commands cli-core builds resolve --source in a hook, before the replaced action.
  beforeAll(async () => {
    const store = await openStore({ env: {} })
    for (const provider of ["telegram", "max"])
      await store.accounts.saveAccount({ provider, account: "1" }, { name: null })
    await store.close()
  })

  it("gives every leaf one to three examples, and names no command memo lacks", () => {
    const moved = MOVED_TO_MAIL.map(([from]) => `mail ${from}`)
    const program = createProgram({ env: {} })
    const all = leaves(program).filter((path) => !moved.includes(path))
    const shared = examplesOf(program)
    const examples = (path: string) => EXAMPLES[path] ?? shared.get(path)
    expect(all.filter((path) => !examples(path) || (examples(path)?.length ?? 0) > 3)).toEqual([])
    expect(Object.keys(EXAMPLES).filter((path) => !all.includes(path))).toEqual([])
  })

  it.each(Object.entries(EXAMPLES).flatMap(([path, lines]) => lines.map((line) => [path, line])))(
    "%s: %s parses",
    async (path, line) => {
      const [tool, ...args] = words(line)
      expect(tool).toBe("memo")
      expect(args.slice(0, path.split(" ").length).join(" ")).toBe(path)
      await expect(parse(args)).resolves.toBeUndefined()
    },
  )
})
