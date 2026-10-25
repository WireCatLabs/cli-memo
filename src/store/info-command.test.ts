import { existsSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { openStore } from "@wirecat/cli-core/store"
import { expect, it } from "vitest"
import { createProgram } from "../program.js"

const environment = () => {
  const directory = mkdtempSync(join(tmpdir(), "memo-store-info-"))
  return { ...process.env, MESSAGING_STORE: join(directory, "wirecat.db") }
}

const storeInfo = async (env: NodeJS.ProcessEnv) => {
  const streams = captureStreams()
  await createProgram({ streams, env }).exitOverride().parseAsync(["store", "info", "--json"], { from: "user" })
  return JSON.parse(streams.stdout.join("")).item
}

it("describes the shared store without creating it", async () => {
  const env = environment()
  expect(await storeInfo(env)).toMatchObject({ exists: false, schema: { reason: "missing", writable: true } })
  expect(existsSync(String(env.MESSAGING_STORE))).toBe(false)
})

it("names memo among the tools that used the store", async () => {
  const env = environment()
  await (await openStore({ path: String(env.MESSAGING_STORE), env, command: "memo", version: "1.0.0" })).close()
  const answer = await storeInfo(env)
  expect(answer.schema).toMatchObject({ reason: "current", upgrade: null })
  expect(answer.clients).toEqual([expect.objectContaining({ command: "memo", version: "1.0.0" })])
})
