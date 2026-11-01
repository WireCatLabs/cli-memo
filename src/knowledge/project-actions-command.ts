import { createReadStream } from "node:fs"
import { CliError, readBatchInput, type Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import type { QueryRegistry } from "@wirecat/cli-base/query"
import {
  answerEntity,
  environmentOf,
  LOCAL_READ,
  LOCAL_WRITE,
  parseEvidenceFindingsJson,
  queryTerms,
  termField,
  withQuery,
} from "@wirecat/cli-core/cli"
import type { Command } from "commander"
import * as v from "valibot"
import { answers, itemAnswer, listAnswer } from "../answer.js"
import { authorOf, byOption } from "../author.js"
import { positive, whole } from "../options.js"
import { projectOf } from "./key-documents.js"
import { decideAction, deciderOf, projectActions } from "./project-actions.js"

const ACTIONS_QUERY = {
  entity: "project_action",
  backend: "native",
  fields: [termField("status", "enum", "status:proposed", { values: ["proposed", "reviewed"] })],
  defaults: ["status:proposed"],
} as const satisfies QueryRegistry

const json = (command: Command) => command.option("--json", "print JSON; --json=id,status keeps only those fields")

export const projectActionsCommand = (projects: Command, streams: Streams, env: NodeJS.ProcessEnv) => {
  const group = projects
    .command("actions")
    .description("cited key documents and findings an agent proposed for a project, with the evidence to decide them")
    .summary("an agent's proposals for a project, and deciding them")
  const { run } = answers(projects, streams, env)

  json(annotate(group.command("add"), { effects: LOCAL_WRITE }))
    .description("stage an agent's cited facts and follow-ups about one project for review")
    .argument("<file>", "JSON findings file, or - for stdin; at most 65536 UTF-8 bytes")
    .addHelpText(
      "after",
      "\nInput: schema_version 1, key, extractor, findings. Every finding names id, kind and evidence: 1–8 msg:, " +
        "document: or note: references with the fingerprint projects evidence or notes show gives. A fact may name a " +
        "project and a subject (person:, organization:, task: or project:), or neither; a task names its project. " +
        "Facts name type and statement; tasks name type, title, reason and commitment (explicit or inferred). A due_at " +
        "or assignee needs due_evidence or assignee_evidence citing this finding's references. At most one project per " +
        "batch. The same key and input returns the same batch; actions confirm and reject decide it by its id.\n",
    )
    .action(async (file: string, given: { json?: boolean }) => {
      const input = parseEvidenceFindingsJson(
        await readBatchInput(file === "-" ? (environmentOf(projects).stdin ?? process.stdin) : createReadStream(file)),
      )
      const author = authorOf(env)
      if (author === "owner")
        throw new CliError("validation_error", "findings are an agent's proposals; record your own with memo facts add")
      await run(given.json, async (store) => itemAnswer(await store.evidenceFindings.stage(input, author)))
    })

  withQuery(
    json(
      answerEntity(
        annotate(group.command("list"), { effects: LOCAL_READ }),
        "project_action",
        v.union([
          v.strictObject({
            kind: v.literal("key_document"),
            id: v.string(),
            status: v.literal("proposed"),
            reason: v.nullable(v.string()),
            provenance: v.unknown(),
            evidence: v.array(v.unknown()),
          }),
          v.strictObject({
            kind: v.literal("findings"),
            id: v.string(),
            status: v.string(),
            fingerprint: v.string(),
            author: v.unknown(),
            key: v.string(),
            extractor: v.string(),
            decided_by: v.unknown(),
            decision: v.unknown(),
            findings: v.array(v.unknown()),
          }),
        ]),
      ),
    ).argument("<project>", "the project's id, project:<id>, key, exact name or alias"),
    ACTIONS_QUERY,
  )
    .summary("a project's proposals with the evidence to decide them")
    .description(
      "a project's proposed key documents and findings, newest first, with source state, cited text and nearby " +
        "messages or document paragraphs; key-document text is untracked because no fingerprint was saved",
    )
    .option("--limit <n>", "findings batches per page, at most 50", positive, 10)
    .option("--page <n>", "which page, from 1; key documents come on the first", positive, 1)
    .option("--brief", "only references and source state, without excerpts or nearby text")
    .option("--before-n <n>", "messages or document paragraphs before the citation, at most 5", whole, 2)
    .option("--after-n <n>", "messages or document paragraphs after the citation, at most 5", whole, 2)
    .action(
      (
        reference: string,
        words: string[],
        given: { json?: boolean; limit: number; page: number; brief?: boolean; beforeN: number; afterN: number },
      ) =>
        run(given.json, async (store) => {
          const status = queryTerms(words, ACTIONS_QUERY, "projects actions list").get("status") as
            | "proposed"
            | "reviewed"
          const project = await projectOf(store, reference)
          const found = await projectActions(store, project, {
            status,
            limit: given.limit,
            page: given.page,
            brief: given.brief === true,
            before: Math.min(given.beforeN, 5),
            after: Math.min(given.afterN, 5),
          })
          return listAnswer("projects actions list", {
            items: found.items,
            limit: given.limit,
            page: given.page,
            has_more: found.hasMore,
            args: { project: reference, query: words.join(" ") },
          })
        }),
    )

  for (const name of ["confirm", "reject"] as const) {
    const command = byOption(
      json(annotate(group.command(name), { effects: LOCAL_WRITE }))
        .description(
          name === "confirm"
            ? "confirm a suggested key document, or create the named findings of a batch and reject its other new " +
                "ones; an agent decides for you only with --reason, unless agent_decisions is false"
            : "reject a suggested key document, or every new finding of a batch",
        )
        .summary(name === "confirm" ? "confirm a proposal, yours or an agent's with --reason" : "reject a proposal")
        .argument("<project>", "the project's id, project:<id>, key, exact name or alias")
        .argument(
          "<id>",
          "key:<id> for a key document, or a findings batch number, as projects actions list gives them",
        ),
    )
    if (name === "confirm") command.argument("[findings...]", "the finding IDs of a batch to create")
    command
      .option("--fingerprint <hash>", "a findings batch's fingerprint, as projects actions list gives it")
      .option("--reason <text>", "why, in a few words; required when an agent decides for you")
      .action(async (reference: string, id: string, ...rest: unknown[]) => {
        const accept = name === "confirm" ? (rest[0] as string[]) : []
        const given = (name === "confirm" ? rest[1] : rest[0]) as {
          json?: boolean
          fingerprint?: string
          reason?: string
          asOwner?: boolean
        }
        await run(given.json, async (store) => {
          const by = deciderOf(env, authorOf(env, given.asOwner), given.reason)
          const project = await projectOf(store, reference)
          return itemAnswer(
            await decideAction(store, project, id, {
              confirm: name === "confirm",
              ...(given.fingerprint === undefined ? {} : { fingerprint: given.fingerprint }),
              accept,
              by,
            }),
          )
        })
      })
  }
}
