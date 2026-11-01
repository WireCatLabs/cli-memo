import type { Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { LOCAL_READ, LOCAL_WRITE, withQuery } from "@wirecat/cli-core/cli"
import { approveAsTask } from "@wirecat/cli-core/services"
import type { Command } from "commander"
import { answers, itemAnswer } from "../answer.js"
import { authorOf, byOption } from "../author.js"
import { positive } from "../options.js"
import { type WriteOptions, writeAccount, writeOptions } from "../store/source-list.js"
import { ACTION_QUERY, listActions, type NewProposal, propose, showAction } from "./actions.js"

export const actionsCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const { run } = answers(program, streams, env)
  const actions = program
    .command("actions")
    .description("what an agent proposes to do; confirming one makes it your task, nothing is sent")

  writeOptions(
    byOption(
      annotate(actions.command("add"), { effects: LOCAL_WRITE }).description(
        "propose an action, such as a reply or a ban, in the account that would act",
      ),
    )
      .argument("<kind>", "a lower-case word: reply, send, ban, mute, pin, invite, create_task, …")
      .requiredOption("--reason <text>", "why it should be done"),
    "the account that would act: provider:account, such as telegram:1",
  )
    .option("--target <ref>", "what it acts on: msg:, chat:, contact:, person:, task:, …")
    .option("--payload <json>", "what to do, as JSON, such as the reply's text")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(
      (
        kind: string,
        {
          asOwner,
          account,
          ...options
        }: Omit<NewProposal, "kind" | "provider" | "account"> & WriteOptions & { asOwner?: boolean; json?: boolean },
      ) =>
        run(options.json, async (store) => {
          const key = await writeAccount(store, env, { account }, (text) => streams.diagnostic(text))
          return itemAnswer(await propose(store, { ...options, ...key, kind }, authorOf(env, asOwner)))
        }),
    )

  withQuery(
    annotate(actions.command("list"), { effects: LOCAL_READ, output: { entity: "proposed_action" } }).description(
      "proposed actions, newest first",
    ),
    ACTION_QUERY,
  )
    .option("--limit <n>", "most actions, up to 500", positive, 100)
    .option("--brief", "without each findings batch's cited sources")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((words: string[], options: { limit: number; brief?: boolean; json?: boolean }) =>
      run(options.json, (store) => listActions(store, words, options.limit, { brief: options.brief === true })),
    )

  annotate(actions.command("show"), { effects: LOCAL_READ })
    .description("one proposed action; a findings batch with its fingerprint and sources")
    .argument("<id>", "the action's id, as actions list gives it")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((id: string, options: { json?: boolean }) =>
      run(options.json, async (store) => itemAnswer(await showAction(store, id))),
    )

  annotate(actions.command("confirm"), { effects: LOCAL_WRITE })
    .description("confirm it: it becomes a task in the account that would act; nothing is sent")
    .argument("<id>", "the action's id, as actions list gives it")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((id: string, options: { json?: boolean }) =>
      run(options.json, async (store) => itemAnswer(await approveAsTask(store, id))),
    )

  annotate(actions.command("reject"), { effects: LOCAL_WRITE })
    .description("reject it; nothing is done")
    .argument("<id>", "the action's id, as actions list gives it")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((id: string, options: { json?: boolean }) =>
      run(options.json, async (store) => itemAnswer(await store.proposedActions.reject(id))),
    )
}
