import type { Streams } from "@wirecat/cli-base"
import type { Body } from "@wirecat/cli-core/cli"
import type { MessageStore } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { answers, itemAnswer, listAnswer } from "../answer.js"
import { positive } from "../options.js"
import { canonicalProject } from "../vocabulary/project.js"

type Options = {
  provider: string
  account: string
  json?: boolean
  proposed?: boolean
  limit: number
  page?: number
  fingerprint?: string
  reason?: string
}
export const meetingProjectsCommand = (projects: Command, streams: Streams, env: NodeJS.ProcessEnv) => {
  const group = projects.command("meetings").description("explicit account-scoped project membership")
  const options = (command: Command) =>
    command
      .requiredOption("--provider <provider>", "meeting provider")
      .requiredOption("--account <account>", "exact stored meeting account")
      .option("--json", "print JSON; --json=id,title keeps only those fields")
  const { run } = answers(projects, streams, env)
  const execute = (
    project: string,
    options: Options,
    work: (store: MessageStore, projectId: string) => Promise<Body>,
  ) => run(options.json, async (store) => work(store, (await canonicalProject(store, project)).slice(8)))
  options(
    group
      .command("list")
      .description("meetings linked to a project in one account, or proposed links")
      .argument("<project>", "project reference, key or explicit alias"),
  )
    .option("--proposed", "show proposed memberships instead of confirmed ones")
    .option("--limit <n>", "meetings per page, at most 500", positive, 50)
    .option("--page <n>", "which page, from 1", positive)
    .action((project: string, given: Options) =>
      execute(project, given, async (store, projectId) => {
        const page = given.page ?? 1
        const found = await store.knowledge.meetingProjects(
          { provider: given.provider, account: given.account },
          { projectId, confirmed: !given.proposed, limit: given.limit, offset: (page - 1) * given.limit },
        )
        return listAnswer("projects meetings list", {
          items: found.items,
          limit: given.limit,
          has_more: found.hasMore,
          page,
          args: {
            project,
            provider: given.provider,
            account: given.account,
            ...(given.proposed ? { proposed: true } : {}),
          },
        })
      }),
    )
  options(
    group
      .command("link")
      .description("link a stored meeting to a project, or confirm a proposed link")
      .argument("<project>", "project reference, key or explicit alias")
      .argument("<meeting-id>", "positive stored meeting id"),
  )
    .option("--fingerprint <hash>", "required when confirming an existing proposal")
    .option("--reason <text>", "why the reviewed meeting belongs to this project")
    .action((project: string, meeting: string, given: Options) =>
      execute(project, given, async (store, projectId) =>
        itemAnswer(
          await store.knowledge.linkMeetingProject(
            { provider: given.provider, account: given.account },
            meeting,
            projectId,
            {
              by: "owner",
              ...(given.fingerprint === undefined ? {} : { expectedFingerprint: given.fingerprint }),
              ...(given.reason === undefined ? {} : { provenance: given.reason }),
            },
          ),
        ),
      ),
    )
}
