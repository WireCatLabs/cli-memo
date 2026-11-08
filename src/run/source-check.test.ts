import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { CliError, captureStreams } from "@wirecat/cli-base"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { envelopeOf } from "../../test/answer.js"
import { updateConfig } from "../config.js"
import { createProgram } from "../program.js"

const failing = vi.hoisted(() => ({ on: false }))

vi.mock("@wirecat/cli-core/store", async (original) => {
  const actual = await original<typeof import("@wirecat/cli-core/store")>()
  return {
    ...actual,
    openStore: async (...args: Parameters<typeof actual.openStore>) => {
      const store = await actual.openStore(...args)
      if (!failing.on) return store
      const knowledge = Object.create(store.knowledge) as typeof store.knowledge
      knowledge.checkSources = async () => {
        throw new CliError("conflict", "synthetic source check failure", { reason: "store.busy" })
      }
      return new Proxy(store, { get: (target, key) => (key === "knowledge" ? knowledge : Reflect.get(target, key)) })
    },
  }
})

let env: NodeJS.ProcessEnv

beforeEach(async () => {
  const dir = mkdtempSync(join(tmpdir(), "memo-sync-sources-"))
  const vault = join(dir, "vault")
  mkdirSync(vault)
  writeFileSync(join(vault, "a.md"), "synthetic note")
  env = {
    ...process.env,
    XDG_CONFIG_HOME: join(dir, "xdg"),
    MEMO_CONFIG_DIR: join(dir, "config"),
    MEMO_STATE_DIR: join(dir, "state"),
    MESSAGING_STORE: join(dir, "messages.db"),
  }
  updateConfig(() => ({ notes: { folders: [vault] } }), env)
  await run("folders", "add", vault)
})

afterEach(() => {
  failing.on = false
  process.exitCode = 0
})

const run = async (...args: string[]) => {
  const streams = captureStreams()
  await createProgram({ streams, env }).exitOverride().parseAsync(args, { from: "user" })
  return streams.stdout.join("")
}

it("lets memories follow their sources as the last step of a sync", async () => {
  const body = envelopeOf(await run("sync", "--no-embed", "--json"))
  expect(body.item.source_check).toMatchObject({ checked: 0, raised: 0, changed_refs: [] })
  expect(body.item.source_check_failed).toBeUndefined()
  expect(body.meta).toMatchObject({ complete: true })
})

it("reports a failed source check in the run and still passes the sync", async () => {
  failing.on = true
  process.exitCode = 0
  const body = envelopeOf(await run("sync", "--no-embed", "--json"))
  expect(body.item.notes).toEqual([expect.objectContaining({ notes: 1 })])
  expect(body.item.failed).toEqual([])
  expect(body.item.source_check_failed).toMatchObject({ code: "conflict", reason_id: expect.any(String) })
  expect(body.meta).toMatchObject({ complete: true })
  expect(process.exitCode).toBe(0)
  expect(await run("sync", "--no-embed")).toMatch(/memories follow sources not checked: synthetic source check failure/)
})
