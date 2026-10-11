import type { Streams } from "@wirecat/cli-base"
import { approveAsTask } from "@wirecat/cli-messaging/services"
import { PROPOSAL_STATUSES, type ProposedAction } from "@wirecat/cli-messaging/store"
import type { Command } from "commander"
import { oneOf, positive } from "../options.js"
import { answering } from "../records/run.js"
import { type NewProposal, propose } from "./actions.js"

export const actionsCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const run = answering(streams, env)
  const actions = program
    .command("actions")
    .description("What an agent proposes to do; approving one makes it your task, nothing is sent")

  actions
    .command("propose")
    .description("Propose an action, such as a reply or a ban, in the account that would act")
    .argument("<kind>", "a lower-case word: reply, send, ban, mute, pin, invite, create_task, …")
    .requiredOption("--reason <text>", "why it should be done")
    .requiredOption("--provider <provider>", "the provider of the account that would act")
    .option("--account <account>", "the account that would act, when the provider has several")
    .option("--target <ref>", "what it acts on: msg:, chat:, contact:, person:, task:, …")
    .option("--payload <json>", "what to do, as JSON, such as the reply's text")
    .option("--json", "print JSON")
    .action((kind: string, options: Omit<NewProposal, "kind"> & { json?: boolean }) =>
      run(options.json, (store) => propose(store, { ...options, kind }, "owner")),
    )

  actions
    .command("list")
    .description("Proposed actions, newest first")
    .option("--status <status>", PROPOSAL_STATUSES.join(", "), oneOf(PROPOSAL_STATUSES))
    .option("--limit <n>", "most actions, up to 500", positive, 100)
    .option("--json", "print JSON")
    .action((options: { status?: ProposedAction["status"]; limit: number; json?: boolean }) =>
      run(options.json, async (store) => ({
        items: await store.proposedActions.list({
          limit: options.limit,
          ...(options.status === undefined ? {} : { status: options.status }),
        }),
      })),
    )

  actions
    .command("show")
    .description("One proposed action, with its payload")
    .argument("<id>")
    .option("--json", "print JSON")
    .action((id: string, options: { json?: boolean }) => run(options.json, (store) => store.proposedActions.get(id)))

  actions
    .command("approve")
    .description("Approve it: it becomes a task in the account that would act; nothing is sent")
    .argument("<id>")
    .option("--json", "print JSON")
    .action((id: string, options: { json?: boolean }) => run(options.json, (store) => approveAsTask(store, id)))

  actions
    .command("reject")
    .description("Reject it; nothing is done")
    .argument("<id>")
    .option("--json", "print JSON")
    .action((id: string, options: { json?: boolean }) => run(options.json, (store) => store.proposedActions.reject(id)))
}
