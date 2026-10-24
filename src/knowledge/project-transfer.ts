import { lstat } from "node:fs/promises"
import { CliError } from "@wirecat/cli-base"
import { readBoundedUtf8File, writeFileAtomic } from "@wirecat/cli-core/files"
import {
  decodeProjectAnnotationSnapshot,
  openStore,
  PROJECT_ANNOTATIONS_MAX_BYTES,
  type ProjectAnnotationPreviewOptions,
  previewProjectAnnotationSnapshot,
  snapshotProjectAnnotations,
  storePath,
} from "@wirecat/cli-core/store"
import * as v from "valibot"
import { authorOf } from "../author.js"
import { mcpOwnerAllowed } from "../mcp/permissions.js"
import { canonicalProject } from "../vocabulary/project.js"

export const snapshotAnnotations = async (env: NodeJS.ProcessEnv, project: string, maxReadBytes?: number) => {
  const source = storePath(env)
  let reference = /^[1-9]\d*$/.test(project) ? `project:${project}` : project
  if (!reference.startsWith("project:")) {
    const store = await openStore({ path: source, env, readOnly: true })
    try {
      reference = await canonicalProject(store, project, {
        maxEntries: 1000,
        maxReadBytes: Math.min(maxReadBytes ?? PROJECT_ANNOTATIONS_MAX_BYTES, PROJECT_ANNOTATIONS_MAX_BYTES),
      })
    } finally {
      await store.close()
    }
  }
  return snapshotProjectAnnotations({
    source,
    project: reference,
    env,
    ...(maxReadBytes === undefined ? {} : { maxReadBytes }),
  })
}

export const exportAnnotations = async (
  env: NodeJS.ProcessEnv,
  project: string,
  output: string,
  maxReadBytes?: number,
) => {
  try {
    await lstat(output)
    throw new CliError("validation_error", "snapshot output already exists; choose another path")
  } catch (error) {
    if (!(typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")) throw error
  }
  const result = await snapshotAnnotations(env, project, maxReadBytes)
  try {
    await writeFileAtomic(output, JSON.stringify(result.snapshot), { overwrite: false })
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST")
      throw new CliError("validation_error", "snapshot output already exists; choose another path")
    throw error
  }
  return {
    output_file: output,
    project: result.snapshot.project.ref,
    manifest_fingerprint: result.fingerprint,
    coverage: result.snapshot.coverage,
    counts: {
      aliases: result.snapshot.aliases.length,
      facts: result.snapshot.facts.length,
      links: result.snapshot.links.length,
    },
    read_bytes: result.read_bytes,
    records: result.records,
  }
}

export const annotationInputs = async (snapshotFile: string, bindingsFile: string) => {
  const snapshot = await readBoundedUtf8File(snapshotFile, { maxBytes: PROJECT_ANNOTATIONS_MAX_BYTES })
  decodeProjectAnnotationSnapshot(snapshot)
  let bindings: unknown
  try {
    bindings = JSON.parse(await readBoundedUtf8File(bindingsFile, { maxBytes: PROJECT_ANNOTATIONS_MAX_BYTES }))
  } catch (error) {
    if (error instanceof SyntaxError) throw new CliError("validation_error", "bindings file must contain a JSON object")
    throw error
  }
  const checked = v.safeParse(v.record(v.string(), v.string()), bindings)
  if (!checked.success)
    throw new CliError("validation_error", "bindings must map source references to target reference strings")
  return { snapshot, bindings: checked.output }
}

export type AnnotationPreviewInput = Omit<ProjectAnnotationPreviewOptions, "env">
export const previewAnnotations = (env: NodeJS.ProcessEnv, input: AnnotationPreviewInput) =>
  previewProjectAnnotationSnapshot({ ...input, env })

export const assertAnnotationRestoreOwner = (env: NodeJS.ProcessEnv) => {
  if (authorOf(env) !== "owner" && !mcpOwnerAllowed(env, "projects.annotations.restore"))
    throw new CliError(
      "permission_error",
      "project annotation restore belongs to the owner; agents may export and preview",
    )
}

export const restoreAnnotations = async (
  env: NodeJS.ProcessEnv,
  input: AnnotationPreviewInput & { fingerprint: string },
) => {
  assertAnnotationRestoreOwner(env)
  const { fingerprint, ...options } = input
  const preview = await previewAnnotations(env, options)
  if (!preview.ready || preview.fingerprint !== fingerprint)
    throw new CliError("validation_error", "project annotation preview is stale or has conflicts; preview again")
  const store = await openStore({ path: options.target, env })
  try {
    if (!store.projectAnnotations)
      throw new CliError("configuration_error", "project annotation restore is unavailable")
    const result = await store.projectAnnotations.restore({
      snapshot: options.snapshot,
      project: options.project,
      bindings: options.bindings,
      fingerprint,
      ...(options.maxReadBytes === undefined ? {} : { maxReadBytes: options.maxReadBytes }),
    })
    return { ...result, mappings: Object.entries(result.mappings).map(([source, target]) => ({ source, target })) }
  } finally {
    await store.close()
  }
}
