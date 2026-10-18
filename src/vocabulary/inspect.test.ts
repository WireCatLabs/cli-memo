import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Client } from "@modelcontextprotocol/client"
import { InMemoryTransport } from "@modelcontextprotocol/server"
import { captureStreams } from "@wirecat/cli-base"
import { openStore } from "@wirecat/cli-core/store"
import { expect, it } from "vitest"
import { envelopeOf } from "../../test/answer.js"
import { createMemoServer } from "../mcp/server.js"
import { createProgram } from "../program.js"

const fixture = async () => {
  const env = { ...process.env, MESSAGING_STORE: join(mkdtempSync(join(tmpdir(), "memo-tag-inspect-")), "fixture.db") }
  const store = await openStore({ env })
  try {
    const source = await store.knowledge.createTag("arrival")
    const survivor = await store.knowledge.createTag("welcome")
    const project = await store.knowledge.addProject({ name: "Harbour Example", key: "HRB" })
    await store.knowledge.addTags(null, { type: "project", id: project.id }, ["arrival", "welcome"])
    const catalog = await store.knowledge.vocabulary()
    return {
      env,
      source: `tag:${source.id}`,
      survivor: `tag:${survivor.id}`,
      fingerprint: catalog.fingerprint,
      catalog,
    }
  } finally {
    await store.close()
  }
}

const cli = async (env: NodeJS.ProcessEnv, args: string[]) => {
  const streams = captureStreams()
  await createProgram({ env, streams }).exitOverride().parseAsync(args, { from: "user" })
  return envelopeOf(streams.stdout.join(""))
}

it("previews selected tags through the CLI with standard output, complete counts and limited samples", async () => {
  const { env, source, survivor, fingerprint, catalog } = await fixture()
  const args = ["vocabulary", "inspect", source, survivor, "--fingerprint", fingerprint]
  const result = await cli(env, [...args, "--max-rows", "5000", "--max-read-bytes", "65536", "--limit", "1", "--json"])
  expect(result).toHaveProperty("meta")
  expect(result.item).toMatchObject({
    vocabulary_fingerprint: fingerprint,
    assignments: { source: 1, survivor: 1, overlapping_targets: 1 },
    coverage: { rows: 2, samples_complete: false, apply_supported: false },
  })
  expect(result.item.assignments.samples).toHaveLength(1)
  const projected = await cli(env, [...args, "--json=source,survivor,coverage"])
  expect(Object.keys(projected.item).sort()).toEqual(["coverage", "source", "survivor"])
  const store = await openStore({ env })
  try {
    expect(await store.knowledge.vocabulary()).toEqual(catalog)
  } finally {
    await store.close()
  }
})

it("refuses typed-reference mistakes, incomplete dependency reads and a changed catalog", async () => {
  const { env, source, survivor, fingerprint } = await fixture()
  const args = ["--fingerprint", fingerprint, "--json"]
  for (const reference of ["project:1", "topic:1", "arrival", "tag:9007199254740992"])
    await expect(cli(env, ["vocabulary", "inspect", reference, survivor, ...args])).rejects.toMatchObject({
      code: "validation_error",
    })
  await expect(cli(env, ["vocabulary", "inspect", source, survivor, "--max-rows", "1", ...args])).rejects.toMatchObject(
    {
      code: "validation_error",
      details: { reason: "vocabulary.consolidation-over-budget" },
    },
  )
  const store = await openStore({ env })
  try {
    await store.knowledge.addVocabularyAlias({ kind: "tag", id: source.slice(4) }, "arriving")
  } finally {
    await store.close()
  }
  await expect(cli(env, ["vocabulary", "inspect", source, survivor, ...args])).rejects.toMatchObject({
    code: "configuration_error",
    details: { reason: "vocabulary.stale" },
  })
})

it("serves a read-only MCP preview and names unknown fields in the handler's validation envelope", async () => {
  const { env, source, survivor, fingerprint, catalog } = await fixture()
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair()
  await createMemoServer(env).connect(serverSide)
  const client = new Client({ name: "fixture", version: "0" })
  await client.connect(clientSide)
  try {
    const tool = (await client.listTools()).tools.find((tool) => tool.name === "vocabulary_inspect")
    expect(tool?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, openWorldHint: false })
    expect(tool?.inputSchema).toMatchObject({ additionalProperties: false })
    const call = (fields: Record<string, unknown>) =>
      client.callTool({ name: "vocabulary_inspect", arguments: { source, survivor, fingerprint, ...fields } })
    const result = await call({ max_rows: 5000, max_read_bytes: 65536, limit: 1 })
    const body = envelopeOf(JSON.stringify(result.structuredContent))
    expect(body.item).toMatchObject({
      assignments: { overlapping_targets: 1 },
      coverage: { samples_complete: false, apply_supported: false },
    })
    for (const fields of [{ unexpected_argument: true }, { maxRows: 1 }, { max_rows: 0 }]) {
      const failed = await call(fields)
      expect(failed.isError).toBe(true)
      expect(failed.structuredContent).toMatchObject({
        error: { code: "validation_error", param: Object.keys(fields)[0] },
      })
    }
    const store = await openStore({ env })
    try {
      expect(await store.knowledge.vocabulary()).toEqual(catalog)
    } finally {
      await store.close()
    }
  } finally {
    await client.close()
  }
})
