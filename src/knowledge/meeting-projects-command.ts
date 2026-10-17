import type { Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import type { QueryRegistry } from "@wirecat/cli-base/query"
import { type Body, LOCAL_READ, LOCAL_WRITE, queryTerms, termField, withQuery } from "@wirecat/cli-core/cli"
import type { AccountKey, MessageStore } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { answers, itemAnswer, listAnswer } from "../answer.js"
import { positive } from "../options.js"
import {
  accountName,
  MEETING_ACCOUNT_HELP,
  type SourceOptions,
  sourceOptions,
  theAccount,
} from "../store/source-list.js"
import { canonicalProject } from "../vocabulary/project.js"

type Options = SourceOptions & {
  json?: boolean
  limit: number
  page?: number
  fingerprint?: string
  reason?: string
}
const MEETING_PROJECTS_QUERY = {
  entity: "meeting_project",
  backend: "native",
  fields: [termField("confirmed", "bool", "confirmed:false")],
  defaults: ["confirmed:true"],
} as const satisfies QueryRegistry

export const meetingProjectsCommand = (projects: Command, streams: Streams, env: NodeJS.ProcessEnv) => {
  const group = projects.command("meetings").description("explicit account-scoped project membership")
  const options = (command: Command) =>
    sourceOptions(command, MEETING_ACCOUNT_HELP).option("--json", "print JSON; --json=id,title keeps only those fields")
  const { run } = answers(projects, streams, env)
  const warn = (text: string) => streams.diagnostic(text)
  const execute = (
    project: string,
    options: Options,
    work: (store: MessageStore, projectId: string, key: AccountKey) => Promise<Body>,
  ) =>
    run(options.json, async (store) => {
      const key = await theAccount(store, env, options, warn)
      return work(store, (await canonicalProject(store, project)).slice(8), key)
    })
  withQuery(
    options(
      annotate(group.command("list"), { effects: LOCAL_READ, output: { entity: "meeting_project" } })
        .description("meetings linked to a project in one account, or with confirmed:false proposed")
        .argument("<project>", "project reference, key or explicit alias"),
    ),
    MEETING_PROJECTS_QUERY,
  )
    .option("--limit <n>", "meetings per page, at most 500", positive, 50)
    .option("--page <n>", "which page, from 1", positive)
    .action((project: string, words: string[], given: Options) =>
      execute(project, given, async (store, projectId, key) => {
        const confirmed = queryTerms(words, MEETING_PROJECTS_QUERY, "projects meetings list").get("confirmed")
        const page = given.page ?? 1
        const found = await store.knowledge.meetingProjects(key, {
          projectId,
          confirmed: confirmed === "true",
          limit: given.limit,
          offset: (page - 1) * given.limit,
        })
        return listAnswer("projects meetings list", {
          items: found.items,
          limit: given.limit,
          has_more: found.hasMore,
          page,
          args: {
            project,
            source: accountName(key),
            ...(words.length === 0 ? {} : { query: words.join(" ") }),
          },
        })
      }),
    )
  options(
    annotate(group.command("link"), { effects: LOCAL_WRITE })
      .description("link a stored meeting to a project, or confirm a proposed link")
      .argument("<project>", "project reference, key or explicit alias")
      .argument("<meeting-id>", "positive stored meeting id"),
  )
    .option("--fingerprint <hash>", "required when confirming an existing proposal")
    .option("--reason <text>", "why the reviewed meeting belongs to this project")
    .action((project: string, meeting: string, given: Options) =>
      execute(project, given, async (store, projectId, key) =>
        itemAnswer(
          await store.knowledge.linkMeetingProject(key, meeting, projectId, {
            by: "owner",
            ...(given.fingerprint === undefined ? {} : { expectedFingerprint: given.fingerprint }),
            ...(given.reason === undefined ? {} : { provenance: given.reason }),
          }),
        ),
      ),
    )
}
