import { annotate } from "@wirecat/cli-base/commands"
import type { Command } from "commander"

export const EXAMPLES: Readonly<Record<string, readonly string[]>> = {
  context: ["memo context telegram:'Kai Sample'", "memo context email:kai@example.com --limit 5 --json"],
  "notes show": ["memo notes show note:12", "memo notes show ~/notes/People/Kai.md --json"],
  "notes list": [
    "memo notes list --about telegram:'Kai Sample'",
    "memo notes list --about project:2 --search budget --json",
    "memo notes list --source internal --limit 50",
  ],
  "notes add": [
    "memo notes add 'Prefers calls in the morning' --about telegram:'Kai Sample'",
    "memo notes add --file draft.md --title 'Harbour kickoff' --about project:2 --about organization:1",
  ],
  "notes edit": ["memo notes edit note:12 --revision 2 --text 'Prefers calls after ten'"],
  "notes remove": ["memo notes remove note:12"],
  "notes export": ["memo notes export --to ~/notes/memo --format obsidian"],
  "folders add": ["memo folders add ~/notes"],
  "folders attach": ["memo folders attach 1 ~/notes"],
  "folders list": ["memo folders list --json"],
  "messages show": ["memo messages show 'msg:email/me%40example.com/thread/42' --before-n 2 --after-n 2"],
  "mail probe": ["memo mail probe personal --limit-groups 30", "memo mail probe work --since-time 365d --json"],
  "mail rules list": ["memo mail rules list personal --json"],
  "mail rules add": [
    "memo mail rules add personal --domain news.example --envelope --reason 'newsletters'",
    "memo mail rules add personal --domain spam.example --skip",
    "memo mail rules add personal --from alice@news.example --keep",
  ],
  "mail rules remove": ["memo mail rules remove personal --domain news.example"],
  "mail rules apply": ["memo mail rules apply personal", "memo mail rules apply personal --yes --json"],
  note: ["memo note telegram:'Kai Sample' People/Kai.md", "memo note telegram:'Kai Sample' --clear"],
  "tags add": ["memo tags add follow-up --note note:12", "memo tags add harbour --project HRB"],
  "tags remove": ["memo tags remove follow-up --note note:12"],
  "tags list": ["memo tags list --tag follow-up", "memo tags list --provider email --account me@example.com --json"],
  "tasks link": ["memo tasks link HRB-2 HRB-1 --kind blocked-by"],
  "tasks unlink": ["memo tasks unlink HRB-2 HRB-1 --kind blocked-by"],
  "tasks relations": ["memo tasks relations HRB-2 --json"],
  "tasks status": ["memo tasks status HRB-2"],
  "tasks add": [
    "memo tasks add 'msg:telegram/1/77/42' --provider telegram --account 1 --type request",
    "memo tasks add --project HRB --title 'Draft the budget' --type feature",
  ],
  "tasks list": ["memo tasks list --provider telegram --account 1", "memo tasks list --project HRB --ready --json"],
  "tasks close": ["memo tasks close 7 --provider telegram --account 1 --as dismissed --reason 'answered by phone'"],
  "tasks update": ["memo tasks update 7 --title 'Send the budget' --priority 1"],
  "tasks assign": ["memo tasks assign 7 person:3"],
  "organizations add": ["memo organizations add 'Harbour Studio' --kind company --scope work"],
  "organizations list": ["memo organizations list --json"],
  "organizations context": ["memo organizations context organization:1"],
  "projects meetings list": ["memo projects meetings list HRB --provider zoom --account me@example.com"],
  "projects meetings link": ["memo projects meetings link HRB 31 --provider zoom --account me@example.com"],
  "projects add": ["memo projects add 'Harbour' --key HRB --type client --organization 1"],
  "projects list": ["memo projects list"],
  "projects context": ["memo projects context HRB", "memo projects context project:2 --json"],
  "projects key-documents add": ["memo projects key-documents add HRB note:12 --reason 'the brief'"],
  "projects key-documents remove": ["memo projects key-documents remove HRB note:12"],
  "projects key-documents list": ["memo projects key-documents list HRB"],
  "relationships add": [
    "memo relationships add person:3 organization:1 --role cto",
    "memo relationships add project:2 organization:1 --kind related-to --reason 'same client'",
  ],
  "relationships list": ["memo relationships list --reference person:3"],
  "relationships remove": ["memo relationships remove 4"],
  "relationships confirm": ["memo relationships confirm 4"],
  "relationships suggest": ["memo relationships suggest --provider email --account me@example.com --limit 10"],
  "reminders add": [
    "memo reminders add 7 --at-time 2026-10-20T09:00:00+02:00 --timezone Europe/Madrid --provider telegram --account 1",
  ],
  "reminders list": ["memo reminders list --provider telegram --account 1"],
  "reminders poll": ["memo reminders poll --provider telegram --account 1 --json"],
  "reminders ack": ["memo reminders ack 3 3:1 --provider telegram --account 1"],
  "reminders cancel": ["memo reminders cancel 3 --provider telegram --account 1"],
  "reminders update": [
    "memo reminders update 3 --revision 1 --at-time 2026-10-21T09:00:00+02:00 --provider telegram --account 1",
  ],
  "vocabulary list": ["memo vocabulary list --kind tag"],
  "vocabulary show": ["memo vocabulary show Harbour --kind project"],
  "vocabulary check": ["memo vocabulary check on-boarding --kind tag", "memo vocabulary check --limit 20 --json"],
  "vocabulary create": ["memo vocabulary create onboarding --kind tag --expected 3f9a"],
  "vocabulary aliases add": ["memo vocabulary aliases add project:2 Harbor --expected 3f9a"],
  "vocabulary aliases remove": ["memo vocabulary aliases remove project:2 5 --expected 3f9a"],
  "memories add": ["memo memories add 'Kai prefers Friday meetings' --kind preference --scope work --evidence note:12"],
  "memories list": ["memo memories list --status proposed"],
  "memories show": ["memo memories show memory:4"],
  "memories confirm": ["memo memories confirm memory:4"],
  "memories stale": ["memo memories stale memory:4"],
  "facts add": [
    "memo facts add 'We moved the launch to spring' --type decision --evidence 'msg:telegram/1/77/42' --project HRB",
  ],
  "facts list": ["memo facts list --type decision --project HRB"],
  "facts show": ["memo facts show fact:4"],
  "facts confirm": ["memo facts confirm fact:4"],
  "facts reverse": ["memo facts reverse fact:4"],
  "actions add": [
    "memo actions add reply --reason 'Kai asked twice' --provider telegram --target 'msg:telegram/1/77/42' --payload '{\"text\":\"Friday works\"}'",
  ],
  "actions list": ["memo actions list --status proposed"],
  "actions show": ["memo actions show 5"],
  "actions confirm": ["memo actions confirm 5"],
  "actions reject": ["memo actions reject 5"],
  "agents log": ["memo agents log --agent claude-code --limit 20"],
  mcp: ["memo mcp"],
  "search all": ["memo search all 'budget harbour'", "memo search all 'content:invoice' --only mail,notes --json"],
  "search messages": ["memo search messages 'friday meeting' --type voice"],
  "search mail": ["memo search mail 'mailbox:important budget' --account me@example.com"],
  "search notes": ["memo search notes budget --folder ~/notes", "memo search notes kickoff --project HRB --json"],
  "search memories": ["memo search memories friday meetings --scope work"],
  ask: [
    "memo ask 'what did Kai say about the budget?' --all",
    "memo ask 'when is the launch?' --provider telegram --account 1",
  ],
  sync: [
    "memo sync",
    "memo sync --account work --since-time 2026-09-01",
    "memo sync --notes --folder ~/notes --no-embed",
  ],
  "auto start": ["memo auto start --every 10m"],
  "auto stop": ["memo auto stop"],
  "auto status": ["memo auto status --json"],
  commands: ["memo commands --json", "memo commands tags add --json"],
  "skill show": ["memo skill show"],
  "skill install": ["memo skill install --for all"],
}

const leaves = (command: Command, path: string[] = []): [string, Command][] =>
  command.commands.flatMap((child) => {
    const at = [...path, child.name()]
    return child.commands.length ? leaves(child, at) : [[at.join(" "), child] as [string, Command]]
  })

/** Puts each leaf's examples in `commands --json` and at the end of its `--help`. */
export const addExamples = (program: Command): void => {
  for (const [path, command] of leaves(program)) {
    const examples = EXAMPLES[path]
    if (!examples) continue
    annotate(command, { examples })
    command.addHelpText("after", `\nExamples:\n${examples.map((example) => `  ${example}`).join("\n")}`)
  }
}
