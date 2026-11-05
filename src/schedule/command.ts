import { annotate } from "@wirecat/cli-base/commands"
import { LOCAL_WRITE, outputFor, overrideSharedContract, scheduleCommandFor } from "@wirecat/cli-core/cli"
import { holderHasMail } from "@wirecat/cli-core/mail"
import type { Command } from "commander"
import { withStore } from "../answer.js"
import { APP } from "../app.js"

/** The `mail` CLI's identity, as its own `IDENTITY` names it: its folders and its `MAIL_*` variables. */
const MAIL_CLI = { command: "mail", appName: "mail-cli", envPrefix: "MAIL" }

/**
 * cli-core's `schedule`: a memo command or an agent on a timer. memo has no profiles, and its `--json` is per
 * command, as on `runs`. An agent's run is allowed `Bash(memo:*)` and `Bash(mail:*)` under MEMO_READ_ONLY and
 * MAIL_READ_ONLY, so the mail triage can read mail and add a rule by sender, domain or list. `--on-new-mail <holder>`
 * starts the agent only when some mailbox holds mail past that holder's mark, so a quiet 5-minute check costs no
 * model call.
 */
export const scheduleCommand = (env: NodeJS.ProcessEnv): Command => {
  const schedule = scheduleCommandFor({
    app: APP,
    context: (command) => ({ ...outputFor(command), env, profile: "" }),
    newMail: (_command, holder) => withStore(env, (store) => holderHasMail(store, holder)),
    agentRuns: [MAIL_CLI],
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
