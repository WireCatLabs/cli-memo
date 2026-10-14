import { fieldsOf, projectFields, type Streams } from "@wirecat/cli-base"
import { checkJson, liftJson } from "@wirecat/cli-core/cli"
import type { Command } from "commander"

const commandIn = (root: Command, words: readonly string[]): Command | undefined => {
  let at = root
  for (const word of words) {
    if (word.startsWith("-")) continue
    const child = at.commands.find((command) => command.name() === word || command.aliases().includes(word))
    if (child) at = child
  }
  return at === root ? undefined : at
}

const keep = (text: string, paths: string[]): string => {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return text
  }
  if (!value || typeof value !== "object") return text
  const answer = value as { item?: unknown; items?: unknown }
  if (Array.isArray(answer.items))
    return JSON.stringify({ ...answer, items: answer.items.map((item) => projectFields(item, paths)) })
  if ("item" in answer) return JSON.stringify({ ...answer, item: projectFields(answer.item, paths) })
  return JSON.stringify(projectFields(value, paths))
}

/**
 * `--json=a,b` keeps those fields of an answer's item or items, read the way tg and max read it. memo's commands
 * print through many renderers, so the fields are applied where every answer passes: the data stream.
 */
export const jsonFields = (streams: Streams) => {
  let fields: string | undefined
  return {
    streams: { ...streams, data: (text: string) => streams.data(fields ? keep(text, fieldsOf(fields)) : text) },
    install(program: Command, terminal = process.stdout.isTTY === true): void {
      const parse = program.parseAsync.bind(program)
      program.parseAsync = async (argv = process.argv, settings) => {
        const user = settings?.from === "user"
        const requested = liftJson(user ? argv : argv.slice(2), (words) => commandIn(program, words))
        fields = requested.fields
        return parse(user ? requested.argv : [...argv.slice(0, 2), ...requested.argv], settings)
      }
      program.hook("preAction", (_root, action) => {
        checkJson(action, { json: action.opts().json === true, ...(fields ? { fields } : {}) }, terminal)
      })
    },
  }
}
