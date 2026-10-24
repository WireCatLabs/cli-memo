import { Client } from "@modelcontextprotocol/client"
import { InMemoryTransport } from "@modelcontextprotocol/server"
import { expect, it } from "vitest"
import { projectAnnotationFixture } from "../../test/project-annotations.js"
import { createProgram } from "../program.js"
import { createMemoServer } from "./server.js"

it("serves snapshot/preview through real MCP envelopes and rejects unknown fields with their name", async () => {
  const f = await projectAnnotationFixture(),
    server = createMemoServer({ ...f.env, MEMO_READ_ONLY: "1" }, createProgram)
  const client = new Client({ name: "synthetic-annotation-client", version: "1" }),
    [one, two] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(one), client.connect(two)])
  try {
    const tools = (await client.listTools()).tools.map((tool) => tool.name)
    expect(tools).toContain("project_annotations_snapshot")
    expect(tools).toContain("project_annotations_preview")
    const snapshot = await client.callTool({ name: "project_annotations_snapshot", arguments: { project: "RES" } })
    expect(snapshot.isError).not.toBe(true)
    const item = (snapshot.structuredContent as { item: { snapshot: unknown } }).item
    const preview = await client.callTool({
      name: "project_annotations_preview",
      arguments: {
        snapshot: item.snapshot,
        target_store: f.target,
        project: f.targetProject.ref,
        bindings: f.bindings,
      },
    })
    expect(preview.structuredContent).toMatchObject({
      item: { ready: true, namespace_conflicts: [] },
      meta: expect.any(Object),
    })
    const invalid = structuredClone(item.snapshot) as { project: { description: string } }
    invalid.project.description = "  "
    const semantic = await client.callTool({
      name: "project_annotations_preview",
      arguments: { snapshot: invalid, target_store: f.target, project: f.targetProject.ref, bindings: f.bindings },
    })
    expect(semantic.isError).toBe(true)
    expect(semantic.structuredContent).toMatchObject({
      error: { code: "validation_error", message: expect.stringContaining("project.description") },
    })
    const refused = await client.callTool({
      name: "project_annotations_snapshot",
      arguments: { project: "RES", mistyped_filter: true },
    })
    expect(refused.isError).toBe(true)
    expect(refused.structuredContent).toMatchObject({
      error: { code: "validation_error", message: expect.stringContaining("mistyped_filter") },
    })
  } finally {
    await client.close()
    await server.close()
  }
})
