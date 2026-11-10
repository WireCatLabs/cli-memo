import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Readable } from "node:stream"
import { captureStreams, memoryKeyring } from "@wirecat/cli-base"
import { aiSettingPath } from "@wirecat/cli-core/documents"
import type { Command } from "commander"
import { expect, it, vi } from "vitest"
import { answerOf } from "../../test/answer.js"
import { createProgram } from "../program.js"

const KEY = "synthetic-owner-key"
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
)

const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "memo-image-"))
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: root,
    MESSAGING_STORE: join(root, "m.db"),
    MEMO_CONFIG_DIR: join(root, "config"),
    MEMO_STATE_DIR: join(root, "state"),
    WIRECAT_CONFIG_DIR: join(root, "wirecat"),
  }
  const keyring = memoryKeyring()
  const readerFetch = vi.fn(
    async (_input: unknown, _init?: RequestInit) =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "Invoice 42 from Acme" }, finish_reason: "stop" }],
          usage: { total_tokens: 9 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  )
  const quiet = (command: Command) => {
    command.exitOverride()
    command.configureOutput({ writeErr: () => {} })
    for (const child of command.commands) quiet(child)
  }
  const run = async (args: string[], stdin?: string) => {
    const streams = captureStreams()
    const program = createProgram({
      streams,
      env,
      readerFetch,
      keyring,
      ...(stdin === undefined ? {} : { stdin: Readable.from([stdin]) }),
    })
    quiet(program)
    await program.parseAsync([...args, "--json"], { from: "user" })
    return { answer: answerOf(streams.stdout.join("")), out: streams.stdout.join("") + streams.stderr.join("") }
  }
  const image = (name: string) => {
    const path = join(root, name)
    writeFileSync(path, PIXEL)
    return path
  }
  return { run, image, readerFetch, env }
}

it("keeps an image by its name and says why while no model may read it", async () => {
  const { run, image, readerFetch } = fixture()

  const before = await run(["sources", "add", image("receipt.png")])
  expect(before.answer).toMatchObject({ read: "no-text", image: { read_by: null, reason: "ai.not-set" } })

  await run(["models", "ai", "set", "openai", "--model", "gpt-4o-mini", "--secret-stdin"], KEY)
  const unagreed = await run(["sources", "add", image("receipt-2.png")])
  expect(unagreed.answer).toMatchObject({ image: { reason: "ai.images-not-allowed" } })
  expect(readerFetch).not.toHaveBeenCalled()
})

it("reads an image's text with the owner's model once they agreed images go to it", async () => {
  const { run, image, readerFetch } = fixture()
  await run(["models", "ai", "set", "openai", "--model", "gpt-4o-mini", "--allow-remote", "--secret-stdin"], KEY)

  const added = await run(["sources", "add", image("invoice.png")])

  expect(added.answer).toMatchObject({
    read: "extracted",
    title: "invoice",
    image: { read_by: "openai/gpt-4o-mini", reason: null },
    searchable: { words: true },
  })
  expect(readerFetch).toHaveBeenCalledOnce()
  expect(added.out).not.toContain(KEY)
  const found = await run(["sources", "show", String((added.answer as { ref: string }).ref)])
  expect(JSON.stringify(found.answer)).toContain("Invoice 42 from Acme")
})

it("never sends the owner's image to the model when an agent adds it", async () => {
  const { run, image, readerFetch, env } = fixture()
  await run(["models", "ai", "set", "openai", "--model", "gpt-4o-mini", "--allow-remote", "--secret-stdin"], KEY)
  env.AI_AGENT = "claude-code"

  const added = await run(["sources", "add", image("passport.png")])

  expect(added.answer).toMatchObject({ read: "no-text", image: { read_by: null, reason: "ai.owner-only" } })
  expect(readerFetch).not.toHaveBeenCalled()
})

it("keeps an image by its name when the shared ai section is one memo cannot read", async () => {
  const { run, image, env } = fixture()
  await run(["models", "ai", "set", "openai", "--model", "gpt-4o-mini", "--allow-remote", "--secret-stdin"], KEY)
  const path = aiSettingPath(env)
  writeFileSync(path, JSON.stringify({ ...JSON.parse(readFileSync(path, "utf8")), ai: { provider: "future" } }))

  const added = await run(["sources", "add", image("note.png")])

  expect(added.answer).toMatchObject({ image: { reason: "ai.setting-invalid" } })
  expect((await run(["sources", "readers", "list"])).answer).toMatchObject({ items: expect.any(Array) })
})
