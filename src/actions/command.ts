import type { Streams } from "@wirecat/cli-base"
import { withQuery } from "@wirecat/cli-core/cli"
import { approveAsTask } from "@wirecat/cli-core/services"
import type { Command } from "commander"
import { answers, itemAnswer } from "../answer.js"
import { authorOf, byOption } from "../author.js"
import { positive } from "../options.js"
import { ACTION_QUERY, listActions, type NewProposal, propose } from "./actions.js"

export const actionsCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const { run } = answers(program, streams, env)
  const actions = program
    .command("actions")
    .description("what an agent proposes to do; confirming one makes it your task, nothing is sent")

  byOption(
    actions.command("add").description("propose an action, such as a reply or a ban, in the account that would act"),
  )
    .argument("<kind>", "a lower-case word: reply, send, ban, mute, pin, invite, create_task, …")
    .requiredOption("--reason <text>", "why it should be done")
    .requiredOption("--provider <provider>", "the provider of the account that would act")
    .option("--account <account>", "the account that would act, when the provider has several")
    .option("--target <ref>", "what it acts on: msg:, chat:, contact:, person:, task:, …")
    .option("--payload <json>", "what to do, as JSON, such as the reply's text")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(
      (kind: string, { asOwner, ...options }: Omit<NewProposal, "kind"> & { asOwner?: boolean; json?: boolean }) =>
        run(options.json, async (store) =>
          itemAnswer(await propose(store, { ...options, kind }, authorOf(env, asOwner))),
        ),
    )

  withQuery(actions.command("list").description("proposed actions, newest first"), ACTION_QUERY)
    .option("--limit <n>", "most actions, up to 500", positive, 100)
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((words: string[], options: { limit: number; json?: boolean }) =>
      run(options.json, (store) => listActions(store, words, options.limit)),
    )

  actions
    .command("show")
    .description("one proposed action, with its payload")
    .argument("<id>", "the action's id, as actions list gives it")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((id: string, options: { json?: boolean }) =>
      run(options.json, async (store) => itemAnswer(await store.proposedActions.get(id))),
    )

  actions
    .command("confirm")
    .description("confirm it: it becomes a task in the account that would act; nothing is sent")
    .argument("<id>", "the action's id, as actions list gives it")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((id: string, options: { json?: boolean }) =>
      run(options.json, async (store) => itemAnswer(await approveAsTask(store, id))),
    )

  actions
    .command("reject")
    .description("reject it; nothing is done")
    .argument("<id>", "the action's id, as actions list gives it")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((id: string, options: { json?: boolean }) =>
      run(options.json, async (store) => itemAnswer(await store.proposedActions.reject(id))),
    )
}
