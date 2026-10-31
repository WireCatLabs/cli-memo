import { annotate, metaOf } from "@wirecat/cli-base/commands"
import { hasSharedContract, overrideSharedContract } from "@wirecat/cli-core/cli"
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
  "folders update": ["memo folders update 1 ~/notes"],
  "folders list": ["memo folders list --json"],
  "config unset": ["memo config unset permissions.notes.edit"],
  "mentions list": [
    "memo mentions list kind:phone --source notes",
    "memo mentions list domain:example.com --source email:personal,email:work --json",
    "memo mentions list kind:place --source mail",
  ],
  "mentions show": ["memo mentions show 12", "memo mentions show 40 --source email:personal --json"],
  "mentions confirm": ["memo mentions confirm 12 person:7", "memo mentions confirm 40 --source email:personal"],
  "mentions reject": ["memo mentions reject 12", "memo mentions reject 40 --source email:personal"],
  "messages show": ["memo messages show 'msg:email/me%40example.com/thread/42' --before-n 2 --after-n 2"],
  "projects actions add": ["memo projects actions add findings.json"],
  "projects actions list": [
    "memo projects actions list SYH",
    "memo projects actions list SYH status:reviewed --brief --json",
  ],
  "projects actions confirm": [
    "memo projects actions confirm SYH 12 budget accountant --fingerprint 3f9a0c --reason 'both are stated plainly'",
    "memo projects actions confirm SYH key:4",
  ],
  "projects actions reject": [
    "memo projects actions reject SYH 12 --fingerprint 3f9a0c --reason 'not about this project'",
  ],
  "projects evidence": [
    "memo projects evidence SYH --source telegram:1,email:personal --contact 'Alice Example'",
    "memo projects evidence SYH --source all --context-query 'crane tender' --since-time 180d --json",
  ],
  "mail add": ["memo mail add work you@example.test --kind imap"],
  "mail check": ["memo mail check work"],
  "models list": ["memo models list kind:text --json"],
  "commands info": ["memo commands info --json"],
  "models download": ["memo models download e5-small"],
  "mail inspect": ["memo mail inspect personal --limit 30", "memo mail inspect work --since-time 365d --json"],
  "mail status": ["memo mail status personal", "memo mail status personal --json"],
  "mail delete": ["memo mail delete personal", "memo mail delete personal --limit 100 --json"],
  "mail restore": ["memo mail restore personal --run 2026-10-16T09-00-00-000Z-ab12"],
  "mail runs list": ["memo mail runs list personal", "memo mail runs list personal --json"],
  "mail rules list": ["memo mail rules list personal --json", "memo mail rules list personal protected:true"],
  "mail rules add": [
    "memo mail rules add personal --domain news.example --do envelope,tag:newsletter --reason 'newsletters'",
    "memo mail rules add personal --domain tax.gov.example --do protect",
    "memo mail rules add personal --filter 'label:Promotions older:365d' --do envelope",
  ],
  "mail rules remove": ["memo mail rules remove personal --domain news.example"],
  "mail rules apply": ["memo mail rules apply personal", "memo mail rules apply personal --json"],
  "mail rules export": ["memo mail rules export personal"],
  "mail rules import": [
    "memo mail rules import personal rules.json",
    "memo mail rules import personal Filters.json --format gmail",
    "memo mail rules import personal Filters.json --format gmail --yes",
  ],
  "notes links show": ["memo notes links show telegram:101 --json"],
  "notes links add": ["memo notes links add telegram:101 ~/notes/People/Kai.md"],
  "notes links clear": ["memo notes links clear telegram:101"],
  "tags add": ["memo tags add follow-up --note note:12", "memo tags add harbour --project HRB"],
  "tags remove": ["memo tags remove follow-up --note note:12"],
  "tags list": ["memo tags list tag:follow-up", "memo tags list --source email:me@example.com --json"],
  "tasks link": ["memo tasks link HRB-2 HRB-1 --kind blocked-by"],
  "tasks unlink": ["memo tasks unlink HRB-2 HRB-1 --kind blocked-by"],
  "tasks links": ["memo tasks links HRB-2 --json"],
  "tasks status": ["memo tasks status HRB-2"],
  "tasks add": [
    "memo tasks add 'msg:telegram/1/77/42' --account telegram:1 --type request",
    "memo tasks add --project HRB --title 'Draft the budget' --type feature",
  ],
  "tasks list": [
    "memo tasks list state:done --source telegram:1",
    "memo tasks list project:HRB ready:true --json",
    'memo tasks list project:* priority:[high TO critical] "invoice" --sort due --json',
  ],
  "tasks counts": ["memo tasks counts project:* --json"],
  "tasks history": ["memo tasks history HRB-1 --json"],
  "tasks move": ["memo tasks move HRB-3 --status in_progress --before HRB-1 --revision 4"],
  "people list": ["memo people list --json"],
  "tasks agenda": [
    "memo tasks agenda --source telegram:1",
    "memo tasks agenda --source max:1 --waiting 3d --within 90d --json",
  ],
  "tasks claim": ["memo tasks claim HRB-1 --lease 2h --account telegram:1"],
  "tasks release": ["memo tasks release HRB-1 --account telegram:1"],
  "tasks show": ["memo tasks show 1a2b3c4d --source telegram:1 --json"],
  "stats tasks show": [
    "memo stats tasks show --source telegram:1",
    "memo stats tasks show --type question --source telegram:1 --json",
  ],
  "tasks close": ["memo tasks close 7 --account telegram:1 --as dismissed --reason 'answered by phone'"],
  "tasks update": [
    "memo tasks update HRB-1 --title 'Send the budget' --priority high --account telegram:1",
    "memo tasks update 1a2b3c4d --due 2d --title 'Send the revised budget' --account telegram:1",
  ],
  "tasks assign": ["memo tasks assign 7 person:3", "memo tasks assign HRB-1 person:3 --clear --revision 4"],
  "organizations add": ["memo organizations add 'Harbour Studio' --kind company --scope work"],
  "organizations list": ["memo organizations list --json"],
  "organizations context": ["memo organizations context organization:1"],
  "projects meetings list": ["memo projects meetings list HRB --source zoom:me@example.com"],
  "projects meetings link": ["memo projects meetings link HRB 31 --account zoom:me@example.com"],
  "projects add": ["memo projects add 'Harbour' --key HRB --type client --organization 1"],
  "projects list": ["memo projects list"],
  "projects context": ["memo projects context HRB", "memo projects context project:2 --json"],
  "projects annotations show": ["memo projects annotations show HRB --max-read-bytes 1048576 --json"],
  "projects annotations export": ["memo projects annotations export HRB --output harbour-annotations.json --json"],
  "projects annotations check": [
    "memo projects annotations check harbour-annotations.json --target-store ./trial/wirecat.db --project project:2 --bindings bindings.json --json",
  ],
  "projects annotations restore": [
    "memo projects annotations restore harbour-annotations.json --target-store ./trial/wirecat.db --project project:2 --bindings bindings.json --fingerprint aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa --json",
  ],
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
  "relationships scan": ["memo relationships scan --source email:me@example.com --limit 10"],
  "reminders add": [
    "memo reminders add 7 --at-time 2026-10-20T09:00:00+02:00 --timezone Europe/Madrid --account telegram:1",
  ],
  "reminders list": ["memo reminders list --source telegram:1"],
  "reminders claim": ["memo reminders claim --account telegram:1 --json"],
  "reminders acknowledge": ["memo reminders acknowledge 3 3:1 --account telegram:1"],
  "reminders cancel": ["memo reminders cancel 3 --account telegram:1"],
  "reminders update": ["memo reminders update 3 --revision 1 --at-time 2026-10-21T09:00:00+02:00 --account telegram:1"],
  "vocabulary list": ["memo vocabulary list kind:tag"],
  "vocabulary show": ["memo vocabulary show Harbour --kind project"],
  "vocabulary check": ["memo vocabulary check on-boarding --kind tag", "memo vocabulary check --limit 20 --json"],
  "vocabulary inspect": [
    "memo vocabulary inspect tag:1 tag:2 --fingerprint v1:all:all:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa --limit 5 --json",
  ],
  "vocabulary create": ["memo vocabulary create onboarding --kind tag --fingerprint 3f9a"],
  "vocabulary aliases add": ["memo vocabulary aliases add project:2 Harbor --fingerprint 3f9a"],
  "vocabulary aliases remove": ["memo vocabulary aliases remove project:2 5 --fingerprint 3f9a"],
  "memories add": ["memo memories add 'Kai prefers Friday meetings' --kind preference --scope work --evidence note:12"],
  "memories list": ["memo memories list status:proposed kind:preference"],
  "memories show": ["memo memories show memory:4 --sources"],
  "memories confirm": ["memo memories confirm memory:4"],
  "memories invalidate": ["memo memories invalidate memory:4"],
  "memories remove": ["memo memories remove memory:4"],
  "facts add": [
    "memo facts add 'We moved the launch to spring' --kind decision --evidence 'msg:telegram/1/77/42' --project HRB",
  ],
  "facts list": ["memo facts list kind:decision project:HRB"],
  "facts show": ["memo facts show fact:4 --sources"],
  "facts confirm": ["memo facts confirm fact:4"],
  "facts reverse": ["memo facts reverse fact:4"],
  "facts reject": ["memo facts reject fact:4"],
  "facts remove": ["memo facts remove fact:4"],
  "actions add": [
    "memo actions add reply --reason 'Kai asked twice' --account telegram:1 --target 'msg:telegram/1/77/42' --payload '{\"text\":\"Friday works\"}'",
  ],
  "meetings actions add": ["memo meetings actions add findings.json --account zoom:me@example.com"],
  "meetings passage": [
    "memo meetings passage meeting:1/1/1/0 --source zoom:me@example.com --before-n 1 --after-n 1 --json",
  ],
  "meetings prepare": [
    "memo meetings prepare example-series --source zoom:me@example.com --json",
    "memo meetings prepare example-series --source zoom:me@example.com --context-source tg.personal --context-query Harbour --json",
  ],
  "search meetings": [
    "memo search meetings budget --source zoom:me@example.com --project Harbour --since-time 2026-10-01 --limit 10 --json",
  ],
  "meetings actions list": ["memo meetings actions list status:proposed --source zoom:me@example.com"],
  "meetings actions show": ["memo meetings actions show 5 --source zoom:me@example.com"],
  "meetings actions confirm": [
    "memo meetings actions confirm 5 decision --fingerprint aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa --account zoom:me@example.com",
  ],
  "meetings actions reject": [
    "memo meetings actions reject 5 --fingerprint aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa --account zoom:me@example.com",
  ],
  "actions list": ["memo actions list status:proposed"],
  "actions show": ["memo actions show 5"],
  "actions confirm": ["memo actions confirm 5"],
  "actions reject": ["memo actions reject 5"],
  "agents list": ["memo agents list agent:claude-code --limit 20"],
  "mcp serve": ["memo mcp serve", "memo mcp serve --http --public-url https://laptop.example.ts.net"],
  "mcp revoke": ["memo mcp revoke --json"],
  "mcp server start": ["memo mcp server start --public-url https://laptop.example.ts.net"],
  "mcp server status": ["memo mcp server status --json"],
  "mcp server stop": ["memo mcp server stop"],
  "search all": ["memo search all 'budget harbour'", "memo search all 'content:invoice' --only mail,notes --json"],
  "search messages": ["memo search messages 'friday meeting has:voice'"],
  "search mail": ["memo search mail 'mailbox:important budget' --source email:me@example.com"],
  "search notes": ["memo search notes budget notes:2", "memo search notes kickoff --project HRB --json"],
  "search memories": ["memo search memories friday meetings scope:work"],
  "search people": ["memo search people ana", "memo search people Ana Example --source telegram --json"],
  "answers create": [
    "memo answers create 'what did Kai say about the budget?' --all",
    "memo answers create 'when is the launch?' --source telegram:1",
  ],
  sync: [
    "memo sync",
    "memo sync --source email:work --since-time 2026-09-01",
    "memo sync --only notes --folder ~/notes --no-embed",
  ],
  "jobs start": ["memo jobs start --every 10m"],
  "jobs stop": ["memo jobs stop"],
  "jobs status": ["memo jobs status --json"],
  doctor: ["memo doctor", "memo doctor --json"],
  "runs list": ["memo runs list status:failed --limit 10", "memo runs list --page 2 --json"],
  "runs show": ["memo runs show 20261025T090000Z-mail-sync-a81f2c --json"],
  "runs path": ["memo runs path 20261025T090000Z-mail-sync-a81f2c"],
  "store info": ["memo store info", "memo store info --json"],
  upgrade: ["memo upgrade --check"],
  commands: ["memo commands --json", "memo commands tags add --json"],
  "skill show": ["memo skill show"],
  "skill install": ["memo skill install --for all"],
  "skill status": ["memo skill status", "memo skill status --json"],
  guide: ["memo guide", "memo guide person-brief --json"],
  help: ["memo help options", "memo help tasks agenda"],
}

export const leaves = (command: Command, path: string[] = []): [string, Command][] =>
  command.commands.flatMap((child) => {
    const at = [...path, child.name()]
    return child.commands.length ? leaves(child, at) : [[at.join(" "), child] as [string, Command]]
  })

/** Puts each leaf's examples in `commands --json`; cli-core's help prints them as its Example lines. */
export const addExamples = (program: Command): void => {
  for (const [path, command] of leaves(program)) {
    const examples = EXAMPLES[path]
    if (!examples || JSON.stringify(metaOf(command).examples) === JSON.stringify(examples)) continue
    if (hasSharedContract(command))
      overrideSharedContract(
        command,
        "Memo examples use explicit stored-account scope rather than messenger profile words.",
        (one) => {
          annotate(one, { examples })
        },
      )
    else annotate(command, { examples })
  }
}
