import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Readable } from "node:stream"
import { captureStreams, memoryKeyring } from "@wirecat/cli-base"
import { describe, expect, it } from "vitest"
import { createProgram } from "../program.js"

it("lists shared text models without an account and refuses offline downloads", async () => {
  const streams = captureStreams()
  await createProgram({ env: {}, streams }).parseAsync(["models", "list", "kind:text", "id:e5-small", "--json"], {
    from: "user",
  })
  expect(JSON.parse(streams.stdout.join("")).items).toEqual([
    expect.objectContaining({ id: "e5-small", kind: "text", downloaded: false }),
  ])
  await expect(
    createProgram({ env: {}, streams }).parseAsync(
      ["models", "download", "e5-small", "--offline", "--accept-terms", "--json"],
      { from: "user" },
    ),
  ).rejects.toThrow("--offline")
})

describe("the shared model settings memo mounts", () => {
  const keyring = memoryKeyring()
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    MESSAGING_STORE: join(mkdtempSync(join(tmpdir(), "memo-models-")), "s.db"),
    MEMO_CONFIG_DIR: mkdtempSync(join(tmpdir(), "memo-models-config-")),
  }
  // A key in the environment of whoever runs the suite would count as stored.
  delete env.OPENAI_API_KEY
  delete env.ANTHROPIC_API_KEY
  const AGENT = { ...env, AI_AGENT: "claude-code_2-1-296_agent" }
  const run = async (args: string[], { as = env, stdin }: { as?: NodeJS.ProcessEnv; stdin?: string } = {}) => {
    const streams = captureStreams()
    await createProgram({
      streams,
      env: as,
      keyring,
      terminal: { present: false },
      ...(stdin === undefined ? {} : { stdin: Readable.from([stdin]) }),
    })
      .exitOverride()
      .parseAsync([...args, "--json"], { from: "user" })
    return JSON.parse(streams.stdout.join("")).item
  }

  it("chooses, checks, stops and forgets the AI model, each as the owner from the app", async () => {
    expect(await run(["models", "ai", "show"])).toMatchObject({ provider: null, key: { stored: false } })
    expect(await run(["models", "ai", "check", "--from-app"], { as: AGENT })).toMatchObject({
      ok: false,
      reason: "ai.not-set",
    })
    const model = ["models", "ai", "set", "openai", "--model", "gpt-synthetic", "--allow-remote", "--secret-stdin"]
    await run([...model, "--from-app"], { as: AGENT, stdin: "sk-synthetic-models-0000" })
    expect(await run(["models", "ai", "show"])).toMatchObject({
      provider: "openai",
      model: "gpt-synthetic",
      images: true,
      key: { stored: true, source: "keyring" },
    })
    expect(await run(["models", "ai", "revoke", "--from-app"], { as: AGENT })).toMatchObject({
      images: false,
      changed: true,
    })
    expect(await run(["models", "ai", "unset", "--from-app"], { as: AGENT })).toEqual({ changed: true, key_kept: true })
    expect(await run(["models", "ai", "show"])).toMatchObject({ provider: null, key: { stored: false } })
    expect(await run(["models", "ai", "remove", "https://api.openai.com", "--from-app"], { as: AGENT })).toMatchObject({
      origin: "https://api.openai.com",
      removed: true,
    })
  })

  it("turns local only and picture reading on and off from the app", async () => {
    expect(await run(["models", "local-only", "show"])).toMatchObject({ on: false, since: null })
    expect(await run(["models", "local-only", "set", "on", "--from-app"], { as: AGENT })).toMatchObject({ on: true })
    expect(await run(["models", "local-only", "show"])).toMatchObject({ on: true })
    expect(await run(["models", "local-only", "set", "off", "--from-app"], { as: AGENT })).toMatchObject({ on: false })
    expect(await run(["models", "picture-reading", "show"])).toMatchObject({ mode: "never", agent: null })
    await run(["models", "picture-reading", "set", "request", "--agent", "claude", "--from-app"], { as: AGENT })
    expect(await run(["models", "picture-reading", "show"])).toMatchObject({ mode: "request", agent: "claude" })
  })

  it("gives the enrichment and search model an address and a wait, and takes the consent back", async () => {
    const address = ["--model", "m", "--base-url", "https://models.example/v1"]
    expect(await run(["models", "consents", "set", "openai", ...address, "--yes"])).toMatchObject({
      on: true,
      endpoint: "https://models.example/v1",
    })
    expect(await run(["models", "consents", "revoke"])).toMatchObject({ on: false, endpoint: null })
    expect(
      await run(["models", "search-consents", "set", "openai", ...address, "--timeout", "2m", "--yes"]),
    ).toMatchObject({ on: true, endpoint: "https://models.example/v1", timeout_s: 120, timeout_set: true })
    expect(await run(["models", "search-consents", "revoke"])).toMatchObject({ on: false, consented_at: null })
  })

  it("refuses to add a model that needs the network under --offline", async () => {
    const payload = JSON.stringify({
      repository: "Example/synthetic",
      onnx: "onnx/model.onnx",
      dims: 8,
      pooling: "mean",
    })
    await expect(run(["models", "add", "synthetic-e5", "--payload", payload, "--offline"])).rejects.toThrow("--offline")
  })
})
