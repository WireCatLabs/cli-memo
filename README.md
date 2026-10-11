# cli-memo

`memo` answers "what do I need to know about this person": who they are in each messenger, the
newest messages each way, the notes about them, and the newest mail threads — each item with a link
to its source.

It reads the local message store that [tg-cli](https://github.com/WireCatLabs/tg-cli) and
[max-cli](https://github.com/WireCatLabs/max-cli) share, Markdown notes such as an Obsidian vault, and mail
through [Himalaya](https://github.com/pimalaya/himalaya). Source files and mailboxes are read-only.
Notes you write here, links, labels, relationships and task reminders live in the local store.
Retrieval is local; an explicitly selected model receives evidence only with the configured consent.

**Status:** early. Context, notes and their links, document import, Gmail and IMAP imports, tasks,
manual relationships, evidence bundles and local reminders work.

## Your notes on messages, people and projects

```sh
memo notes add 'Prefers mornings' --about telegram:'Rin Example'
memo notes add --file review.md --about 'msg:telegram/1/77/42' --about project:PROJECT_ID --export
memo notes list --about telegram:'Rin Example' --json
memo notes edit NOTE_ID --revision 1 --text 'Prefers early mornings'
memo notes remove NOTE_ID
memo notes export --to /path/to/vault/memo --format obsidian
```

A note written here is the store's, not a file's, and is about whatever `--about` names: a person by
`<messenger>:<name or id>`, or any stored record by its reference — `msg:`, `chat:`, `contact:`,
`person:`, `organization:`, `project:`, `task:`, `note:`, `document:`. Several `--about` give it several
subjects. An edit names the
revision it changes, so an edit made meanwhile is never lost. tg and max `contacts notes` are the same
notes.

`export` writes them as files, in a folder's format, with `memo-id` and `memo-hash` in the front
matter: import skips such a file, so an export inside a vault never comes back as a second note. A
file edited since memo wrote it is left alone and reported; nothing is deleted. `--export [dir]` on `add`
and `edit` writes one; with no folder given, `notes.export: { "dir": "…", "format": "…" }` in the
config says where.

## Open work

```sh
memo tasks add 'msg:telegram/1/77/42' --type request
memo tasks add 'note:NOTE_ID' --provider telegram --account 1 --type request
memo tasks list --provider telegram --account 1 --json
memo tasks assign TASK_ID PERSON_UID --role reviewer
memo tasks close TASK_ID --provider telegram --account 1 --as done
memo tasks add --project LH --title 'Export drops the last row' --type bug --priority 1 --assignee PERSON_UID
memo tasks update LH-1 --priority 0 --description 'Seen on CSV export'
memo tasks list --project LH
memo tasks close LH-1 --reason fixed
```

A bug, feature or chore has no source: `--project` (its key or `project:<id>`) and `--title` make it there,
keyed `<project key>-<n>`. `--priority` (0 urgent … 4 low), `--parent`, `--description` and `--assignee` work
on any task, one from a message too; `tasks update` changes them later. `tasks assign` names an assignee,
reviewer or watcher. Every change of status, due date, priority or assignee is recorded as a task event.

Native note tasks belong to the explicitly selected stored account. Their previews read current note
text; deleting a note keeps its task with an unavailable source. Repeated creation of the same kind
returns the existing task, including one already closed.

`context` includes directly related open tasks and explicit task assignments. A task in a shared group
belongs in a person's context only when they authored its source or you assigned it explicitly. Closed
tasks stay closed on repeated creation. If several accounts of the requested provider exist, use
`memo context telegram:101 --account 1`.

## Search and gather evidence

```sh
memo search notes '"budget review" AND NOT cancelled' --limit 20
memo search notes 'project progress' --filter 'date:2026-10-08' --tag project --folder /path/to/vault
memo notes show note:NOTE_ID --json
memo search all 'budget AND date:[2026-09-01 TO *]' --json
memo ask 'What work is pending?' --query budget --all --json
```

Notes are searched by their words and word stems, in the query language messages use: phrases,
`AND`/`OR`/`NOT`, `tag:`, `date:`; `--exact` matches every word as written. A message-only field such as
`from:` is refused. They are also searched by meaning when the model is downloaded, and the two are
ranked together: `by` says which ran, each hit's `foundBy` which found it, and `meaningSkipped` why
meaning did not run. Each hit carries its reference, the first matching line and the links the note
holds; `linked` counts what the notes found link to, with each person's name. Follow `nextOffset` with
`--offset`.

`notes show` takes `note:<id>` or a file in a configured folder, and answers with the note's tags, its
links, its backlinks and, for a PDF or sheet, where its text came from.

`search all` searches messages, imported mail and native notes together, and nothing else: not people,
memories, projects, organizations or decisions. Use it when you do not know where something was written. When
you know the kind, its own search reads it with every field: `search mail` takes `from:`, `to:`, `cc:`, `bcc:`,
`subject:` and `mailbox:` (a folder or Gmail label); `search messages`, `search notes`; `search notes --type
internal|file` narrows note kinds. An empty answer means those three hold nothing that matches: try the kind's
own search, looser words, or `tg search conversations` to find mail and messages by meaning.
`search all` includes a separate `tasks` list for open work linked to matching sources. Results identify source
kind/account and skipped-resource coverage; a query using a field only messages have (`from:`, `after:`)
searches the messages and says the notes were not searched. Missing hits do not prove that an event
never happened.

`ask` returns an evidence bundle for your chosen agent by default. To call a model, configure
`MEMO_MODELS_ANALYSIS_PROVIDER`, `MEMO_MODELS_ANALYSIS_MODEL`, optionally
`MEMO_MODELS_ANALYSIS_BASE_URL` and `MEMO_MODEL_API_KEY`, then pass `--model`. Remote calls also require
`--allow-remote`. Model claims are generated and unverified, cite supplied evidence, and distinguish
assertions, conclusions and inferences. Suggestions create no task until you explicitly run
`memo tasks add <source> --type <kind>`. Answers are not saved as independent facts.

## Organizations and projects

```sh
memo organizations add 'Synthetic Studio' --kind company
memo projects add 'Synthetic Harbour' --organization organization:ORGANIZATION_ID
memo relationships add person:PERSON_UID project:PROJECT_ID --role author
memo projects context PROJECT_ID --json
memo tags add client --organization ORGANIZATION_ID
memo tags add follow-up --task TASK_ID
```

Organizations (a company, team, family or community) and projects (with a short key, a type and the
organization they belong to) are yours, not one account's. Relationships use `member-of` or `related-to`;
`list`, `remove` and `confirm` manage them. They are manual statements and never merge identities because
names or domains match. `organizations context` and `projects context` list the relationships, the notes
about or linking it, and its tags. Tags on a task need no account; its
reminders name the account it waits on.

`memo relationships suggest --provider email --account owner@example.test` stores bounded weak
shared-domain proposals for direct email contacts. Proposals retain rule provenance and remain
unconfirmed; they do not enter confirmed person context. `relationships confirm <id>` records your
explicit acceptance. Common free-mail domains are excluded from this heuristic.

## Memories, proposed actions and the agent log

```sh
memo memories add 'Bob Sample prefers Friday meetings' --kind preference --scope work --evidence note:NOTE_ID
memo memories list --status proposed
memo memories confirm memory:MEMORY_ID
memo facts add 'Releases go out on Fridays' --type decision --evidence msg:telegram/1/77/42
memo facts list --type decision --status proposed
memo facts accept fact:FACT_ID
memo actions propose reply --reason 'asked twice' --provider telegram --payload '{"text":"Friday works"}'
memo actions approve ACTION_ID
memo agents log --agent memo-mcp --limit 20
```

A memory is what was concluded — a summary, digest or preference — with its evidence (any stored reference)
and a scope, `personal` or `work`. One you write is confirmed at once; an agent's waits as `proposed` until you
`confirm` it, and `stale` marks one whose evidence no longer holds. `memories search` finds the words in
them.

A fact is what happened: a fact, a statement, a question, a decision or a promise, with its evidence. Yours is
accepted at once; an agent's waits as `proposed` until you `facts accept` it. A decision with `--supersedes`
ends the one it replaces once accepted, and `facts reverse` ends an accepted decision nothing replaced.

A proposed action is what an agent wants done in one account: a reply, a ban, an invitation. Nothing is ever
sent. `actions approve` makes it a task in that account's inbox, so it shows in `memo tasks list`, and the
proposal remembers the task; `actions reject` closes it. `actions list --status` filters them.

`memo agents log` lists what agents did through the MCP servers that share the store, newest first: the
agent, the tool, its tier, the outcome and the times, never the arguments.

`memo mcp` serves the same to an agent over MCP, on stdin and stdout: `memories_add`, `memories_list`,
`memories_show`, `memories_search`, `facts_add`, `facts_list`, `facts_show`, `actions_propose`, `actions_list`, `actions_show` and `agents_log`. An
agent's memories, facts and proposals are its own (`memo-mcp`) and wait for you; it cannot confirm, accept,
approve or reject. Every call goes into the agent log.

```json
{ "mcpServers": { "memo": { "command": "memo", "args": ["mcp"] } } }
```

## Local task reminders

```sh
memo reminders schedule TASK_ID --at 2026-10-09T09:00:00+02:00 --timezone Europe/Madrid --provider telegram --account 1
memo reminders poll --provider telegram --account 1 --json
memo reminders ack REMINDER_ID RECEIPT --provider telegram --account 1
memo reminders snooze REMINDER_ID --revision 1 --at 2026-10-10T09:00:00+02:00 --provider telegram --account 1
memo reminders cancel REMINDER_ID --provider telegram --account 1
```

Reminders are local deliveries for an explicitly scheduled open task. Poll leases due deliveries;
acknowledgement confirms consumption. Expired leases retry with a new receipt; integrations deduplicate
by `deliveryId` (reminder ID and revision). State survives restart. Snooze checks the current revision;
task closure cancels pending reminders. The import timer continues to import sources and does not
deliver reminders to messengers or email. A caller can schedule `poll` using its chosen local scheduler.

## Context about a person

```sh
memo context telegram:"Rin Example"     # or max:<name or id>, email:<address>
```

One answer from the shared store: every identity linked to the person (`tg|max contacts link`), the
last message each way, recent messages in direct chats and groups, chats in common — mail included once
an address is linked — then the notes linked to them: the note about them (`memo note`), notes that link
them, notes that link the note about them, and the notes you wrote here about them. A name in a note's
plain text is not a link and is not listed. What gave nothing is listed with the reason. `--json` for
agents, `--limit` for more.

## Notes

```sh
memo folders add /path/to/vault            # once: gives the folder an id
memo notes import                          # load the notes into the shared store; run again after edits
memo search notes "lighthouse budget"      # notes by their words and meaning, and what they link
memo notes about telegram:"Rin Example"    # notes about a person, and the notes linking them
```

`import` stores each file as a note of its folder, named by its path inside the folder. An edited note
keeps its old text as a revision; a note deleted from the folder loses its text on the next import, and a
run that finds most notes missing at once deletes nothing and says so. A file moved inside the folder —
gone from one path, the same content at another — keeps its id, its links and its tags.

Import also stores what each note links, through the folder's format. A link to a note the folder has
once becomes a link to that note. A name no note has, such as `[[Kai Sample]]`, is kept as written and
becomes a link to the person the moment someone by that name, local alias or username is in the store —
or stays unresolved while two people share it. A file's `tags:` and `#tags` become the note's tags, and
a tag removed from the file is removed from the note — unless you added the same tag yourself.

Import then embeds the notes for search by meaning with the local e5-small model (shared with tg and
max: `tg models text download e5-small`), only what changed, at most 600 chunks a run — the next run
continues. `--no-embed`, or `notes.embed: false` in the config, skips it.

`about` takes `<messenger>:<name or id>` or a reference (`person:`, `organization:`, `project:`, `note:`,
`document:`) and lists the
notes about it, the notes that link it, the notes that link a note about it, and links written with the
person's name that two people share. Hidden folders such as `.obsidian` are skipped, and nothing is ever
written to a notes folder.

Imports accept Markdown/TXT, CSV/TSV, text-layer PDF, DOCX, XLSX, ODT/ODS, PPTX and EPUB.
PDF/DOCX use optional `unpdf` and `mammoth` packages installed alongside the CLI; modern office
formats use the bounded built-in shared readers. Results report missing engines, unreadable files, unsupported legacy DOC/XLS, scanned
PDFs needing an agent, oversized inputs and truncation. PDF page spans, CSV row/column ranges and
XLSX sheet/cell addresses preserve source provenance. Files are capped at 50 MiB and stored text at
200,000 characters. Content hashes detect equal-size edits.

Folders and what to skip go in `~/.config/cli-memo/config.json`; `--folder` narrows a run to some of the
configured folders and `--ignore` adds rules for one run. An ignore rule is a path inside the folder — a file, or a folder and everything under it —
or a glob (`**/Private*`, `*.txt`):

```json
{ "notes": { "folders": [{ "id": "3", "path": "/path/to/vault" }], "ignore": ["Journal/Private.md", "Archive"] } }
```

### Folders and their format

```sh
memo folders add /path/to/vault                     # gives the folder an id and prints it
memo folders add /path/to/notes --format markdown   # a plain Markdown folder
memo folders attach FOLDER_ID /other/path/to/vault  # the same folder on another computer
memo folders list
```

A folder's id is the store's and is what notes and links use; its path is only where it is on this
computer, so the config differs between computers and the id does not. `folders list` also shows the
folders the store has from another computer, to attach. A path can belong to one id only. A bare path in
`notes.folders`, or a folder with no id, is refused by import with both commands named — memo never
invents an id, which would give every note a new identity. A folder id from a store older than
`wirecat.db` is not in the store: `memo folders add <path>` gives the folder a new one.

`format` says how the folder's notes are written. `obsidian` (the default) reads `[[Note|label]]` links
with `#heading` and `#^block` anchors, `aliases`, `tags:` and inline `#tags`. `markdown` reads
`[label](path.md)` links and `tags:`; a `#word` in its text is not a tag. Both read links to stored
records — `[Rin](person:…)`, or a bare `msg:…` in the text.

A Markdown file whose front matter carries `memo-id` was written by memo and is skipped by import.

## Keeping it current

```sh
memo import                  # notes and mail, only what changed since the last run
memo auto on --every 5m      # run memo import on a systemd user timer (default 5m, a minute or more)
memo auto status             # on/off, interval, next and last run
memo auto off                # stop and remove the timer
```

The config is the one source: `memo auto on/off` write `auto: { enabled, every }` to
`~/.config/cli-memo/config.json`, and a hand edit there takes effect at the next timer run, which
rewrites or removes its own timer to match. The timer runs `memo import` from the place it was set up
from, with the `PATH` of that shell, so Himalaya and the keyring helper are found.

`memo import` is incremental. A note whose size and change time are as this computer last saw them is
not read; one whose content hash the store already has is not saved, so a second computer importing the
same folder saves nothing new. What this computer last saw is kept per folder in memo's state folder. Mail reads bodies only of messages not stored yet. A lock
keeps two imports from running at once, and one failing source does not stop the others.

## Mail

Gmail remains the default. For another IMAP provider, configure an account with `mode: "imap"`
and `folders: ["INBOX", "Archive"]` in `mail.accounts`. Message-ID and reference headers preserve
message/thread identities across folder moves and UID resets. Mail without Message-ID uses an explicit
UIDVALIDITY/folder/UID fallback, which can change after a move/reset. Configured folders are listed
completely before deletion checks; a changed folder scope skips deletion for that run.

Imports report the proven date/folder window. No thread is called globally complete on the basis of one
window. To, CC and BCC are kept. A readable attachment's text is kept with its email and searched with it
(`content:`, `filename:`); extraction failures are reported. After installing an optional engine, use
`memo mail <account> import --retry-attachments` to reread a bounded batch of stored mail. Import embeds mail
for search by meaning (`--no-embed` skips it); `memo search mail` itself matches words, and `tg search
conversations` finds mail by meaning.

```sh
memo mail work import --since 2026-09-01      # work: the account's name in mail.accounts
memo search mail 'budget' --account you@example.com   # one mail account; every one without --account
```

`<account>` is required, even with one account configured: memo never picks one for you, and names the
configured accounts when it is missing or unknown. `memo import` and the timer import every account in
`mail.accounts`. A mail import and `memo import` share one lock, so they never run at the same time.

Reads a Gmail account's All Mail through [Himalaya](https://github.com/pimalaya/himalaya) into the
shared store's mail tables: one thread per Gmail thread, each folder a mailbox, the mailbox address as
the account, senders and recipients as people. Gmail labels (Inbox, Important, Starred, your own) become
label mailboxes, so `search mail mailbox:important` finds them. `search mail`, `search all`, `ask`, person context and tags
see it. Mail an import before 0.8.0 saved as messages stays searchable; an email imported again is listed
once.

- Read only: the mailbox is opened read-only, nothing is sent, and no mail is marked read.
- Run it again any time: what is stored is skipped; `--max` (default 200) bounds the new mails read
  per run, and the next run continues.
- A mail deleted at the source loses its text in the store. The first two days of the window are left
  alone, and a run that finds an unusually large share missing deletes nothing and says so. Mail moved
  to Spam leaves All Mail and counts as deleted.

Set the account up in Himalaya first (an IMAP account with a Gmail
[app password](https://myaccount.google.com/apppasswords); `bin/mail-password <name>` stores it in the
keyring), then name it in `~/.config/cli-memo/config.json`:

```json
{ "mail": { "accounts": [{ "name": "work", "address": "you@example.com" }] } }
```

`mail.maxBodyChars` (default 1,000,000) and `mail.maxAttachmentChars` (default 200,000) set how many characters
of a body and of one attachment's text are kept.

## People

Who is who is decided in messaging: `tg contacts link <person> email:<address>` (or `max contacts link`)
records that a messenger identity and a mail address are one person, in the shared store. A same name
is never enough. `memo` only names the note that is about the person:

```sh
memo note telegram:"Rin Example" ~/Notes/people/Rin.md
memo note telegram:"Rin Example" --clear
```

An identity is `<messenger>:<name or id>`; a name two people share is refused, with their ids to
choose from. The note must be imported first; the link is an `about` link in the store. Entries of an
older `~/.config/cli-memo/people-notes.json` move into the store once their notes are imported; the file
itself is left as it is.

## Tags on sources

```sh
memo tags add work follow-up --note note:NOTE_ID
memo tags add project --folder FOLDER_ID --path Projects
memo search notes "budget" --tag work
memo tags add follow-up --message 'msg:email/you%40example.com/12345/67890'
memo tags add follow-up --chat 12345 --provider email --account you@example.com
memo tags list --tag follow-up --json
tg search mail 'tag:follow-up'
```

A note is labelled by its reference (`--note note:<id>`, or `document:<id>` for a file in a notes
folder), an email or messenger message by its full `msg:` locator, a mail thread or chat by its exact id
and account. A person, organization, project or task is labelled by `--person`, `--organization`,
`--project` or `--task`, with no account; a contact names its account, and so does a meeting:
`--meeting <id> --provider <provider> --account <account>`, the meeting's id in the store. A note about a
meeting takes the same three options: `memo notes add 'Send the agenda' --meeting <id> --provider <provider>
--account <account>`. `--folder` with an id from
`memo folders list`, and `--path` for one subfolder, labels every note under it at any depth. Tags use 1–32 letters a–z, digits or hyphens; case is ignored.
Adding an existing tag or removing an absent one leaves it unchanged.

Labels live in the shared local store. Tagging leaves note files, front matter, Gmail labels and mailbox
flags untouched. Labels survive edits and moves of the note; a deleted note disappears from search.
`tags list` shows up to 100 labels by default (`--limit` for more, `hasMore` in JSON); a note's tags
say whether its file or you stated them. Contact identity
tags remain available through `tg|max tags`.

## Development

```sh
pnpm install
pnpm lint && pnpm typecheck && pnpm test
```

## License

[Apache License 2.0](LICENSE).
