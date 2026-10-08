# Changelog

Notable changes to `@leemour/cli-memo`, one section per version, newest first. Versions follow
[semantic versioning](https://semver.org/); before `1.0.0` a minor release may change the API.

## Unreleased

## 0.3.0 — 09.10.2026

### Changed — may break scripts

- Search commands now live under `search all|messages|mail|notes`, using the shared services and ranking.
  `search all` returns typed source hits and a separate `tasks` list for linked open work. The old
  `memo search <query>` and `memo notes search` paths are removed without aliases. Use `search notes --type`
  instead of `notes search --source`; `--all` and `--note-text` are no longer needed.

- Pin shared SDK 0.209.0 alongside Telegram/MAX. Legacy copied note task sources move to native note IDs
  without changing task IDs, account scope or closed states. Upgrade the coordinated tools together
  before opening the shared owner store.

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
