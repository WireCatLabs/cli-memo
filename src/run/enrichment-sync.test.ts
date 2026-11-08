import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams, memoryKeyring } from "@wirecat/cli-base"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createProgram } from "../program.js"

let env: NodeJS.ProcessEnv
let dir: string
let server: Server
let requests: number

/** An OpenAI-compatible server on this machine: no provider is reached, and a custom endpoint needs no key. */
const fakeProvider = async (answer: (count: number) => object) => {
  server = createServer((request, response) => {
    let body = ""
    request.on("data", (chunk) => {
      body += chunk
    })
    request.on("end", () => {
      requests += 1
      const data = JSON.parse(body).messages.at(-1).content as string
      const records = JSON.parse(JSON.parse(data.slice(data.indexOf("\n") + 1))) as unknown[]
      response.setHeader("content-type", "application/json")
      response.end(
        JSON.stringify({
          choices: [{ finish_reason: "stop", message: { content: JSON.stringify(answer(records.length)) } }],
          usage: { total_tokens: 30, prompt_tokens: 20, completion_tokens: 10 },
        }),
      )
    })
  })
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`
}

const run = async (...args: string[]) => {
  const streams = captureStreams()
  await createProgram({ streams, env, keyring: memoryKeyring() }).exitOverride().parseAsync(args, { from: "user" })
  return streams.stdout.join("")
}

beforeEach(() => {
  requests = 0
  dir = mkdtempSync(join(tmpdir(), "enrichment-sync-"))
  const vault = join(dir, "vault")
  mkdirSync(vault)
  writeFileSync(join(vault, "a.md"), "the hosting agreement renews in March")
  writeFileSync(join(vault, "b.md"), "the press kit is ready")
  env = {
    ...process.env,
    XDG_CONFIG_HOME: join(dir, "xdg"),
    MEMO_CONFIG_DIR: join(dir, "config"),
    MEMO_STATE_DIR: join(dir, "state"),
    MEMO_CACHE_DIR: join(dir, "cache"),
    WIRECAT_STATE_DIR: join(dir, "wirecat"),
    MESSAGING_STORE: join(dir, "messages.db"),
    AI_AGENT: "",
    CLAUDECODE: "",
  }
})

afterEach(() => new Promise<void>((done) => (server ? server.close(() => done()) : done())))

const turnOn = async (baseUrl: string) => {
  await run("folders", "add", join(dir, "vault"), "--format", "markdown")
  writeFileSync(
    join(dir, "config.json"),
    JSON.stringify({
      enrichment: { provider: "openai", model: "fake", base_url: baseUrl, consented_at: "2026-11-08T10:00:00.000Z" },
    }),
  )
}

describe("memo sync with enrichment on", () => {
  it("reports what it sent, even when the embedding model is not downloaded", async () => {
    await turnOn(
      await fakeProvider((count) => ({
        records: Array.from({ length: count }, (_, i) => ({ i, facts: ["a fact"], questions: [] })),
      })),
    )

    const reply = JSON.parse(await run("sync", "--json"))

    expect(requests).toBe(1)
    expect(reply.item.enrichment).toEqual({
      status: "done",
      provider: "openai",
      model: "fake",
      sent: 2,
      enriched: 2,
      failed: 0,
      left: 0,
      input_tokens: 20,
      output_tokens: 10,
      cost_usd: null,
    })
  })

  it("says why nothing came back, so a failure is not silent", async () => {
    await turnOn(await fakeProvider(() => ({ not: "the asked shape" })))

    const reply = JSON.parse(await run("sync", "--json"))

    expect(reply.item.enrichment).toMatchObject({ status: "done", sent: 2, enriched: 0, failed: 2, left: 2 })
    expect(await run("sync")).toMatch(/enrichment: 0 of 2 records sent to openai fake, 2 left/)
  })

  it("is absent while enrichment is off", async () => {
    await run("folders", "add", join(dir, "vault"), "--format", "markdown")
    const reply = JSON.parse(await run("sync", "--json"))

    expect(reply.item.enrichment).toBeUndefined()
  })
})
