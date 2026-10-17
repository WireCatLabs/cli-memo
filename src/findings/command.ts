import { createReadStream } from "node:fs"
import { CliError, readBatchInput, type Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import type { QueryRegistry } from "@wirecat/cli-base/query"
import {
  LOCAL_READ,
  LOCAL_WRITE,
  parseMeetingFindingsJson,
  queryTerms,
  termField,
  withQuery,
} from "@wirecat/cli-core/cli"
import type { Command } from "commander"
import { answers, itemAnswer, listAnswer } from "../answer.js"
import { authorOf } from "../author.js"
import { positive } from "../options.js"

type Options = {
  provider: string
  account: string
  json?: boolean
  limit: number
  page: number
  fingerprint: string
}
const FINDINGS_QUERY = {
  entity: "meeting_findings",
  backend: "native",
  fields: [termField("status", "enum", "status:proposed", { values: ["proposed", "reviewed"] })],
} as const satisfies QueryRegistry
const scope = (options: Options) => ({ provider: options.provider, account: options.account })
export const findingsCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const group = program
    .command("meetings")
    .description("stored meeting evidence and reviewed findings")
    .command("actions")
    .description("cited meeting facts and project tasks waiting for owner review")
  const { run } = answers(program, streams, env)
  const options = (command: Command) =>
    command
      .requiredOption("--provider <provider>", "meeting provider")
      .requiredOption("--account <account>", "exact stored meeting account")
      .option("--json", "print JSON; --json=id,status keeps only those fields")
  options(annotate(group.command("add"), { effects: LOCAL_WRITE, output: { entity: "meeting_findings" } }))
    .description("stage cited findings; facts and tasks wait for owner confirmation")
    .argument("<file>", "JSON proposal file, or - for stdin; at most 65536 UTF-8 bytes")
    .addHelpText(
      "after",
      "\nInput: schema_version 1, key, extractor, findings. Every finding names id, kind, project and evidence (reference and fingerprint). Facts name type and statement; tasks name type, title, reason and commitment (explicit or inferred). At most 16 findings, each with 1–8 exact cues from Zoom evidence. Optional due_at is a real ISO timestamp with timezone and requires due_evidence; optional assignee is a person reference and requires assignee_evidence. Both support lists cite this finding's cue references.\n",
    )
    .action(async (file: string, given: Options) => {
      const text = await readBatchInput(file === "-" ? process.stdin : createReadStream(file))
      const input = parseMeetingFindingsJson(text)
      const author = authorOf(env)
      const agent = author === "owner" ? { bot: "memo-findings" } : author
      await run(given.json, async (store) => itemAnswer(await store.meetingFindings.stage(scope(given), input, agent)))
    })
  options(annotate(group.command("show"), { effects: LOCAL_READ, output: { entity: "meeting_findings" } }))
    .description("one findings preview, prior decisions and its review receipt")
    .argument("<id>", "stored findings batch ID")
    .action((id: string, given: Options) =>
      run(given.json, async (store) => itemAnswer(await store.meetingFindings.get(scope(given), id))),
    )
  withQuery(
    options(annotate(group.command("list"), { effects: LOCAL_READ, output: { entity: "meeting_findings" } })),
    FINDINGS_QUERY,
  )
    .description("findings batches in one meeting account, newest first")
    .option("--limit <n>", "batches per page, at most 50", positive, 20)
    .option("--page <n>", "which page, from 1", positive, 1)
    .action((words: string[], given: Options) =>
      run(given.json, async (store) => {
        const status = queryTerms(words, FINDINGS_QUERY, "meetings actions list").get("status") as
          | "proposed"
          | "reviewed"
          | undefined
        const found = await store.meetingFindings.list(scope(given), {
          limit: given.limit,
          offset: (given.page - 1) * given.limit,
          ...(status === undefined ? {} : { status }),
        })
        return listAnswer("meetings actions list", {
          items: found.items,
          limit: given.limit,
          page: given.page,
          has_more: found.hasMore,
          args: { query: words.join(" "), provider: given.provider, account: given.account, limit: given.limit },
        })
      }),
    )
  for (const name of ["confirm", "reject"] as const) {
    const command = options(
      annotate(group.command(name), { effects: LOCAL_WRITE, output: { entity: "meeting_findings" } }),
    )
      .description(
        name === "confirm"
          ? "owner only: create selected findings and reject the other new candidates"
          : "owner only: reject every new candidate in this batch",
      )
      .argument("<id>", "stored findings batch ID")
      .requiredOption("--fingerprint <hash>", "the exact fingerprint shown in the preview")
    const review = (id: string, given: Options, accept: string[]) => {
      if (authorOf(env) !== "owner")
        throw new CliError(
          "validation_error",
          "findings confirmation and rejection belong to the owner; agents must leave proposals for review",
        )
      return run(given.json, async (store) =>
        itemAnswer(await store.meetingFindings.review(scope(given), id, { fingerprint: given.fingerprint, accept })),
      )
    }
    if (name === "confirm")
      command
        .argument("<ids...>", "candidate IDs to accept; other new candidates are rejected")
        .action((id: string, ids: string[], given: Options) => review(id, given, ids))
    else command.action((id: string, given: Options) => review(id, given, []))
  }
}
