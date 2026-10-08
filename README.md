# cli-memo

`memo` answers "what do I need to know about this person": who they are in each messenger, the
newest messages each way, the notes about them, and the newest mail threads — each item with a link
to its source.

It reads the local message store that [tg-cli](https://github.com/leemour/tg-cli) and
[max-cli](https://github.com/leemour/max-cli) share, Markdown notes such as an Obsidian vault, and mail
through [Himalaya](https://github.com/pimalaya/himalaya). Source files and mailboxes are read-only.
Annotations, labels, relationships and task reminders live in the local store. Retrieval is local;
an explicitly selected model receives evidence only with the configured consent.

**Status:** early. Context, document search/import, Gmail and IMAP imports, local annotations,
tasks, manual relationships, evidence bundles and local reminder delivery are available in 0.2.0.

## Your notes on sources and open work

```sh
memo annotations add --message 'msg:notes/vault/./plan.md' --text 'My own assessment'
memo annotations list --provider notes --account vault --search assessment --json
memo annotations edit ANNOTATION_ID --provider notes --account vault --revision 1 --text 'Updated assessment'
memo tasks add 'msg:notes/vault/./plan.md' --type request
memo tasks list --provider notes --account vault --json
memo tasks assign TASK_ID PERSON_UID --provider notes --account vault
memo tasks close TASK_ID --provider notes --account vault --as done
```

Use locators returned by search; `vault` above is a synthetic account example. Annotations also target
`--chat`, `--contact`, `--person`, `--task` or `--entity`, with an explicit provider/account.
`--file /path/to/text.md` supplies annotation text; `--file -` reads stdin. `show` and `remove` take
the annotation ID. Multiple notes can belong to one target. Edits reject a stale revision.
Existing private contact note IDs work through this interface too. Source annotations survive source
edits/deletions and report when the source is unavailable; they never restore deleted source text.

`context` includes directly related open tasks, explicit task assignments and owner annotations.
A task in a shared group belongs in a person's context only when they authored its source or you
assigned it explicitly. Closed tasks stay closed on repeated creation. If several accounts of the
requested provider exist, use `memo context telegram:101 --account 1`.

## Search and gather evidence

```sh
memo notes search '"budget review" AND NOT cancelled' --words-only --limit 20
memo notes search 'project progress' --filter 'after:2026-09-01 AND tag:project' --folder /path/to/vault
memo notes show 'msg:notes/vault/./plan.md' --json
memo search 'budget AND after:2026-09-01' --all --annotation-text assessment --json
memo ask 'What work is pending?' --query budget --all --json
```

Notes search combines words and meaning by default. `--words-only` uses the shared structured query
language; `--filter` constrains free-text/semantic retrieval. Results deduplicate documents, carry
current excerpts and resolve relative wiki paths and aliases, and preserve heading/block anchors inside their
vault. Ambiguous/unresolved links remain visible. Follow `nextOffset` with `--offset`; changes to the
corpus require restarting pagination. `truncated` means the bounded candidate/link scan was incomplete.
No search downloads a model. Only an explicitly mapped, unambiguous note path identifies a person.

Unified `search` reads one selected provider/account or every account with explicit `--all`.
It includes open tasks pointing at matching source evidence. `--annotation-text` adds literal
substring search over owner annotations. Results identify source kind/account, match reason and
coverage. Missing hits do not prove that an event never happened.

`ask` returns an evidence bundle for your chosen agent by default. To call a model, configure
`MEMO_MODELS_ANALYSIS_PROVIDER`, `MEMO_MODELS_ANALYSIS_MODEL`, optionally
`MEMO_MODELS_ANALYSIS_BASE_URL` and `MEMO_MODEL_API_KEY`, then pass `--model`. Remote calls also require
`--allow-remote`. Model claims are generated and unverified, cite supplied evidence, and distinguish
assertions, conclusions and inferences. Suggestions create no task until you explicitly run
`memo tasks add <source> --type <kind>`. Answers are not saved as independent facts.

## Organizations, families and projects

```sh
memo entities add 'Synthetic Studio' --kind organization --provider telegram --account 1
memo relationships add person:PERSON_UID entity:ENTITY_UID --role author --provider telegram --account 1
memo entities context ENTITY_UID --provider telegram --account 1 --json
memo tags add project --entity ENTITY_UID --provider telegram --account 1
memo tags add follow-up --task TASK_ID --provider notes --account vault
```

Entity kinds are organization, family, project and group. Relationships use `member-of` or
`related-to`; `list` and `remove` manage them. They are manual statements and never merge identities
because names/domains match. Person/task/entity labels use explicit stable IDs; listing tags includes
these targets under `knowledge`. Labels and relationships stay on their original references when
identities are linked or split; corrections require an explicit remove/add.

`memo relationships suggest --provider email --account owner@example.test` stores bounded weak
shared-domain proposals for direct email contacts. Proposals retain rule provenance and remain
unconfirmed; they do not enter confirmed person context. `relationships confirm <id>` records your
explicit acceptance. Common free-mail domains are excluded from this heuristic.

## Local task reminders

```sh
memo reminders schedule TASK_ID --at 2026-10-09T09:00:00+02:00 --timezone Europe/Madrid --provider notes --account vault
memo reminders poll --provider notes --account vault --json
memo reminders ack REMINDER_ID RECEIPT --provider notes --account vault
memo reminders snooze REMINDER_ID --revision 1 --at 2026-10-10T09:00:00+02:00 --provider notes --account vault
memo reminders cancel REMINDER_ID --provider notes --account vault
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
an address is linked — then the note about them (`memo note`) and the stored notes naming them in full,
each with its locator. What gave nothing is listed with the reason. `--json` for agents, `--limit` for more.

## Notes

```sh
memo notes import                          # load the notes into the shared store; run again after edits
memo notes search "lighthouse budget"      # notes by their words, and the people they name
memo notes about "Rin Example"             # notes about a person, read straight from the folders
```

`import` stores each document as one entry of provider `notes` in the shared store (the
folder is the account, each subfolder a chat), so `memo notes search`, `tg messages search "in:notes …"`
and agents find notes beside messages and mail. An edited note keeps its old text as a revision; a note
deleted from the folder loses its text on the next import.

`import` also builds each folder's notes for search and embeds them for search by meaning with the local
e5-small model (shared with tg and max: `tg models text download e5-small`), only what changed, at most
600 chunks a run — the next run continues. `--no-embed`, or `notes.embed: false` in the config, skips the
embedding. `search` ranks notes by meaning and by words together and says which found each; without the
model it searches words alone and says so. It then lists who they name: `[[Name]]` links, and people the
store knows from tg, MAX or mail whose full name appears in the text — by name only, so a guess.

`about` lists the notes *about* the person (file name or `aliases` in the front matter), the notes that
*link* them, and lines that only say the name (weak). Hidden folders such as `.obsidian` are skipped,
and nothing is ever written to a notes folder.

Imports accept Markdown/TXT, CSV/TSV, text-layer PDF, DOCX, XLSX, ODT/ODS, PPTX and EPUB.
PDF/DOCX use optional `unpdf` and `mammoth` packages installed alongside the CLI; modern office
formats use the bounded built-in shared readers. Results report missing engines, unreadable files, unsupported legacy DOC/XLS, scanned
PDFs needing an agent, oversized inputs and truncation. PDF page spans, CSV row/column ranges and
XLSX sheet/cell addresses preserve source provenance. Files are capped at 50 MiB and stored text at
200,000 characters. Content hashes detect equal-size edits. A moved path is a new source identity;
its predecessor's annotations remain attached to the old locator and tags are not transferred by name.

Folders and what to skip go in `~/.config/cli-memo/config.json`; `--folder` and `--ignore` add to them
for one run. An ignore rule is a path inside the folder — a file, or a folder and everything under it —
or a glob (`**/Private*`, `*.txt`):

```json
{ "notes": { "folders": [{ "id": "fld_…", "path": "/path/to/vault" }], "ignore": ["Journal/Private.md", "Archive"] } }
```

### Folders and their format

```sh
memo folders add /path/to/vault                     # gives the folder an id and prints it
memo folders add /path/to/notes --format markdown   # a plain Markdown folder
memo folders attach fld_… /other/path/to/vault      # the same folder on another computer
memo folders list
```

A folder's id is what links and the store use; its path is only where it is on this computer, so the
config differs between computers and the id does not. A bare path in `notes.folders` still works and is
turned into an entry with an id by `memo folders add <path>`. A path can belong to one id only.

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

`memo import` is incremental. A note whose size and change time are as last stored is not read; one
whose content hash is the same is not saved. Mail reads bodies only of messages not stored yet. A lock
keeps two imports from running at once, and one failing source does not stop the others.

## Mail

Gmail remains the default. For another IMAP provider, configure an account with `mode: "imap"`
and `folders: ["INBOX", "Archive"]` in `mail.accounts`. Message-ID and reference headers preserve
message/thread identities across folder moves and UID resets. Mail without Message-ID uses an explicit
UIDVALIDITY/folder/UID fallback, which can change after a move/reset. Configured folders are listed
completely before deletion checks; a changed folder scope skips deletion for that run.

Imports index changed threads with the shared bounded pipeline and report the proven date/folder
window, resumable indexing and missing models. No thread is called globally complete on the basis
of one window. CC/BCC headers are retained when available. Readable attachments become separate source
entries linked to their parent/part; extraction failures are reported. After installing an optional
engine, use `memo mail import --retry-attachments` to reread a bounded batch of stored messages.

```sh
memo mail import --since 2026-09-01
```

Reads a Gmail account's All Mail through [Himalaya](https://github.com/pimalaya/himalaya) into the
shared message store as provider `email`: one chat per Gmail thread, the mailbox address as the
account, senders and recipients as people. Messenger search and person context then see mail too.

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
{ "mail": { "accounts": [{ "name": "gmail", "address": "you@example.com" }] } }
```

## People

Who is who is decided in messaging: `tg contacts link <person> email:<address>` (or `max contacts link`)
records that a messenger identity and a mail address are one person, in the shared store. A same name
is never enough. `memo` only adds the note that is about the person:

```sh
memo note telegram:"Rin Example" ~/Notes/people/Rin.md
```

An identity is `<messenger>:<name or id>`; a name two people share is refused, with their ids to
choose from. The note path lives in `~/.config/cli-memo/people-notes.json`.

## Tags on sources

```sh
memo notes search "lighthouse budget" --json  # each hit includes its locator
memo tags add work follow-up --message 'msg:notes/%2Fpath%2Fto%2Fvault/Projects/Projects%2FLighthouse.md'
memo notes search "budget" --tag work
memo tags list --tag work --json
memo tags remove follow-up --message 'msg:notes/%2Fpath%2Fto%2Fvault/Projects/Projects%2FLighthouse.md'
```

Copy the full `msg:` locator from search results to label an imported note, email or stored messenger
message. Its provider, account, chat and item ID select one source even when another account has the
same IDs. Tags use 1–32 letters a–z, digits or hyphens; case is ignored. Adding an existing tag or
removing an absent one leaves it unchanged.

A tag on an entire notes subfolder or email thread applies to its messages in search. Give the exact
stored chat ID and account (a notes folder's absolute path or a mailbox address):

```sh
memo tags add project --chat Projects --provider notes --account /path/to/vault
memo tags add follow-up --chat 12345 --provider email --account you@example.com
memo tags list --provider notes --account /path/to/vault --type chat
tg messages search 'in:email tag:follow-up'
```

Labels live in the shared local store. Tagging leaves note files, Obsidian front matter, Gmail labels
and mailbox flags untouched. Labels survive source edits; deleted items disappear from memo's tag
listing and search. Their label metadata remains in the shared store, and a renamed note has a new
source ID. `tags list` shows up to 100 labels by default (`--limit` for more, `hasMore` in JSON).
Contact identity tags remain available through `tg|max tags`; task and unified-person tags are future work.

## Development

```sh
pnpm install
pnpm lint && pnpm typecheck && pnpm test
```

## License

MIT
