import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Client } from "@modelcontextprotocol/client"
import { InMemoryTransport } from "@modelcontextprotocol/server"
import { captureStreams, exitCodeOfError } from "@wirecat/cli-base"
import { metaOf } from "@wirecat/cli-base/commands"
import { isStoreChange } from "@wirecat/cli-core/cli"
import { expect, it } from "vitest"
import { EXAMPLES, leaves } from "./examples.js"
import { errorObject } from "./failure.js"
import { createMemoServer } from "./mcp/server.js"
import { createProgram } from "./program.js"
import { PROPOSES_HERE } from "./read-only.js"

const lockedEnv = () => ({
  ...process.env,
  MESSAGING_STORE: join(mkdtempSync(join(tmpdir(), "wcat-read-only-")), "store.db"),
  WCAT_READ_ONLY: "1",
})

const words = (example: string) =>
  (example.match(/'[^']*'|"[^"]*"|\S+/g) ?? []).map((word) => word.replace(/^['"]|['"]$/g, "")).slice(1)

const run = (env: NodeJS.ProcessEnv, args: string[]) =>
  createProgram({ streams: captureStreams(), env }).exitOverride().parseAsync(args, { from: "user" })

// cli-core marks the task links a scheduled agent makes (`tasks link`) as harmless, as in tg and max.
const changes = leaves(createProgram({ streams: captureStreams(), env: {} }))
  .filter(([, command]) => metaOf(command).lifetime !== "persistent")
  .filter(([, command]) => isStoreChange(command) || metaOf(command).effects?.remote === "write")
  .filter(([path]) => path !== PROPOSES_HERE)
  .map(([path]) => [path, EXAMPLES[path]?.at(-1) ?? `wcat ${path}`] as const)

it.each(changes)("refuses %s under WCAT_READ_ONLY with exit 5", async (_path, example) => {
  const failure = await run(lockedEnv(), words(example)).then(
    () => undefined,
    (error: unknown) => error,
  )
  expect(failure).toMatchObject({ code: "permission_error", message: expect.stringContaining("WCAT_READ_ONLY") })
  expect(exitCodeOfError(errorObject(failure))).toBe(5)
})

it('**refuses every change under the shared setup answer "read only"**, and still reads', async () => {
  const folder = mkdtempSync(join(tmpdir(), "wcat-setup-"))
  writeFileSync(join(folder, "config.json"), JSON.stringify({ setup: { permissions: "readonly" } }))
  const env = { ...process.env, MESSAGING_STORE: join(folder, "store.db"), WCAT_READ_ONLY: undefined }
  const [, example] = changes[0] as (typeof changes)[number]
  await expect(run(env, words(example))).rejects.toMatchObject({
    code: "permission_error",
    message: expect.stringContaining("WireCat setup answer"),
  })
  await expect(run(env, ["tags", "list", "--json"])).resolves.toBeDefined()
})

it("still reads, syncs and looks for a new version under WCAT_READ_ONLY", async () => {
  const env = lockedEnv()
  await expect(run(env, ["tags", "list", "--json"])).resolves.toBeDefined()
  await expect(run(env, ["sync", "--only", "people", "--no-embed", "--json"])).resolves.toBeDefined()
  await expect(run(env, ["upgrade"])).rejects.toMatchObject({ code: "permission_error" })
  await expect(run(env, ["answers", "create", "budget", "--all", "--analyze", "--allow-remote"])).rejects.toMatchObject(
    {
      code: "permission_error",
    },
  )
})

it("leaves the writing MCP tools out under WCAT_READ_ONLY", async () => {
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair()
  await createMemoServer(lockedEnv(), createProgram).connect(serverSide)
  const client = new Client({ name: "fixture", version: "0" })
  await client.connect(clientSide)
  try {
    const tools = (await client.listTools()).tools
    expect(tools.map(({ name }) => name)).toEqual(["wcat_tools_search", "wcat_read", "wcat_write"])
    const discovery = await client.callTool({ name: "wcat_tools_search", arguments: {} })
    const writes = (
      discovery.structuredContent as { items: { writes: boolean; availability: { available: boolean } }[] }
    ).items.filter((item) => item.writes)
    expect(writes.length).toBeGreaterThan(0)
    expect(writes.every((item) => !item.availability.available)).toBe(true)
  } finally {
    await client.close()
  }
})

it("shows the read lock in CLI discovery and help while keeping write arguments", async () => {
  const env = lockedEnv()
  const streams = captureStreams()
  await createProgram({ env, streams }).parseAsync(["commands", "facts", "add", "--json"], { from: "user" })
  expect(JSON.parse(streams.stdout.join("")).commands[0]).toMatchObject({
    path: ["facts", "add"],
    availability: { available: false, reason: expect.stringContaining("WCAT_READ_ONLY") },
  })
  let help = ""
  const program = createProgram({ env })
  const facts = program.commands.find((command) => command.name() === "facts")
  const add = facts?.commands.find((command) => command.name() === "add")
  add?.configureOutput({
    writeOut: (text) => {
      help += text
    },
  })
  add?.outputHelp()
  expect(help).toContain("unavailable")
  expect(help).toContain("WCAT_READ_ONLY")
})

it("retains CLI availability metadata when commands run through the MCP runner", async () => {
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair()
  await createMemoServer(lockedEnv(), createProgram).connect(serverSide)
  const client = new Client({ name: "fixture", version: "0" })
  await client.connect(clientSide)
  try {
    const result = await client.callTool({
      name: "wcat_read",
      arguments: { command: "commands", arguments: { path: ["facts", "add"] } },
    })
    expect(result.isError, JSON.stringify(result.structuredContent)).not.toBe(true)
    expect(result.structuredContent).toMatchObject({
      item: {
        commands: [
          expect.objectContaining({
            availability: { available: false, reason: expect.stringContaining("WCAT_READ_ONLY") },
          }),
        ],
      },
    })
  } finally {
    await client.close()
  }
})
