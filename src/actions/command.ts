import type { Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { LOCAL_READ, LOCAL_WRITE, withQuery } from "@wirecat/cli-core/cli"
import { approveAsTask } from "@wirecat/cli-core/services"
import { assertMayDecide } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { answers, itemAnswer } from "../answer.js"
import { byOption, deciderOf, whoRuns } from "../author.js"
import { positive } from "../options.js"
import { asOwner } from "../people/proposal-rows.js"
import { decideOne, decisionOf } from "../review/review.js"
import { actionsIn, proposalsOf, refuseOutsideAction, stripped } from "../store/guard.js"
import { type WriteOptions, writeAccount, writeOptions } from "../store/source-list.js"
import {
  ACTION_QUERY,
  type Decision,
  decideFindings,
  editFinding,
  listActions,
  type NewProposal,
  propose,
  showAction,
} from "./actions.js"

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
        command: Command,
      ) =>
        run(options.json, async (store) => {
          const by = await whoRuns(command, env, { asOwner, question: "propose this action as yours?" })
          const key = await writeAccount(store, env, { account }, (text) => streams.diagnostic(text))
          return itemAnswer(await propose(store, env, { ...options, ...key, kind }, by))
        }),
    )

  withQuery(
    annotate(actions.command("list"), { effects: LOCAL_READ, output: { entity: "proposed_action" } }).description(
      "proposed actions, newest first",
    ),
    ACTION_QUERY,
  )
    .option("--limit <n>", "most actions on a page, up to 500", positive, 100)
    .option("--page <n>", "which page, from 1", positive, 1)
    .option("--brief", "without each findings batch's cited sources")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((words: string[], options: { limit: number; page: number; brief?: boolean; json?: boolean }) =>
      run(options.json, async (store) =>
        stripped(
          store,
          env,
          await listActions(store, words, options.limit, {
            brief: options.brief === true,
            page: options.page,
            keep: (rows) => actionsIn(store, env, rows),
          }),
        ),
      ),
    )

  annotate(actions.command("show"), { effects: LOCAL_READ })
    .description("one proposed action; a findings batch with its fingerprint and sources")
    .argument("<id>", "the action's id, as actions list gives it")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((id: string, options: { json?: boolean }) =>
      run(options.json, async (store) => {
        await refuseOutsideAction(store, env, id)
        return itemAnswer(await stripped(store, env, await showAction(store, id)))
      }),
    )

  byOption(annotate(actions.command("confirm"), { effects: LOCAL_WRITE }))
    .summary("confirm it: a task to act on, or a findings batch's facts and tasks")
    .description(
      "confirm it: it becomes a task in the account that would act, nothing is sent; for a findings batch, create " +
        "the named findings and leave the others waiting, or create every waiting one when none is named",
    )
    .argument("<id>", "the action's id, as actions list gives it")
    .argument("[findings...]", "a findings batch: the finding IDs to create; the others keep waiting")
    .option("--fingerprint <hash>", "a findings batch: the fingerprint actions show gives")
    .option("--reason <text>", "why, in a few words; required when an agent decides for you")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (id: string, findings: string[], options: Decision & { json?: boolean }, command: Command) => {
      const by = await deciderOf(command, env, { ...options, question: `confirm action ${id} as you, the owner?` })
      await run(options.json, async (store) => {
        await refuseOutsideAction(store, env, id)
        const findingsAnswer = await decideFindings(store, id, { ...options, accept: findings, confirm: true, by })
        if (findingsAnswer) return itemAnswer(findingsAnswer)
        // The task is made here to keep this command's answer; the check is the review registry's.
        assertMayDecide(await (await proposalsOf(store, env)).get(id), by, store.decisionPolicy)
        return itemAnswer(await approveAsTask(store, id, by))
      })
    })

  byOption(annotate(actions.command("edit"), { effects: LOCAL_WRITE }))
    .summary("change a finding still waiting in a findings batch before you confirm it")
    .description(
      "change one finding still waiting in a findings batch: its text and the fields its kind allows (a fact's " +
        "statement, type and subject; a task's title, type, reason, commitment, dueAt and assignee; a mail " +
        "finding's reason and its kind's fields). Its evidence never changes, nor a meeting finding's project. " +
        "Answers the batch with its new fingerprint",
    )
    .argument("<id>", "the findings batch's id, as actions list gives it")
    .argument("<finding>", "the finding's id in the batch")
    .requiredOption("--fingerprint <hash>", "the fingerprint actions show gives")
    .option("--set <field=value...>", "a field and its new value: JSON for a list, null empties it", [])
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(
      async (
        id: string,
        finding: string,
        options: { fingerprint: string; set: string[]; json?: boolean },
        command: Command,
      ) => {
        await asOwner(command, env, `change finding ${finding} of action ${id}?`)
        await run(options.json, async (store) => {
          await refuseOutsideAction(store, env, id)
          return itemAnswer(await stripped(store, env, await editFinding(store, id, finding, options)))
        })
      },
    )

  byOption(annotate(actions.command("reject"), { effects: LOCAL_WRITE }))
    .description("reject it; nothing is done. For a findings batch, every finding still waiting")
    .argument("<id>", "the action's id, as actions list gives it")
    .option("--fingerprint <hash>", "a findings batch: the fingerprint actions show gives")
    .option("--reason <text>", "why, in a few words; required when an agent decides for you")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (id: string, options: Decision & { json?: boolean }, command: Command) => {
      const by = await deciderOf(command, env, { ...options, question: `reject action ${id} as you, the owner?` })
      await run(options.json, async (store) => {
        await refuseOutsideAction(store, env, id)
        const findingsAnswer = await decideFindings(store, id, { ...options, accept: [], confirm: false, by })
        if (findingsAnswer) return itemAnswer(findingsAnswer)
        await decideOne(store, env, id, decisionOf(false, by, options.reason))
        return itemAnswer(await store.proposedActions.get(id))
      })
    })
}
