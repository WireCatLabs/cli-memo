import { annotate } from "@wirecat/cli-base/commands"
import { LOCAL_WRITE, outputFor, overrideSharedContract, scheduleCommandFor } from "@wirecat/cli-core/cli"
import { advancePastSkipped, mailWaiting } from "@wirecat/cli-core/mail"
import type { Command } from "commander"
import { withStore } from "../answer.js"
import { APP } from "../app.js"
import { bulkTriage, scheduleLimits } from "../config.js"
import { mailTriageInput } from "./mail-triage-input.js"

/** The `mail` CLI's identity, as its own `IDENTITY` names it: its folders and its `MAIL_*` variables. */
export const MAIL_CLI = { command: "mail", appName: "mail-cli", envPrefix: "MAIL" }

/** What an agent schedule's run reads first: the mail triage's waiting mail; nothing for any other agent. */
export const agentInputOf = (env: NodeJS.ProcessEnv) =>
  mailTriageInput(() =>
    withStore(env, async (store) =>
      (await store.accounts.accounts()).filter((key) => key.provider === "email").map((key) => key.account),
    ),
  )

/**
 * cli-core's `schedule`: a memo command or an agent on a timer. memo has no profiles, and its `--json` is per
 * command, as on `runs`. An agent's run is allowed `Bash(memo:*)` and `Bash(mail:*)` under MEMO_READ_ONLY and
 * MAIL_READ_ONLY, so the mail triage can read mail and add an envelope rule for one sender. `--on-new-mail <holder>`
 * starts the agent only when some mailbox holds mail past that holder's mark, and enough of it — the config file's
 * `schedule_mail_wait` and `schedule_mail_batch` — so a quiet 5-minute check costs no model call.
 */
export const scheduleCommand = (env: NodeJS.ProcessEnv): Command => {
  const schedule = scheduleCommandFor({
    app: APP,
    context: (command) => ({ ...outputFor(command), env, profile: "" }),
    agentRuns: [MAIL_CLI],
    newMail: (_command, holder) =>
      withStore(env, async (store) => {
        const triage = bulkTriage(env)
        await advancePastSkipped(store, holder, Date.now(), triage)
        return mailWaiting(store, holder, Date.now(), triage)
      }),
    agentInput: agentInputOf(env),
    limits: () => scheduleLimits(env),
  })
  for (const one of schedule.commands)
    overrideSharedContract(
      one,
      "Memo's output flag is command-local because this provider does not use the messenger program shell.",
      (command) => {
        command.option("--json", "print JSON")
      },
    )
  for (const one of schedule.commands.filter((command) => ["run", "exec"].includes(command.name())))
    overrideSharedContract(
      one,
      "A memo schedule runs memo, which writes to no remote service, or an agent allowed only memo and mail, each read-only.",
      (command) => {
        annotate(command, { effects: LOCAL_WRITE })
      },
    )
  return schedule
}
