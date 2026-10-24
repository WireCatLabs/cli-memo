import { writeFileSync } from "node:fs"
import { Client } from "@modelcontextprotocol/client"
import { InMemoryTransport } from "@modelcontextprotocol/server"
import { expect, it } from "vitest"
import { commandCaller } from "../../test/mcp.js"
import { projectAnnotationFixture } from "../../test/project-annotations.js"
import { createProgram } from "../program.js"
import { createMemoServer } from "./server.js"

it("serves snapshot/check through the CLI under the read lock and refuses unknown fields", async () => {
  const f = await projectAnnotationFixture(),
    server = createMemoServer({ ...f.env, MEMO_READ_ONLY: "1" }, createProgram)
  const client = new Client({ name: "synthetic-annotation-client", version: "1" }),
    [one, two] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(one), client.connect(two)])
  try {
    const call = await commandCaller(client)
    const snapshot = await call("projects annotations show", { project: "RES" })
    expect(snapshot.isError).not.toBe(true)
    const item = (snapshot.structuredContent as { item: { snapshot: unknown } }).item
    writeFileSync(f.snapshotFile, JSON.stringify(item.snapshot))
    const args = {
      file: f.snapshotFile,
      target_store: f.target,
      project: f.targetProject.ref,
      bindings: f.bindingsFile,
    }
    const preview = await call("projects annotations check", args)
    expect(preview.structuredContent).toMatchObject({
      item: { ready: true, namespace_conflicts: [] },
      meta: expect.any(Object),
    })
    const invalid = structuredClone(item.snapshot) as { project: { description: string } }
    invalid.project.description = "  "
    writeFileSync(f.snapshotFile, JSON.stringify(invalid))
    const semantic = await call("projects annotations check", args)
    expect(semantic.isError).toBe(true)
    expect(semantic.structuredContent).toMatchObject({
      error: { code: "validation_error", message: expect.stringContaining("project.description") },
    })
    const refused = await call("projects annotations show", { project: "RES", mistyped_filter: true })
    expect(refused.isError).toBe(true)
    expect(refused.structuredContent).toMatchObject({
      error: { code: "validation_error", message: expect.stringContaining("mistyped_filter") },
    })
  } finally {
    await client.close()
    await server.close()
  }
})
