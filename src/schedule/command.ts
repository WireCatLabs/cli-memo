import { annotate } from "@wirecat/cli-base/commands"
import { LOCAL_WRITE, outputFor, overrideSharedContract, scheduleCommandFor } from "@wirecat/cli-core/cli"
import { advancePastSkipped, mailWaiting } from "@wirecat/cli-core/mail"
import type { Command } from "commander"
import { withStore } from "../answer.js"
import { APP } from "../app.js"
import { bulkTriage, scheduleLimits } from "../config.js"
import { mailTriageInput } from "./mail-triage-input.js"

/**
 * cli-core's `schedule`: a memo command or an agent on a timer. memo has no profiles, and its `--json` is per
 * command, as on `runs`. An agent's run is allowed `Bash(memo:*)` under MEMO_READ_ONLY. `--on-new-mail <holder>`
 * starts the agent only when some mailbox holds mail past that holder's mark, and enough of it — the config file's
 * `schedule_mail_wait` and `schedule_mail_batch` — so a quiet 5-minute check costs no model call.
 */
export const scheduleCommand = (env: NodeJS.ProcessEnv): Command => {
  const schedule = scheduleCommandFor({
    app: APP,
    context: (command) => ({ ...outputFor(command), env, profile: "" }),
    newMail: (_command, holder) =>
      withStore(env, async (store) => {
        const triage = bulkTriage(env)
        await advancePastSkipped(store, holder, Date.now(), triage)
        return mailWaiting(store, holder, Date.now(), triage)
      }),
    agentInput: mailTriageInput(() =>
      withStore(env, async (store) =>
        (await store.accounts.accounts()).filter((key) => key.provider === "email").map((key) => key.account),
      ),
    ),
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
      "A memo schedule runs memo, which writes to no remote service, or an agent allowed only memo under MEMO_READ_ONLY.",
      (command) => {
        annotate(command, { effects: LOCAL_WRITE })
      },
    )
  return schedule
}
