import type { Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { LOCAL_READ, LOCAL_WRITE } from "@wirecat/cli-core/cli"
import type { Command } from "commander"
import { answers, itemAnswer } from "../answer.js"
import { positive } from "../options.js"
import {
  annotationInputs,
  assertAnnotationRestoreOwner,
  exportAnnotations,
  previewAnnotations,
  restoreAnnotations,
} from "./project-transfer.js"

interface Options {
  json?: boolean
  output?: string
  targetStore: string
  project: string
  bindings: string
  fingerprint: string
  maxReadBytes?: number
}
export const projectTransferCommand = (projects: Command, streams: Streams, env: NodeJS.ProcessEnv) => {
  const group = projects
    .command("annotations")
    .description("selected project aliases, facts and generic links; not a full backup")
  const { print } = answers(projects, streams, env)
  annotate(group.command("export"), { effects: LOCAL_WRITE, output: { entity: "project_annotation_export" } })
    .description("write selected annotations to a new private file, omitting source bodies")
    .argument("<project>", "the project's id, key, exact name or alias")
    .requiredOption("--output <file>", "new snapshot file; parent folder must exist and existing paths are refused")
    .option("--max-read-bytes <bytes>", "source input byte budget, at most 4194304", positive)
    .option("--json", "print JSON; --json=project,counts keeps only those fields")
    .action(async (project: string, options: Options) =>
      print(
        options.json,
        itemAnswer(await exportAnnotations(env, project, options.output ?? "", options.maxReadBytes)),
      ),
    )
  for (const name of ["check", "restore"] as const) {
    const command = annotate(group.command(name), {
      effects: name === "check" ? LOCAL_READ : LOCAL_WRITE,
      output: { entity: "project_annotation_transfer" },
    })
      .description(
        name === "check"
          ? "check bindings and conflicts in an existing target without restoring"
          : "owner: restore selected annotations with the exact successful check fingerprint",
      )
      .argument("<file>", "version2 snapshot JSON file, at most 4194304 UTF-8 bytes")
      .requiredOption("--target-store <file>", "explicit existing destination store; never created by preview")
      .requiredOption(
        "--project <project>",
        "explicit destination project:<id>; its key and name must match the snapshot",
      )
      .requiredOption(
        "--bindings <file>",
        "JSON object mapping every external source reference and the project to explicit target references",
      )
      .option("--max-read-bytes <bytes>", "destination input byte budget, at most 4194304", positive)
      .option(
        "--json",
        name === "check"
          ? "print JSON; --json=ready,fingerprint keeps only those fields"
          : "print JSON; --json=project,counts keeps only those fields",
      )
    if (name === "restore")
      command.requiredOption("--fingerprint <hash>", "exact fingerprint returned by the successful target preview")
    command.action(async (file: string, options: Options) => {
      if (name === "restore") assertAnnotationRestoreOwner(env)
      const input = {
        ...(await annotationInputs(file, options.bindings)),
        target: options.targetStore,
        project: options.project,
        ...(options.maxReadBytes === undefined ? {} : { maxReadBytes: options.maxReadBytes }),
      }
      const result =
        name === "check"
          ? await previewAnnotations(env, input)
          : await restoreAnnotations(env, { ...input, fingerprint: options.fingerprint })
      print(options.json, itemAnswer(result))
    })
  }
}
