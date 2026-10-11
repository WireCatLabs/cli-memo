import { createRenderer, type Streams } from "@wirecat/cli-base"
import { type MessageStore, openStore } from "@wirecat/cli-messaging/store"
import type { Command } from "commander"
import { positive } from "../options.js"
import { canonicalProject } from "../vocabulary/project.js"

type Options = {
  provider: string
  account: string
  json?: boolean
  proposed?: boolean
  limit?: number
  offset?: number
  expected?: string
  provenance?: string
}
export const meetingProjectsCommand = (projects: Command, streams: Streams, env: NodeJS.ProcessEnv) => {
  const group = projects.command("meetings").description("Explicit account-scoped project membership")
  const options = (command: Command) =>
    command
      .requiredOption("--provider <provider>", "meeting provider")
      .requiredOption("--account <account>", "exact stored meeting account")
      .option("--json", "print JSON")
  const execute = async (
    project: string,
    options: Options,
    work: (store: MessageStore, projectId: string) => Promise<unknown>,
  ) => {
    const store = await openStore({ env })
    try {
      const reference = await canonicalProject(store, project)
      const answer = await work(store, reference.slice(8))
      if (options.json) createRenderer({ format: "json", color: false, streams }).result(answer)
      else streams.data(`${JSON.stringify(answer, null, 2)}\n`)
    } finally {
      await store.close()
    }
  }
  options(
    group
      .command("list")
      .description("Meetings linked to a project in one account, or proposed links")
      .argument("<project>", "project reference, key or explicit alias"),
  )
    .option("--proposed", "show proposed memberships instead of confirmed ones")
    .option("--limit <n>", "meetings per page", positive)
    .option("--offset <n>", "rows to skip", (value) => Number(value))
    .action((project: string, given: Options) =>
      execute(project, given, (store, projectId) =>
        store.knowledge.meetingProjects(
          { provider: given.provider, account: given.account },
          {
            projectId,
            confirmed: !given.proposed,
            ...(given.limit === undefined ? {} : { limit: given.limit }),
            ...(given.offset === undefined ? {} : { offset: given.offset }),
          },
        ),
      ),
    )
  options(
    group
      .command("link")
      .description("Link a stored meeting to a project, or confirm a proposed link")
      .argument("<project>")
      .argument("<meeting-id>", "positive stored meeting id"),
  )
    .option("--expected <fingerprint>", "required when confirming an existing proposal")
    .option("--provenance <text>", "why the reviewed meeting belongs to this project")
    .action((project: string, meeting: string, given: Options) =>
      execute(project, given, (store, projectId) =>
        store.knowledge.linkMeetingProject({ provider: given.provider, account: given.account }, meeting, projectId, {
          by: "owner",
          ...(given.expected === undefined ? {} : { expectedFingerprint: given.expected }),
          ...(given.provenance === undefined ? {} : { provenance: given.provenance }),
        }),
      ),
    )
}
