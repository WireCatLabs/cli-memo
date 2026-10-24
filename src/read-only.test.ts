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
import { createMemoServer, MEMO_TOOLS } from "./mcp/server.js"
import { createProgram } from "./program.js"

const lockedEnv = () => ({
  ...process.env,
  MESSAGING_STORE: join(mkdtempSync(join(tmpdir(), "memo-read-only-")), "store.db"),
  MEMO_READ_ONLY: "1",
})

const words = (example: string) =>
  (example.match(/'[^']*'|"[^"]*"|\S+/g) ?? []).map((word) => word.replace(/^['"]|['"]$/g, "")).slice(1)

const run = (env: NodeJS.ProcessEnv, args: string[]) =>
  createProgram({ streams: captureStreams(), env }).exitOverride().parseAsync(args, { from: "user" })

// cli-core marks the task writes a scheduled agent makes (`tasks plan`, `tasks link`) as harmless, as in tg and max.
const changes = leaves(createProgram({ streams: captureStreams(), env: {} }))
  .filter(([, command]) => metaOf(command).lifetime !== "persistent")
  .filter(([, command]) => isStoreChange(command) || metaOf(command).effects?.remote === "write")
  .map(([path]) => [path, EXAMPLES[path]?.at(-1) ?? `memo ${path}`] as const)

it.each(changes)("refuses %s under MEMO_READ_ONLY with exit 5", async (_path, example) => {
  const failure = await run(lockedEnv(), words(example)).then(
    () => undefined,
    (error: unknown) => error,
  )
  expect(failure).toMatchObject({ code: "permission_error", message: expect.stringContaining("MEMO_READ_ONLY") })
  expect(exitCodeOfError(errorObject(failure))).toBe(5)
})

it('**refuses every change under the shared setup answer "read only"**, and still reads', async () => {
  const folder = mkdtempSync(join(tmpdir(), "memo-setup-"))
  writeFileSync(join(folder, "config.json"), JSON.stringify({ setup: { permissions: "readonly" } }))
  const env = { ...process.env, MESSAGING_STORE: join(folder, "store.db"), MEMO_READ_ONLY: undefined }
  const [, example] = changes[0] as (typeof changes)[number]
  await expect(run(env, words(example))).rejects.toMatchObject({
    code: "permission_error",
    message: expect.stringContaining("WireCat setup answer"),
  })
  await expect(run(env, ["tags", "list", "--json"])).resolves.toBeDefined()
})

it("still reads, syncs and looks for a new version under MEMO_READ_ONLY", async () => {
  const env = lockedEnv()
  await expect(run(env, ["tags", "list", "--json"])).resolves.toBeDefined()
  await expect(run(env, ["sync", "--only", "notes", "--no-embed", "--json"])).resolves.toBeDefined()
  await expect(run(env, ["upgrade"])).rejects.toMatchObject({ code: "permission_error" })
  await expect(run(env, ["ask", "budget", "--all", "--analyze", "--allow-remote"])).rejects.toMatchObject({
    code: "permission_error",
  })
})

it("leaves the writing MCP tools out under MEMO_READ_ONLY", async () => {
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair()
  await createMemoServer(lockedEnv(), createProgram).connect(serverSide)
  const client = new Client({ name: "fixture", version: "0" })
  await client.connect(clientSide)
  try {
    const reads = Object.entries(MEMO_TOOLS)
      .filter(([, tool]) => !tool.writes)
      .map(([name]) => name)
    const tools = (await client.listTools()).tools
    expect(tools.map(({ name }) => name)).toEqual(expect.arrayContaining(reads))
    expect(tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true)
  } finally {
    await client.close()
  }
})
