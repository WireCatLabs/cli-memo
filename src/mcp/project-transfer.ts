import { projectAnnotationSnapshotSchema } from "@wirecat/cli-core/store"
import * as v from "valibot"
import { itemAnswer } from "../answer.js"
import { previewAnnotations, snapshotAnnotations } from "../knowledge/project-transfer.js"
import { define } from "./tool.js"

const text = v.pipe(v.string(), v.minLength(1))
const maxReadBytes = v.optional(v.pipe(v.number(), v.safeInteger(), v.minValue(1), v.maxValue(4194304)))
export const projectTransferTools = {
  project_annotations_snapshot: define({
    title: "Read selected project annotations",
    description:
      "Read a version2 snapshot of one project's aliases, facts and generic links with external content hashes. Omits notes, meeting memberships, tasks, memories, labels and findings; it is not a full backup. Source bodies are omitted, proposed state is preserved and nothing is confirmed. MCP still records its normal call audit.",
    writes: false,
    input: v.object({ project: text, max_read_bytes: maxReadBytes }),
    run: async (_store, { project, max_read_bytes }, env) =>
      itemAnswer(await snapshotAnnotations(env, project, max_read_bytes)),
  }),
  project_annotations_preview: define({
    title: "Preview selected project annotation restore",
    description:
      "Read an explicit existing destination, compare bindings/content and report namespace/descriptor conflicts with a fingerprint. Uses the version2 snapshot returned by project_annotations_snapshot. Writes no annotations. Restore is owner-only through CLI and is not an MCP tool. MCP still records its normal call audit.",
    writes: false,
    input: v.object({
      snapshot: projectAnnotationSnapshotSchema,
      target_store: text,
      project: text,
      bindings: v.record(v.string(), v.string()),
      max_read_bytes: maxReadBytes,
    }),
    run: async (_store, args, env) =>
      itemAnswer(
        await previewAnnotations(env, {
          snapshot: JSON.stringify(args.snapshot),
          target: args.target_store,
          project: args.project,
          bindings: args.bindings,
          ...(args.max_read_bytes === undefined ? {} : { maxReadBytes: args.max_read_bytes }),
        }),
      ),
  }),
}
