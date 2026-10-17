import { annotate } from "@wirecat/cli-base/commands"
import type { Command } from "commander"

export const EXAMPLES: Readonly<Record<string, readonly string[]>> = {
  context: ["memo context telegram:'Kai Sample'", "memo context email:kai@example.com --limit 5 --json"],
  "notes show": ["memo notes show note:12", "memo notes show ~/notes/People/Kai.md --json"],
  "notes list": [
    "memo notes list 'about:\"telegram:Kai Sample\"'",
    "memo notes list source:internal text:budget --json",
    "memo notes list source:internal --limit 50",
  ],
  "notes add": [
    "memo notes add 'Prefers calls in the morning' --subject telegram:'Kai Sample'",
    "memo notes add --text-file draft.md --title 'Harbour kickoff' --subject project:2 --subject organization:1",
  ],
  "notes edit": ["memo notes edit note:12 --revision 2 --text 'Prefers calls after ten'"],
  "notes remove": ["memo notes remove note:12"],
  "notes export": ["memo notes export --output-dir ~/notes/memo --format obsidian"],
  "folders add": ["memo folders add ~/notes"],
  "folders attach": ["memo folders attach 1 ~/notes"],
  "folders list": ["memo folders list --json"],
  "mentions list": [
    "memo mentions list kind:phone --source notes",
    "memo mentions list domain:example.com --source email:personal,email:work --json",
    "memo mentions list kind:place --source mail",
  ],
  "mentions show": ["memo mentions show 12", "memo mentions show 40 --source email:personal --json"],
  "mentions confirm": ["memo mentions confirm 12 person:7", "memo mentions confirm 40 --source email:personal"],
  "mentions reject": ["memo mentions reject 12", "memo mentions reject 40 --source email:personal"],
  "messages show": ["memo messages show 'msg:email/me%40example.com/thread/42' --before-n 2 --after-n 2"],
  "mail inspect": ["memo mail inspect personal --limit 30", "memo mail inspect work --since-time 365d --json"],
  "mail status": ["memo mail status personal", "memo mail status personal --json"],
  "mail trash": ["memo mail trash personal", "memo mail trash personal --yes --limit 100"],
  "mail restore": ["memo mail restore personal --run 2026-10-16T09-00-00-000Z-ab12 --yes"],
  "mail runs": ["memo mail runs personal", "memo mail runs personal --json"],
  "mail rules list": ["memo mail rules list personal --json", "memo mail rules list personal --filter is:protected"],
  "mail rules add": [
    "memo mail rules add personal --domain news.example --do envelope,tag:newsletter --reason 'newsletters'",
    "memo mail rules add personal --domain tax.gov.example --do protect",
    "memo mail rules add personal --filter 'label:Promotions older:365d' --do envelope",
  ],
  "mail rules remove": ["memo mail rules remove personal --domain news.example"],
  "mail rules apply": ["memo mail rules apply personal", "memo mail rules apply personal --yes --json"],
  "mail rules export": ["memo mail rules export personal"],
  "mail rules import": ["memo mail rules import personal rules.json"],
  "mail rules import-filters": [
    "memo mail rules import-filters personal Filters.json",
    "memo mail rules import-filters personal Filters.json --yes",
  ],
  note: ["memo note telegram:'Kai Sample' People/Kai.md", "memo note telegram:'Kai Sample' --clear"],
  "tags add": ["memo tags add follow-up --note note:12", "memo tags add harbour --project HRB"],
  "tags remove": ["memo tags remove follow-up --note note:12"],
  "tags list": ["memo tags list tag:follow-up", "memo tags list --source email:me@example.com --json"],
  "tasks link": ["memo tasks link HRB-2 HRB-1 --kind blocked-by"],
  "tasks unlink": ["memo tasks unlink HRB-2 HRB-1 --kind blocked-by"],
  "tasks relations": ["memo tasks relations HRB-2 --json"],
  "tasks status": ["memo tasks status HRB-2"],
  "tasks add": [
    "memo tasks add 'msg:telegram/1/77/42' --account telegram:1 --type request",
    "memo tasks add --project HRB --title 'Draft the budget' --type feature",
  ],
  "tasks list": ["memo tasks list state:done --source telegram:1", "memo tasks list project:HRB ready:true --json"],
  "tasks agenda": [
    "memo tasks agenda --source telegram:1",
    "memo tasks agenda --source max:1 --waiting 3d --within 90d --json",
  ],
  "tasks plan": ["memo tasks plan 1a2b3c4d --due 2d --title 'Send the revised budget' --account telegram:1"],
  "tasks show": ["memo tasks show 1a2b3c4d --source telegram:1 --json"],
  "stats tasks show": [
    "memo stats tasks show --source telegram:1",
    "memo stats tasks show --type question --source telegram:1 --json",
  ],
  "tasks close": ["memo tasks close 7 --account telegram:1 --as dismissed --reason 'answered by phone'"],
  "tasks update": ["memo tasks update 7 --title 'Send the budget' --priority 1"],
  "tasks assign": ["memo tasks assign 7 person:3"],
  "organizations add": ["memo organizations add 'Harbour Studio' --kind company --scope work"],
  "organizations list": ["memo organizations list --json"],
  "organizations context": ["memo organizations context organization:1"],
  "projects meetings list": ["memo projects meetings list HRB --source zoom:me@example.com"],
  "projects meetings link": ["memo projects meetings link HRB 31 --account zoom:me@example.com"],
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
  "relationships list": ['memo relationships list about:"person:3"'],
  "relationships remove": ["memo relationships remove 4"],
  "relationships confirm": ["memo relationships confirm 4"],
  "relationships suggest": ["memo relationships suggest --source email:me@example.com --limit 10"],
  "reminders add": [
    "memo reminders add 7 --at-time 2026-10-20T09:00:00+02:00 --timezone Europe/Madrid --account telegram:1",
  ],
  "reminders list": ["memo reminders list --source telegram:1"],
  "reminders poll": ["memo reminders poll --account telegram:1 --json"],
  "reminders ack": ["memo reminders ack 3 3:1 --account telegram:1"],
  "reminders cancel": ["memo reminders cancel 3 --account telegram:1"],
  "reminders update": ["memo reminders update 3 --revision 1 --at-time 2026-10-21T09:00:00+02:00 --account telegram:1"],
  "vocabulary list": ["memo vocabulary list kind:tag"],
  "vocabulary show": ["memo vocabulary show Harbour --kind project"],
  "vocabulary check": ["memo vocabulary check on-boarding --kind tag", "memo vocabulary check --limit 20 --json"],
  "vocabulary create": ["memo vocabulary create onboarding --kind tag --fingerprint 3f9a"],
  "vocabulary aliases add": ["memo vocabulary aliases add project:2 Harbor --fingerprint 3f9a"],
  "vocabulary aliases remove": ["memo vocabulary aliases remove project:2 5 --fingerprint 3f9a"],
  "memories add": ["memo memories add 'Kai prefers Friday meetings' --kind preference --scope work --evidence note:12"],
  "memories list": ["memo memories list status:proposed kind:preference"],
  "memories show": ["memo memories show memory:4"],
  "memories confirm": ["memo memories confirm memory:4"],
  "memories stale": ["memo memories stale memory:4"],
  "facts add": [
    "memo facts add 'We moved the launch to spring' --kind decision --evidence 'msg:telegram/1/77/42' --project HRB",
  ],
  "facts list": ["memo facts list kind:decision project:HRB"],
  "facts show": ["memo facts show fact:4"],
  "facts confirm": ["memo facts confirm fact:4"],
  "facts reverse": ["memo facts reverse fact:4"],
  "actions add": [
    "memo actions add reply --reason 'Kai asked twice' --account telegram:1 --target 'msg:telegram/1/77/42' --payload '{\"text\":\"Friday works\"}'",
  ],
  "meetings actions add": ["memo meetings actions add findings.json --account example:synthetic"],
  "meetings actions list": ["memo meetings actions list status:proposed --source example:synthetic"],
  "meetings actions show": ["memo meetings actions show 5 --source example:synthetic"],
  "meetings actions confirm": [
    "memo meetings actions confirm 5 decision --fingerprint aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa --account example:synthetic",
  ],
  "meetings actions reject": [
    "memo meetings actions reject 5 --fingerprint aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa --account example:synthetic",
  ],
  "actions list": ["memo actions list status:proposed"],
  "actions show": ["memo actions show 5"],
  "actions confirm": ["memo actions confirm 5"],
  "actions reject": ["memo actions reject 5"],
  "agents log": ["memo agents log agent:claude-code --limit 20"],
  mcp: ["memo mcp"],
  "search all": ["memo search all 'budget harbour'", "memo search all 'content:invoice' --only mail,notes --json"],
  "search messages": ["memo search messages 'friday meeting has:voice'"],
  "search mail": ["memo search mail 'mailbox:important budget' --source email:me@example.com"],
  "search notes": ["memo search notes budget notes:2", "memo search notes kickoff --project HRB --json"],
  "search memories": ["memo search memories friday meetings scope:work"],
  ask: ["memo ask 'what did Kai say about the budget?' --all", "memo ask 'when is the launch?' --source telegram:1"],
  sync: [
    "memo sync",
    "memo sync --source email:work --since-time 2026-09-01",
    "memo sync --only notes --folder ~/notes --no-embed",
  ],
  "auto start": ["memo auto start --every 10m"],
  "auto stop": ["memo auto stop"],
  "auto status": ["memo auto status --json"],
  doctor: ["memo doctor", "memo doctor --json"],
  upgrade: ["memo upgrade --check", "memo upgrade"],
  commands: ["memo commands --json", "memo commands tags add --json"],
  "skill show": ["memo skill show"],
  "skill install": ["memo skill install --for all"],
}

export const leaves = (command: Command, path: string[] = []): [string, Command][] =>
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
