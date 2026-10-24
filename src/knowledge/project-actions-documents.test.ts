import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Client } from "@modelcontextprotocol/client"
import { InMemoryTransport } from "@modelcontextprotocol/server"
import { captureStreams } from "@wirecat/cli-base"
import { contextEvidenceFingerprint } from "@wirecat/cli-core/services"
import { openStore } from "@wirecat/cli-core/store"
import { expect, it } from "vitest"
import { answerOf } from "../../test/answer.js"
import { createMemoServer } from "../mcp/server.js"
import { createProgram } from "../program.js"

it("shows cited document paragraphs in CLI and MCP review, while brief and zero windows omit them", async () => {
  const dir = mkdtempSync(join(tmpdir(), "memo-doc-review-"))
  const owner: NodeJS.ProcessEnv = {
    ...process.env,
    MESSAGING_STORE: join(dir, "s.db"),
    XDG_CONFIG_HOME: join(dir, "c"),
  }
  delete owner.AI_AGENT
  delete owner.CLAUDECODE
  const agent = { ...owner, AI_AGENT: "synthetic-doc-review_1_agent" }
  const store = await openStore({ env: owner })
  let reference: string, fingerprint: string
  try {
    await store.knowledge.addProject({ name: "Synthetic Port", key: "SYP" })
    const folder = await store.notes.addFolder({ name: "synthetic-review" })
    const { note } = await store.notes.saveFileNote({
      folderId: folder.id,
      path: "plan.md",
      title: "Plan",
      text: "Introduction.\n\nPrevious discussion.\n\nLedger approved for launch.\n\nFollowing discussion.\n\nLater material.",
    })
    reference = note.ref
    const record = await store.contextRecords?.read(reference)
    if (!record) throw new Error("fixture document missing")
    fingerprint = contextEvidenceFingerprint(record)
  } finally {
    await store.close()
  }
  const run = async (env: NodeJS.ProcessEnv, ...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ env, streams })
      .exitOverride()
      .parseAsync([...args, "--json"], { from: "user" })
    return answerOf(streams.stdout.join(""))
  }
  const file = join(dir, "input.json")
  writeFileSync(
    file,
    JSON.stringify({
      schema_version: 1,
      key: "document-run",
      extractor: "synthetic",
      findings: [
        {
          id: "ledger",
          kind: "fact",
          type: "statement",
          statement: "Ledger approved for launch",
          project: "project:1",
          evidence: [{ reference, fingerprint }],
        },
      ],
    }),
  )
  await run(agent, "projects", "actions", "add", file)
  const list = await run(owner, "projects", "actions", "list", "SYP", "--before-n", "1", "--after-n", "1")
  const evidence = list.items[0].findings[0].evidence[0]
  expect(evidence.around).toEqual([
    { ref: reference, text: "Previous discussion.", found: false },
    { ref: reference, text: "Ledger approved for launch.", found: true },
    { ref: reference, text: "Following discussion.", found: false },
  ])
  expect(evidence.state).toBe("unchanged")
  const brief = await run(owner, "projects", "actions", "list", "SYP", "--brief")
  expect(brief.items[0].findings[0].evidence[0]).toEqual({ reference, state: "unchanged" })
  const zero = await run(owner, "projects", "actions", "list", "SYP", "--before-n", "0", "--after-n", "0")
  expect(zero.items[0].findings[0].evidence[0].around).toEqual([])
  const server = createMemoServer(owner, createProgram)
  const client = new Client({ name: "synthetic-document-review", version: "1" })
  const [left, right] = InMemoryTransport.createLinkedPair()
  try {
    await server.connect(right)
    await client.connect(left)
    const answer = await client.callTool({
      name: "project_actions_list",
      arguments: {
        project: "SYP",
        before_n: 1,
        after_n: 1,
      },
    })
    expect(answer.isError).toBeFalsy()
    const value = answer.structuredContent as { items: typeof list.items }
    expect(value.items[0].findings[0].evidence[0].around).toEqual(evidence.around)
  } finally {
    await client.close()
    await server.close()
  }
  const writer = await openStore({ env: owner })
  try {
    await writer.notes.addLink({
      from: reference,
      to: "project:1",
      kind: "related-to",
      role: "key",
      origin: "suggested",
      evidence: "Ledger",
      confirmed: false,
    })
  } finally {
    await writer.close()
  }
  const keys = await run(owner, "projects", "actions", "list", "SYP", "--before-n", "1", "--after-n", "1")
  expect(keys.items[0].kind).toBe("key_document")
  expect(keys.items[0].evidence[0]).toMatchObject({ reference, state: "untracked", around: evidence.around })
  const briefKeys = await run(owner, "projects", "actions", "list", "SYP", "--brief")
  expect(briefKeys.items[0].evidence[0]).toEqual({ reference, state: "untracked" })
})
