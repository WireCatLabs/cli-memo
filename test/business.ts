import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Readable } from "node:stream"
import { captureStreams } from "@wirecat/cli-base"
import { environmentOf, provide } from "@wirecat/cli-core/cli"
import { openStore } from "@wirecat/cli-core/store"
import { createProgram } from "../src/program.js"
import { envelopeOf } from "./answer.js"

export const AGENT = { AI_AGENT: "claude-code_2-1-296_agent" }
export const OWNER = {}

type Who = typeof AGENT | typeof OWNER

/**
 * A temp store with a project, a client organization and a person, and a memo run as the owner at a terminal or an
 * agent without one. Synthetic data only.
 */
export const businessStore = async (prefix: string) => {
  const dir = mkdtempSync(join(tmpdir(), `memo-${prefix}-`))
  const env: NodeJS.ProcessEnv = { ...process.env, MESSAGING_STORE: join(dir, "s.db"), MEMO_CONFIG_DIR: dir }
  delete env.AI_AGENT
  delete env.CLAUDECODE
  const store = await openStore({ env })
  await store.knowledge.addProject({ name: "Synthetic Rental", key: "SYR" })
  const client = await store.knowledge.addOrganization({ name: "ООО Пример", kind: "company" })
  await store.close()

  const program = (who: Who, stdin?: string) => {
    const streams = captureStreams()
    const made = createProgram({
      streams,
      env: { ...env, ...who },
      terminal: { present: who === OWNER },
    }).exitOverride()
    if (stdin !== undefined) provide(made, { ...environmentOf(made), stdin: Readable.from([stdin]) })
    return { made, streams }
  }
  const run = async (who: Who, ...args: string[]) => {
    const { made, streams } = program(who)
    await made.parseAsync([...args, "--json"], { from: "user" })
    return envelopeOf(streams.stdout.join(""))
  }
  const item = async (who: Who, ...args: string[]) => (await run(who, ...args)).item as Record<string, unknown>
  const items = async (who: Who, ...args: string[]) => (await run(who, ...args)).items as Record<string, unknown>[]
  /** The owner's run with `text` on stdin, as `records import -` reads it. */
  const piped = async (text: string, ...args: string[]) => {
    const { made, streams } = program(OWNER, text)
    await made.parseAsync([...args, "--json"], { from: "user" })
    return envelopeOf(streams.stdout.join("")).item as Record<string, unknown>
  }
  const text = async (...args: string[]) => {
    const { made, streams } = program(OWNER)
    await made.parseAsync(args, { from: "user" })
    return streams.stdout.join("")
  }
  return { dir, env, run, item, items, piped, text, client: client.ref }
}
