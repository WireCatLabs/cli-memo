# Changelog

Notable changes to `@wirecat/cli-memo`, one section per version, newest
first. Versions follow [semantic versioning](https://semver.org/); before `1.0.0` a minor release may change
the API.

## 0.13.0 — 11.10.2026

### Added

- **`mail.maxBodyChars` and `mail.maxAttachmentChars`** in the config set how much of an email body (default
  1,000,000 characters) and of one attachment's text (default 200,000) `memo mail import` keeps.
- **`memo facts add|list|show|accept|reverse`: what happened, with its evidence.** A fact is a fact, statement,
  question, decision or promise. Yours is accepted at once; an agent's waits as proposed. A decision with
  `--supersedes` ends the one it replaces once accepted; `reverse` ends an accepted decision. `memo mcp` offers
  `facts_add`, `facts_list` and `facts_show`.
- **Tasks of your own in a project.** `memo tasks add --project <key> --title <title> --type bug|feature|chore`
  makes one with no source. `--priority`, `--parent`, `--description` and `--assignee` work on any task;
  `memo tasks update <id>` changes them, `memo tasks list --project <key>` lists a project's tasks and
  `memo tasks close` closes one.

### Changed — may break scripts

- **memo runs on `@wirecat/cli-messaging` 0.238.0**, store version 2: upgrading a store moves its kind-fact
  memories into facts and copies task assignments; older memo builds still open it.
- **Mail is searched by meaning thread by thread**, without re-quoted text: the first `memo mail import` after the
  upgrade cuts every thread again and embeds the mail once more. Search by words is unchanged.
- **A memory's kind `fact` is gone**: what happened is a fact now (`memo facts`). The store moved existing
  kind-fact memories into facts, evidence and links included.
- **`memo tasks assign` takes `--role` (assignee, reviewer or watcher) and no `--provider`/`--account`.** It
  writes the task's assignees, which `memo context` reads, instead of an `assigned-to` relation.

## 0.12.0 — 11.10.2026

### Added

- **`memo notes add --meeting <id> --provider <provider> --account <account>` writes a note about a meeting.**
  It takes the meeting's store id, as `memo tags add --meeting` does, and adds the same
  `meeting:<account id>/<meeting id>` subject beside any `--about`. A meeting the account does not hold is
  `not_found`.

### Changed — may break scripts

- **memo runs on `@wirecat/cli-messaging` 0.235.0.**
- **Read and starred stay current.** `memo mail import` updates read and starred on mail it stored earlier, as
  the mailbox shows them now, without reading the mail again.
- **Generic IMAP accounts get flags.** Their messages record read and flagged, and a flagged one carries the
  `Starred` label, as a starred Gmail message does, so `search mail mailbox:starred` finds both.
- **Long emails are kept whole.** A body was cut at 20,000 characters; it is now kept up to 1,000,000, and the
  store cuts it into pieces for search.

## 0.11.0 — 11.10.2026

### Changed — may break scripts

- **memo runs on `@wirecat/cli-messaging` 0.233.0.** An imported email's attachments are now found by meaning
  too: their text is cut into pieces and embedded after import, and tg/max `search conversations` answer a match
  in an attachment with its email.

## 0.10.0 — 11.10.2026

### Added

- **Gmail labels and stars reach the store.** `memo mail import` reads each message's labels (`X-GM-LABELS`) and
  flags: every label, Inbox, Important and Sent included, becomes a label mailbox with a plain name, a starred
  message also gets `Starred`, and new mail records read and starred. `search mail mailbox:important` finds them.
  Labels are replaced on every run, as Gmail's list is whole; folders keep the per-scan rule, and only folders
  decide whether missing mail was deleted. A label line the import cannot read leaves that message's labels as
  they were.

## 0.9.0 — 11.10.2026

### Added

- **A meeting can be tagged and written about.** `memo tags add|remove --meeting <id>` with `--provider` and
  `--account` labels a stored meeting, `memo tags list --type meeting` lists them, and `memo notes add --about
  meeting:<account id>/<meeting id>` writes a note about one.
- **`memo memories`** — `add`, `list`, `show`, `search`, `confirm` and `stale` for what you and agents
  concluded, each with its evidence and a `personal` or `work` scope. Yours are confirmed at once; an agent's
  wait as proposed.
- **`memo actions`** — `propose`, `list`, `show`, `approve` and `reject`. Approving makes the action a task
  in the account that would act; nothing is sent.
- **`memo agents log`** — what agents did through the MCP servers, by tool and agent, never the arguments.
- **`memo mcp`** — an MCP server on stdio with `memories_add|list|show|search`, `actions_propose|list|show` and
  `agents_log`. What an agent writes is authored by `memo-mcp` and waits for you; every call is logged.

### Changed — may break scripts

- **memo runs on `@wirecat/cli-messaging` 0.232.0.** `search mail` takes `to:`, `cc:`, `bcc:` (a person, as
  `from:`), `subject:` (words of the subject alone) and `mailbox:` (a folder or Gmail label).
- **`search` and `search all` help say what `search all` does not read** — people, memories, projects,
  organizations and decisions — and send a kind you know to its own search.
## 0.8.0 — 11.10.2026

### Changed — may break scripts

- **Mail goes into the store's mail tables.** `memo mail import` saves each email through cli-messaging's
  `store.mail` (0.231.0): threads, emails, To/CC/BCC, folders as mailboxes, and attachment text on its email.
  Ids stay the same, so a `msg:email/…` reference, tag or note made before still resolves. Mail saved as
  messages by earlier imports stays searchable and keeps its old deletion rule; it is read again into the
  mail tables as the window covers it. While both exist, `deleted` counts stored rows: a mail deleted at the
  source counts its email, its older message and any older attachment entry. An attachment is no longer its own
  entry: the import report drops `attachments[].locatorId`, and a note on an attachment entry stays on that older
  entry.
- **Tags, tasks and person context read the mail tables.** `tags list` keeps a tag on an email, `tasks add` takes an
  email's `msg:email/…` source, and a person's tasks and context include their mail.
- **Mail is embedded from the mail tables.** After saving, `memo mail import` embeds new mail's chunks (cli-messaging's
  `embedMail`), so tg and max `search conversations` keep finding mail by meaning. `--no-embed` and a missing model
  behave as before.

## 0.7.1 — 11.10.2026

### Fixed

- Mail search, evidence bundles and person context also read email stored in dedicated mail tables.
  Older mail imports remain supported; search results list each email locator once.

## 0.7.0 — 11.10.2026

### Changed

- **memo runs on `@wirecat/cli-messaging` 0.226.0.** The store prunes its growing logs on open, at most once a
  day: agent tool calls older than 90 days are deleted, and a handled bot update older than 30 days loses its
  payload. Upgrade tg-cli and max-cli first, as all three share the store.
- **`organizations add --kind`, `projects add --type` and `--scope` take their allowed values from the store**
  and refuse any other value before the store is opened, naming the allowed ones.

### Fixed

- **`memo --version` prints the package's version.** It printed 0.4.0 since 0.5.0: the number lived in a file the
  release did not update. A test now fails when that file and `package.json` disagree.
- Package references, documentation and fixtures use the WireCat namespace throughout.

### Security

- **The old `messages.db` is deleted** when the store opens at its default path: the unencrypted file used
  before `wirecat.db`, with its `-wal` and `-shm`. One line on stderr names it. It is kept when
  `MESSAGING_STORE` is set, and while another process still has it open.

## 0.6.0 — 10.10.2026

### Changed — may break callers

- **memo runs on `@wirecat/cli-messaging` 0.218.0 and `@wirecat/cli-core` 0.19.3**, the store in `wirecat.db`.
  The old `messages.db` is left as it is and not read: import notes and mail again, and run
  `memo folders add <path>` for each folder, since a folder id from the old store is not in the new one.
- **`memo entities` is replaced by `memo organizations` and `memo projects`** (`add`, `list`, `context`),
  as the store now keeps them apart; `tags --entity` is `--organization` or `--project`, and `entity:`
  references are not found. An organization is a company, team, family or community; a project has a key.
- **A file in a notes folder is `document:<id>`, a note written in memo `note:<id>`.** `notes show`,
  `tags --note`, `tasks add` and `--about` take either; a bare id is a written note's. Search evidence and
  links name a file's note by `document:`.

### Security

- Fast secret checks remain on PRs; source, production dependency and workflow security checks run before publication. Automatic Socket checks are disabled.

## 0.5.1 — 10.10.2026

### Changed

- **The project is now licensed under Apache License 2.0.** See `LICENSE` for the terms.

## 0.5.0 — 10.10.2026

### Changed — may break callers

- **The package is `@wirecat/cli-memo` and its repository belongs to WireCatLabs.** Use this package for installations and updates.


## 0.4.0 — 09.10.2026

### Changed — may break scripts

- The shared store drops the copies kept for older versions (store version 28, cli-messaging 0.212.0).
  Notes, relations and entities written before the notes refactor are copied into their new tables once,
  during the upgrade. After it, an older tg, max or memo refuses the store with "upgrade this tool" —
  update all three together.

## 0.3.0 — 09.10.2026

### Changed — may break scripts

- Search commands now live under `search all|messages|mail|notes`, using the shared services and ranking.
  `search all` returns typed source hits and a separate `tasks` list for linked open work. The old
  `memo search <query>` and `memo notes search` paths are removed without aliases. Use `search notes --type`
  instead of `notes search --source`; `--all` and `--note-text` are no longer needed.

- Pin shared SDK 0.211.0 alongside Telegram/MAX. Legacy copied note task sources move to native note IDs
  without changing task IDs, account scope or closed states. Upgrade the coordinated tools together
  before opening the shared owner store.

### Fixed

- `search all` finds messages on a store that has not yet recorded the account it runs as, and asks the
  messenger's server the way `search messages` does. `search mail` with no mail imported answers an empty
  result with a note. Notes found by meaning must be as similar as conversations already have to be, so a
  rare word no longer returns every note.

### Added

- `tasks add note:<id> --provider <provider> --account <account>` creates tasks from native file or internal
  notes. Lists resolve the current note preview; deleted notes leave tasks intact. Confirmed note-about-person
  links and explicit assignments contribute to person context. Unified search includes tasks whose note matches.
  Repeated creation reuses the existing task of the same kind, including closed tasks.

## 0.2.1 — 08.10.2026

- Pin cli-messaging 0.205.0 to match the coordinated Telegram/MAX release. Native notes, links and
  source references retain the same schema and behavior.

## 0.2.0 — 08.10.2026

Notes are their own records in the shared store (cli-messaging 0.202.0, store versions 25–27), no longer
messages of a `notes` provider.

- `memo folders add|attach|list`: a folder of notes gets its id from the store, and each computer's
  config binds it to that computer's path and format (`obsidian` or `markdown`). `list` shows folders the
  store has from another computer. A folder imported before store version 25 moves its path into the
  config on the first run. Import refuses a folder with no id instead of inventing one.
- Import writes notes, their links and their file tags. A link to a note the folder has once is stored
  by the note's id; a name no note has stays as written and resolves to a person as soon as one by that
  name, alias or username exists. A moved file keeps its id, links and tags. A tag you added stays when
  the file stops stating it. What a computer last saw of
  each file is kept in memo's state folder, and only a changed file is opened — also to look for
  `memo-id`, which marks a file memo exported and keeps it out of the import.
- `memo notes add|edit|remove|list|show|export` for notes written here about messages, chats, contacts,
  people, entities, tasks and other notes; `--export [dir]` and `notes.export` write them as files that
  carry `memo-id` and are never overwritten once edited.
- `memo notes about`, `memo context` and `memo note` read saved links: notes about a person, notes
  linking them, notes linking a note about them. A full name found in a note's plain text is no longer
  listed as a guess. The old `people-notes.json` moves into the store as `about` links, once.
- `memo notes search` runs on the shared notes index: words and stems, the messages' query language,
  `--exact`, `--source`, `--folder` by path or id, and by meaning when e5-small is downloaded — `memo
  import` and `memo notes import` embed the notes (`--no-embed`, `notes.embed: false`). Each hit says what
  found it (`foundBy`), and a person a found note links is named. `memo search --all` covers notes;
  `--note-text` also retrieves authored note text.
- Entities and relationships are the owner's: `entities` and `relationships add|list|remove|confirm`
  no longer take `--provider`/`--account`. `memo tags add --note <id>` labels a note; `--person`,
  `--entity` and `--task` need no account. `--folder <id> [--path <subfolder>]` labels every note under a
  folder or subfolder, replacing `--chat` with `--provider notes`. `tags list` says whether a note's tag
  came from its file.
- Notes are read through a format: `obsidian` adds inline `#tags` and reads `[label](path.md)` links
  besides `[[wiki links]]`; `markdown` reads plain Markdown links. Links to `person:`, `msg:`, `note:`,
  `entity:`, `task:`, `chat:` and `contact:` references are recognised in both.

- Open tasks and explicit document-task assignments in person context; tasks add/list/close reuse the
  shared task service. Multiple matching accounts require explicit selection.
- CSV/TSV, PDF, DOCX, XLSX, ODT/ODS, PPTX and EPUB ingestion through shared extraction, with optional-engine and unsupported
  format reporting, file/text bounds, content hashes and page/row/cell provenance.
- Configurable Gmail/IMAP folder coverage, stable Message-ID identities, attachment text sources and
  bounded resumable email indexing. Partial listings never prove deletion; changed folder scopes skip deletion.
- Canonical-person/task/entity labels, manual organization/family/project relationships, selected-source
  unified retrieval, and cited evidence bundles/model proposals with explicit remote consent.
- Durable local task reminders with lease receipts, acknowledgement, stale-edit checks, snooze/cancel
  and automatic cancellation when a task closes. No outbound delivery or source-system mutation.

- `memo tags add|remove|list`: local labels on imported notes, emails, messages and folders/threads,
  addressed by note/folder IDs, message locators or an exact provider/account/chat. Labels are case-insensitive,
  shared with tg/MAX and preserve source files and mailboxes; deleted sources are hidden from listing.
- `memo notes search --tag <tag>` filters word and semantic results using shared tag eligibility,
  including labels on the note's folder.

## 0.1.2 — 07.10.2026

- cli-messaging 0.166.0, matching the final tg and max release pins, including protected conversation
  preparation during search and history fetch.

## 0.1.1 — 07.10.2026

- cli-messaging 0.164.0, matching tg and max source: person context now finds private dialogs with no
  recorded members, restoring the last message each way and direct messages in existing Telegram stores.

- The release workflow can dry-run a version already on npm, so packaging can be checked between
  releases. Publishing still refuses an existing version.

## 0.1.0 — 06.10.2026

- The `memo` command, with `--version` and `--help`.
- `memo notes about <name>` (was `memo notes <name>`): notes about a person, notes that link them, and weak plain-name mentions, from
  Markdown folders given with `--folder` or `notes.folders` in the config.
- `memo mail import`: a Gmail account's All Mail into the shared message store through Himalaya, read only;
  Gmail thread and message ids, resumable with `--max`, and deletions at the source drop the stored text.
- `memo note`: the note about a person, kept per person of the shared store. Linking identities is
  `tg|max contacts link`, not a memo command.
- `memo notes import`: Markdown and text notes into the shared store as provider `notes`; edits kept as
  revisions, deleted notes lose their text. `memo notes search <text>`: notes by their words, with the
  people they link and the known people whose full name they mention (a guess).
- `notes.ignore` in the config and `--ignore`: files, folders or globs never read or stored.
- `memo import`: notes and mail in one run, incremental — notes keep a manifest of size, change time and
  content hash in the store, so unchanged files are not read and identical ones not saved. A lock stops two
  runs at once; a failing source does not stop the others.
- `memo auto on [--every 5m] | off | status`: a systemd user timer for `memo import`. The config's
  `auto: { enabled, every }` is the source; the timer follows a hand edit at its next run.
- `memo context <messenger>:<person>`: one answer about a person — cli-messaging's person context across
  every linked identity (mail included), the note about them and the notes naming them, with what was not
  read and why. Needs cli-messaging 0.150.0, which tg and max pin.
- Notes are embedded for search by meaning: `memo import` and `memo notes import` build each changed folder
  and embed new chunks with the local e5-small model, at most 600 a run, resuming next run; `--no-embed` and
  `notes.embed: false` skip it. `memo notes search` ranks by meaning and words together (`by` on each hit) and
  falls back to words when the model is missing.
- cli-messaging 0.153.0, as tg and max pin: a long note or mail is embedded in overlapping pieces, whole.
