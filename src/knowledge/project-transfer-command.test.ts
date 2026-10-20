import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { openStore } from "@wirecat/cli-core/store"
import { expect, it } from "vitest"
import { answerOf } from "../../test/answer.js"
import { projectAnnotationFixture } from "../../test/project-annotations.js"
import { createProgram } from "../program.js"

const run = async (env: NodeJS.ProcessEnv, ...args: string[]) => {
  const streams = captureStreams()
  await createProgram({ env, streams })
    .exitOverride()
    .parseAsync(args.some((arg) => arg === "--json" || arg.startsWith("--json=")) ? args : [...args, "--json"], {
      from: "user",
    })
  return answerOf(streams.stdout.join(""))
}
const targetArgs = (f: Awaited<ReturnType<typeof projectAnnotationFixture>>) => [
  "--target-store",
  f.target,
  "--project",
  f.targetProject.ref,
  "--bindings",
  f.bindingsFile,
  "--max-read-bytes",
  "4194304",
]

it("exports a new private file read-only without overwriting an existing snapshot", async () => {
  const f = await projectAnnotationFixture(),
    sourceBefore = readFileSync(f.source)
  const exported = await run(
    f.env,
    "projects",
    "annotations",
    "export",
    "RES",
    "--output",
    f.snapshotFile,
    "--max-read-bytes",
    "4194304",
  )
  expect(exported).toMatchObject({
    project: f.project.ref,
    counts: { aliases: 1, facts: 1, links: 1 },
    coverage: { notes: "omitted", tasks: "omitted" },
  })
  expect(readFileSync(f.source)).toEqual(sourceBefore)
  expect(readFileSync(f.snapshotFile, "utf8")).not.toContain("INVENTED_SOURCE_BODY_SENTINEL")
  if (process.platform !== "win32") expect(statSync(f.snapshotFile).mode & 0o777).toBe(0o600)
  await expect(
    run(f.env, "projects", "annotations", "export", "RES", "--output", f.snapshotFile),
  ).rejects.toMatchObject({ code: "validation_error" })
  const projected = await run(
    f.env,
    "projects",
    "annotations",
    "export",
    f.project.ref,
    "--output",
    join(f.directory, "projected.json"),
    "--json=project,counts",
  )
  expect(projected).toMatchObject({ project: f.project.ref, counts: { facts: 1 } })
  expect(projected.output_file).toBeUndefined()
})

it("previews and owner-restores through standard envelopes without duplicating a repeat", async () => {
  const f = await projectAnnotationFixture()
  await run(f.env, "projects", "annotations", "export", "RES", "--output", f.snapshotFile)
  const targetBefore = readFileSync(f.target)
  const preview = await run(f.env, "projects", "annotations", "check", f.snapshotFile, ...targetArgs(f))
  expect(preview).toMatchObject({ ready: true, namespace_conflicts: [], descriptor_conflicts: [] })
  expect(readFileSync(f.target)).toEqual(targetBefore)
  const restored = await run(
    f.env,
    "projects",
    "annotations",
    "restore",
    f.snapshotFile,
    ...targetArgs(f),
    "--fingerprint",
    preview.fingerprint,
  )
  expect(restored).toMatchObject({ project: f.targetProject.ref, counts: { aliases: 1, facts: 1, links: 1 } })
  expect(Array.isArray(restored.mappings)).toBe(true)
  const store = await openStore({ path: f.target, env: f.env, readOnly: true })
  try {
    expect((await store.facts.list({ project: f.targetProject.ref })).map((fact) => fact.status)).toEqual(["proposed"])
    expect(await store.facts.list({ project: f.unrelated.ref })).toHaveLength(2)
  } finally {
    await store.close()
  }
  await expect(
    run(
      f.env,
      "projects",
      "annotations",
      "restore",
      f.snapshotFile,
      ...targetArgs(f),
      "--fingerprint",
      preview.fingerprint,
    ),
  ).rejects.toMatchObject({ code: "validation_error" })
})

it("refuses agent or read-only restoration and stale previews without touching the selected records", async () => {
  const f = await projectAnnotationFixture()
  await run(f.env, "projects", "annotations", "export", "RES", "--output", f.snapshotFile)
  const preview = await run(f.env, "projects", "annotations", "check", f.snapshotFile, ...targetArgs(f))
  const args = [
    "projects",
    "annotations",
    "restore",
    f.snapshotFile,
    ...targetArgs(f),
    "--fingerprint",
    preview.fingerprint,
  ]
  const before = readFileSync(f.target)
  await expect(run({ ...f.env, AI_AGENT: "synthetic-agent_1" }, ...args)).rejects.toMatchObject({
    code: "permission_error",
  })
  await expect(run({ ...f.env, MEMO_READ_ONLY: "1" }, ...args)).rejects.toMatchObject({ code: "permission_error" })
  expect(readFileSync(f.target)).toEqual(before)
  const changed = await openStore({ path: f.target, env: f.env })
  try {
    await changed.knowledge.addVocabularyAlias({ kind: "project", id: f.unrelated.id }, "Example study")
  } finally {
    await changed.close()
  }
  await expect(run(f.env, ...args)).rejects.toMatchObject({ code: "validation_error" })
})

it("refuses malformed and oversized ordinary input files before creating a missing destination", async () => {
  const f = await projectAnnotationFixture(),
    missing = join(f.directory, "missing.db")
  await run(f.env, "projects", "annotations", "export", "RES", "--output", f.snapshotFile)
  await expect(
    run(
      { ...f.env, MESSAGING_STORE: missing },
      "projects",
      "annotations",
      "export",
      f.project.ref,
      "--output",
      f.snapshotFile,
    ),
  ).rejects.toMatchObject({ code: "validation_error", message: expect.stringContaining("already exists") })
  expect(existsSync(missing)).toBe(false)
  writeFileSync(f.bindingsFile, "not JSON")
  await expect(
    run(
      f.env,
      "projects",
      "annotations",
      "check",
      f.snapshotFile,
      "--target-store",
      missing,
      "--project",
      f.targetProject.ref,
      "--bindings",
      f.bindingsFile,
    ),
  ).rejects.toMatchObject({ code: "validation_error" })
  writeFileSync(f.snapshotFile, Buffer.alloc(4194305))
  await expect(run(f.env, "projects", "annotations", "check", f.snapshotFile, ...targetArgs(f))).rejects.toMatchObject({
    code: "validation_error",
  })
})
