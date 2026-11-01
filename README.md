<p align="center">
  <img src="https://raw.githubusercontent.com/WireCatLabs/cli-memo/main/docs/images/social-preview.png" alt="Local knowledge for your AI agents" width="100%">
</p>

<h1 align="center">memo</h1>

<p align="center">
  <strong>Local knowledge for your AI agents.</strong><br>
  Your notes, documents, mail and messages in one local store — linked to people, tagged, and searchable
  with a reference to every source.
</p>

<p align="center">
  <a href="https://github.com/WireCatLabs/cli-memo/tree/main/docs">Docs</a> ·
  <a href="#what-can-you-do">Examples</a> ·
  <a href="https://wirecat.dev">WireCat</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@wirecat/cli-memo"><img alt="npm" src="https://img.shields.io/npm/v/@wirecat/cli-memo"></a>
  <a href="https://github.com/WireCatLabs/cli-memo/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/npm/l/@wirecat/cli-memo"></a>
  <img alt="Node" src="https://img.shields.io/node/v/@wirecat/cli-memo">
</p>

`memo` is a command-line tool. It imports a folder of notes such as an Obsidian vault, the documents in
it, and your mail; it reads the messages that [tg-cli](https://github.com/WireCatLabs/tg-cli) and
[max-cli](https://github.com/WireCatLabs/max-cli) keep. Then you, or your AI agent, ask: what do I know
about this person, where did we discuss this, what did I promise. Every answer points back to its source.

**Example** — search two invented notes in a notes folder:

```text
$ memo search notes budget Friday
Searched by words only: e5-small is not downloaded — install it with a WireCat CLI that has `models download` (tg, max or wa); they share the model folder

Projects/Harbour budget.md
  Review the Harbour budget by Friday.
people/Alice Example.md
  Asked for the revised budget by Friday.
```

Each hit names its file and shows a matching excerpt. The diagnostic line goes to stderr: the local model
is missing, so this search used words only. `--json` returns structured results for an agent or script.

## Quick start

You need Node.js 22.16+ or 24+ (not 23). memo is tested on Linux; macOS and Windows are not tested yet.

```sh
npm install -g @wirecat/cli-memo
memo skill install --for all      # puts memo's skill where your agents read it
memo folders add /path/to/notes   # your notes folder; Obsidian format by default
memo sync --only notes                # reads the notes, their links and tags; run again after edits
memo search notes "budget"
```

A global install does not install the agent skill; run `memo skill install --for all` above.
npm 11.17 and later warn about install scripts not covered by `allowScripts`; with npm 11 the scripts still run.
npm 12 blocks them instead. Run the `npm install -g --allow-scripts=…` command npm prints under the warning;
it allows only the packages it names, once. On Windows, open a new terminal if `memo` is not found.

That is all notes need. Then add more context:

- **Messages:** install [tg-cli](https://github.com/WireCatLabs/tg-cli) or
  [max-cli](https://github.com/WireCatLabs/max-cli); memo reads the same local store.
- **Search by meaning:** needs a local model of about 135 MB, downloaded once with: `memo models download e5-small`. Without it, memo searches
  by words.
- **Mail:** install [mail](https://github.com/WireCatLabs/mail-cli), run `mail <profile> session start --address <address>`
  and `mail <profile> sync`; memo then searches that mail (`memo search mail 'invoice'`).
- **Stay current:** `memo jobs start` runs `memo sync` every five minutes (Linux, systemd).
- **Your agent:** `memo skill install --for all` puts memo's skill where Claude Code, Codex and Gemini CLI read
  it; `memo skill show` prints it.

Or ask your agent: "Help me install memo with `npm install -g @wirecat/cli-memo` and
`memo skill install --for all`, read `memo --help`, then help me connect a notes folder I choose."

More: [installation](https://github.com/WireCatLabs/cli-memo/blob/main/docs/installation.md) ·
[install memo on wirecat.dev](https://wirecat.dev/en/docs/memo/installation)

## What can you do?

**"What do I need to know about Alice before the call?"**

```sh
memo context telegram:"Alice Example" --json
```

Every identity linked to her, the last message each way, chats in common, linked mail, the notes about
her and the open tasks — each with a link to its source.

**"Where did we discuss the Harbour budget?"**

```sh
memo search all 'harbour budget' --json
```

Messages, imported mail and notes, ranked together. When you know the kind, `search notes`,
`search mail` and `search messages` read every field.

**"What did I promise people this week?"**

```sh
memo answers create 'What did I promise this week?' 'promised OR "by Friday"' --all --json
```

An evidence bundle for your agent: the matching sources with their references, what was searched, and
the instruction to cite them. Your agent writes the answer; memo calls a model only when you ask it to.

More: [search](https://github.com/WireCatLabs/cli-memo/blob/main/docs/search.md) ·
[ask for the context you need](https://wirecat.dev/en/docs/memo/people#everything-about-a-person)

## Built for AI agents

- **Any agent with a terminal** — Claude Code, Codex, Gemini CLI and others run `memo` commands; `--json`
  gives them structured output.
- **Evidence, not guesses** — `memo answers create` hands over sources with references, and says what it could not
  search.
- **MCP** — `memo mcp serve` lets MCP apps such as Claude Desktop or Cursor read your messages, mail and notes, and
  propose memories, directly recorded facts and outbound actions. Project proposals can also be decided
  by the agent when allowed; you can require owner decisions instead. Apps on the web or phone use
  [authenticated HTTP MCP](docs/remote.md) through your HTTPS tunnel, with the same saved permissions.

More: [connect your AI agent](https://wirecat.dev/en/docs/agents) ·
[memories and facts](https://github.com/WireCatLabs/cli-memo/blob/main/docs/memories.md) · [the MCP server](https://github.com/WireCatLabs/cli-memo/blob/main/docs/mcp.md)

## Why memo?

1. **Local first.** Everything lives in a local store; search by meaning uses a local model.
2. **Every answer has a source.** Hits carry a reference you or your agent can open: a note, a file
   page, an email, a message.
3. **Links, not guesses.** Notes link to people and records; identities are never merged because a name
   matches.
4. **Imports leave your sources untouched.** Separate [Gmail cleanup commands](docs/mail.md#clean-up-gmail)
   move selected mail to Trash or restore it only with `--yes`. Tags and your own notes live in
   the store.
5. **Review and delegation are recorded.** Memories and outbound actions an agent suggests wait for
   your confirmation. Project decisions can be delegated or left to the owner. Memo never sends anything.

**Status:** early. Context, notes and their links, document import, Gmail and IMAP imports, tasks,
manual relationships, evidence bundles and local reminders work. A task in a project cannot have a reminder yet.

More: [security](https://github.com/WireCatLabs/cli-memo/blob/main/docs/security.md) ·
[security on wirecat.dev](https://wirecat.dev/en/docs/memo/security)

## What it reads

- **Folders of notes:** Obsidian or plain Markdown, with links, aliases and tags.
- **Documents in them:** TXT, CSV/TSV, text-layer PDF, DOCX, XLSX, ODT/ODS, PPTX and EPUB, with the page,
  row or cell each passage came from.
- **Mail:** Gmail or another IMAP account, synced by the [mail](https://github.com/WireCatLabs/mail-cli) CLI, text and headers only. The older Himalaya import still reads attachments and will be removed in a later version.
- **Messages:** the tg, max and wa store, with the people linked across messengers and mail.

You add your own notes about messages, people and projects, tags, tasks and reminders, organizations and
projects.

More: [notes](https://github.com/WireCatLabs/cli-memo/blob/main/docs/notes.md) ·
[files memo can read](https://wirecat.dev/en/docs/memo/notes#files-memo-can-read)

## Commands by task

| Task | Commands |
| --- | --- |
| Connect notes folders | `memo folders add` · `folders update` · `folders list` |
| Sync what changed | `memo sync` · `sync --only notes` · `sync --only mail` · `jobs start` / `stop` / `status` |
| Read notes | `memo notes list` · `notes show` · `notes links show` (the note files about a person) |
| Write your own notes | `memo notes add` · `notes edit` · `notes remove` · `notes export` |
| Search | `memo search all` · `search notes` · `search mail` · `search messages` |
| Hand evidence to an agent | `memo answers create` |
| Know a person | `memo context` |
| Prepare and review archived meetings | `memo meetings prepare` · `search meetings` · `meetings passage` · `meetings actions add` |
| Organizations and projects | `memo organizations add` / `list` / `context` · `projects add` / `list` / `context` · `projects key-documents add` / `remove` / `list` · `projects meetings list` / `link` |
| Project and topic aliases | `memo vocabulary list` / `show` / `check` / `inspect` · `vocabulary aliases add` / `remove` · `vocabulary create` |
| Relationships | `memo relationships add` / `list` / `remove` / `confirm` / `suggest` |
| Labels | `memo tags add` · `tags remove` · `tags list` |
| Open work | `memo tasks add` · `tasks list` · `tasks counts` · `tasks agenda` · `tasks show` · `tasks update` · `tasks move` · `tasks assign` · `tasks history` · `tasks close` · `stats tasks show` · `people list` |
| Task dependencies | `memo tasks link` / `unlink` / `links` · `tasks status` · `tasks list project:HRB ready:true` |
| Reminders | `memo reminders add` / `list` / `poll` / `ack` / `update` / `cancel` |
| Agents | `memo memories …` · `facts …` · `actions …` · `agents list` · `memo mcp serve` |

Every command takes `--help`; most take `--json`. `memo guide` lists scenarios — the commands for a common task, in
order — and `memo guide person-brief` gathers one person across every WireCat tool.

More: [technical docs](#technical-docs) · [memo on wirecat.dev](https://wirecat.dev/en/docs/memo)

## Notes from files, and notes you write

**From a folder.** `memo folders add` gives a folder an id that the store uses; its path is only where it is
on this computer, so the same folder on another computer is attached with `memo folders update <id> <path>`.
`memo sync --only notes` stores each file as a note named by its path. An edited file keeps its old text as a
revision; a moved file keeps its id, links and tags; a deleted file loses its text on the next import. The
`obsidian` format (the default) reads `[[Note|label]]` links, aliases, `tags:` and `#tags`; `markdown` reads
`[label](path.md)` links and `tags:`. A `[[Kai Sample]]` link becomes a link to a person once someone by that
name is in the store. Hidden folders such as `.obsidian` are skipped.

**Written in memo.** A note you write is the store's, not a file's, and is about whatever `--subject` names: a
person, a message, a chat, a project, a task, another note.

```sh
memo notes add 'Prefers mornings' --subject telegram:'Alice Example'
memo notes edit NOTE_ID --revision 1 --text 'Prefers early mornings'
memo notes export --output-dir /path/to/vault/memo --format obsidian
```

An edit names the revision it changes, so an edit made meanwhile is never lost. `export` writes your notes
as files that import then skips, and never overwrites a file you edited.

More: [notes](https://github.com/WireCatLabs/cli-memo/blob/main/docs/notes.md) ·
[add your notes](https://wirecat.dev/en/docs/memo/notes#add-a-folder) ·
[create your own notes](https://wirecat.dev/en/docs/memo/notes#write-your-own-notes)

## Search and evidence

Notes are searched by words and word stems in the query language messages use — phrases, `AND`/`OR`/`NOT`,
`tag:`, `date:` — and by meaning once the local model is downloaded (`memo models download e5-small`); both are ranked together. `search all`
reads messages, imported mail, notes and the calendar events gcal stored together, and nothing else. When you know the kind, its own search
reads every field: `search mail` takes `from:`, `to:`, `cc:`, `bcc:`, `subject:` and `mailbox:`.

```sh
memo search notes '"budget review" AND NOT cancelled' --limit 20
memo search mail 'from:alice@example.com subject:budget'
memo notes show note:NOTE_ID --json
```

`memo answers create` needs a scope (`--all`, or `--source`, such as `--source telegram:1,notes`) and returns evidence by default. To
call a model instead, set `MEMO_MODELS_ANALYSIS_PROVIDER` and `MEMO_MODELS_ANALYSIS_MODEL` and pass
`--analyze`; a remote model also needs `--allow-remote`.

More: [search](https://github.com/WireCatLabs/cli-memo/blob/main/docs/search.md) ·
[searching on wirecat.dev](https://wirecat.dev/en/docs/memo/search)

## People, organizations and projects

`memo context` answers from the shared store: every identity linked to the person, the last message each
way, recent messages, chats in common, linked mail, their calendar events, the notes about them and the open tasks. Who is who is
decided in messaging — `tg personal contacts link <person> email:<address>` — and a same name is never enough.
`memo notes links add telegram:"Alice Example" /path/to/notes/people/Alice.md` names the note that is about her.

Organizations and projects are yours, not one account's. Relationships (`member-of`, `related-to`) are
manual statements; `relationships scan` only proposes shared-domain links for you to confirm. A project
can hold meetings (`projects meetings link`), and `memo vocabulary` gives projects and topics reviewed
aliases, so one name always means one project.

Before adding a new tag or topic, run `memo vocabulary check <name> --json`. Reuse a
canonical label or add an alias if it means the same thing. For a deliberately distinct label,
run `memo vocabulary create <name> --fingerprint <creation_fingerprint> --json`; select `--kind topic`
on both commands when creating a topic. The owner accepts this review; MCP has `vocabulary_check`
but no tool that creates a label. An intervening label or alias change requires a fresh review.
`memo vocabulary check --json` finds likely synonyms already in the catalog. Its `complete`
flag reports whether the bounded comparison finished; candidates require review and are never
merged automatically. Use `--kind tag`, `--kind topic` or `--kind project` to narrow the review.

```sh
memo organizations add 'Synthetic Studio' --kind company
memo projects add 'Synthetic Harbour' --organization organization:ORGANIZATION_ID
memo projects key-documents add PROJECT_ID document:DOCUMENT_ID --reason 'read this first'
memo projects context PROJECT_ID --json   # start project work here: key documents come first
```

More: [people and projects](https://github.com/WireCatLabs/cli-memo/blob/main/docs/people.md) ·
[people on wirecat.dev](https://wirecat.dev/en/docs/memo/people)

## Mail

The separate [mail](https://github.com/WireCatLabs/mail-cli) CLI brings mail in: `mail <profile> session start
--address me@example.com`, then `mail <profile> sync`, fill the shared store, and memo searches and shows that mail.
`mail` keeps text and headers, not attachments, and only reads your mailbox.

```sh
memo search mail 'mailbox:important budget'
memo messages show <ref>
```

Memo can still import mail itself through [Himalaya](https://github.com/pimalaya/himalaya). That older path works for
now and will be removed in a later version. It reads attachments' text, and `memo sync` and the timer read every
account in `mail.accounts` (`--source email:<name>` narrows it). `memo mail inspect`, `rules`, `delete` and `restore`
work on those accounts. Set `"import": false` on an account that `mail` now syncs: memo's sync skips it and keeps
its rules, delete, restore and inspect commands. To see how far a mailbox synced by `mail` is, run `mail <profile> status`.

More: [mail](https://github.com/WireCatLabs/cli-memo/blob/main/docs/mail.md) ·
[mail on wirecat.dev](https://wirecat.dev/en/docs/memo/mail)

## Tags, tasks and reminders

Tags are your labels on a note, an email, a message, a chat, a person, an organization, a project, a task,
a meeting, or every note under a folder. They live in the store; files, Gmail labels and mailbox flags are
never changed. A task points at the message or note it came from, or is your own in a
project (`--project RES --title …`), and can be blocked by another until it is done. `memo tasks agenda`
says what needs a look today in the account you name; a notes folder is one (`--source notes`). Reminders are local:
a caller you choose polls for them, and nothing is delivered to a messenger or mailbox.

```sh
memo tags add follow-up --note note:NOTE_ID
memo tasks add 'msg:telegram/1/77/42' --type request
memo reminders add TASK_ID --at-time 2026-10-09T09:00:00+02:00 --account telegram:1
```

More: [tags](https://github.com/WireCatLabs/cli-memo/blob/main/docs/tags.md) ·
[tasks and reminders](https://github.com/WireCatLabs/cli-memo/blob/main/docs/tasks.md) ·
[tag your sources](https://wirecat.dev/en/docs/memo/tags)

## Agents and MCP

An agent with a terminal runs `memo` with `--json`. An MCP app starts `memo mcp serve` on stdin and stdout. Through it
the app can use Memo's commands, including writes, limited by the saved permissions and read lock.
It can open search references with `notes_show` and `messages_show`. Existing tool names still work:

```json
{ "mcpServers": { "memo": { "command": "memo", "args": ["mcp", "serve"] } } }
```

An agent's new memories, directly recorded facts and outbound action proposals start as `proposed`.
Permission keys limit reading, editing and decisions; writes without a saved level use `ask`, which runs over MCP
without a terminal question. Source-folder and mail-rule changes need `mcp.authority`, off by default.
Project proposals have a separate flow: by default an agent may decide them with a recorded reason, creating accepted
facts and numbered tasks or confirming a key document. Set `agent_decisions: false` to require owner
decisions on project proposals. Meeting decisions and annotation restore require explicit permissions. Memo never sends a message
or email. `memo agents list` lists each call, its result and time, without its arguments.

More: [memories and facts](https://github.com/WireCatLabs/cli-memo/blob/main/docs/memories.md) · [the MCP server](https://github.com/WireCatLabs/cli-memo/blob/main/docs/mcp.md) ·
[MCP on wirecat.dev](https://wirecat.dev/en/docs/memo/mcp)

## Keeping it current

`memo sync` brings notes and mail up to date and reads only what changed. `memo jobs start --every 5m` runs
it on a systemd user timer; `jobs status` shows the next and last run, and while timer runs fail every memo
command says so in one stderr line. A lock keeps two imports apart: a
timer run that finds a sync still running skips and exits 0. One failing source does not stop the others.

More: [keeping memo up to date](https://github.com/WireCatLabs/cli-memo/blob/main/docs/archive.md) ·
[import a folder on wirecat.dev](https://wirecat.dev/en/docs/memo/notes#add-a-folder)

## Configuration

`memo folders add` and `memo jobs start` write `~/.config/cli-memo/config.json` for you. By hand you set what
to skip and where exported notes go; `memo mail add` adds an explicit Himalaya account (the older mail import):

```json
{
  "notes": { "ignore": ["Journal/Private.md", "Archive"], "export": { "dir": "/path/to/vault/memo" } },
  "mail": { "accounts": [{ "name": "work", "address": "you@example.com" }] }
}
```

More: [configuration](https://github.com/WireCatLabs/cli-memo/blob/main/docs/configuration.md) ·
[configuration on wirecat.dev](https://wirecat.dev/en/docs/memo/configuration)

## Security

- Imports read note folders and mailboxes without changing them or marking mail as read, and `mail` only reads your mailbox. Memo never sends mail.
- Separate Gmail cleanup commands (`memo mail delete`, `memo mail restore`) move selected Gmail mail to Trash or restore it only with `--yes`; the timer never runs them.
- What memo adds — your notes, links, tags, tasks, memories — stays in the local store.
- A note or mail deleted at the source loses its text in the store on the next import; a run that finds an
  unusually large share missing deletes nothing and says so.
- Evidence reaches a model only with `--analyze`, and a remote one only with `--allow-remote`.
- Agents propose; only you confirm memories and approve actions.

More: [security](https://github.com/WireCatLabs/cli-memo/blob/main/docs/security.md) ·
[security on wirecat.dev](https://wirecat.dev/en/docs/memo/security)

## Limits

- Files up to 50 MiB; stored text up to 200,000 characters a file. Scanned PDFs, legacy `.xls` and larger
  files are reported, not read.
- Search by meaning embeds at most 600 chunks a run; the next run continues.
- `memo sync --only mail` reads 200 new messages per account a run by default (`--limit`) and keeps up to 1,000,000
  characters of a body and 200,000 of an attachment's text (`mail.max_body_chars`, `mail.max_attachment_chars`).
- Searches return at most 100 results; `tags list` shows 100 labels unless `--limit` says more.
- Tags are 1–32 letters a–z, digits or hyphens.

More: [files memo can read](https://github.com/WireCatLabs/cli-memo/blob/main/docs/notes.md#files-memo-can-read) ·
[files memo can read](https://wirecat.dev/en/docs/memo/notes#files-memo-can-read)

## When something is missing

- **Searched by words only:** the local meaning model is not downloaded. Install it through tg, max or wa;
  they share the model folder. Without it, word search still works ([search by meaning](docs/search.md)).
- **A folder is refused by import:** it has no id yet — `memo folders add <path>`.
- **A name is refused:** two people share it; use one of the ids it lists.
- **`memo answers create` asks for a scope:** add `--all`, or `--source`.
- **An empty search:** the store holds nothing that matches — not proof that it never happened. Try the
  kind's own search, looser words, or import that source first.

- **A command failed and you want to see why:** `memo runs list status:failed`, then `memo runs show <run-id>`.
  Failed runs are kept for 30 days, runs that worked for 7
  ([runs](https://github.com/WireCatLabs/cli-memo/blob/main/docs/configuration.md#record-and-keep_runs_for_days)).

More: [if something is missing](https://wirecat.dev/en/docs/memo/troubleshooting) ·
[search](https://github.com/WireCatLabs/cli-memo/blob/main/docs/search.md)

## Part of WireCat

[WireCat](https://wirecat.dev) is an open-source, local-first context layer for AI agents: tg for
Telegram, max for MAX, wa for WhatsApp, zm for archived Zoom recordings, drive for Google Drive and Docs,
and memo for your notes and mail. Their imported context is searchable locally. Start with your notes and
add the sources you need.

Questions and setup help: join the [WireCat Discord](https://discord.gg/DebENqbRrJ). Bugs go to this
repository's issues.

## Technical docs

| Page | What it covers |
| --- | --- |
| [Overview](https://github.com/WireCatLabs/cli-memo/blob/main/docs/index.md) | What memo does and how it works, in short |
| [Installation](https://github.com/WireCatLabs/cli-memo/blob/main/docs/installation.md) | Requirements, install, where files go, update |
| [Using memo](https://github.com/WireCatLabs/cli-memo/blob/main/docs/usage.md) | A normal day: import, search, context, notes, review |
| [How memo works](https://github.com/WireCatLabs/cli-memo/blob/main/docs/how-it-works.md) | The local store, imports, links, references, review |
| [Notes and folders](https://github.com/WireCatLabs/cli-memo/blob/main/docs/notes.md) | Markdown and Obsidian folders, documents, your own notes, export |
| [Tags](https://github.com/WireCatLabs/cli-memo/blob/main/docs/tags.md) | Labels on any source |
| [Search](https://github.com/WireCatLabs/cli-memo/blob/main/docs/search.md) | Search words, `search all`, `answers create` |
| [People and projects](https://github.com/WireCatLabs/cli-memo/blob/main/docs/people.md) | Person context, linking, organizations, relationships |
| [Mail](https://github.com/WireCatLabs/cli-memo/blob/main/docs/mail.md) | Bring mail in with `mail`, search it in memo, and the older Himalaya import |
| [Tasks and reminders](https://github.com/WireCatLabs/cli-memo/blob/main/docs/tasks.md) | Tasks, dependencies and local reminders |
| [Memories and facts](https://github.com/WireCatLabs/cli-memo/blob/main/docs/memories.md) | What agents and you record, and proposed actions |
| [The MCP server](https://github.com/WireCatLabs/cli-memo/blob/main/docs/mcp.md) | Apps without a terminal, the agent log |
| [Remote connection](docs/remote.md) | Browser and phone apps, access-code login and revocation |
| [Keeping memo up to date](https://github.com/WireCatLabs/cli-memo/blob/main/docs/archive.md) | `memo sync` and the timer |
| [Recipes](https://github.com/WireCatLabs/cli-memo/blob/main/docs/recipes.md) | Whole tasks to hand to your agent |
| [All commands](https://github.com/WireCatLabs/cli-memo/blob/main/docs/commands.md) | Every command and option, generated |
| [Configuration](https://github.com/WireCatLabs/cli-memo/blob/main/docs/configuration.md) | Every setting and variable |
| [Troubleshooting](https://github.com/WireCatLabs/cli-memo/blob/main/docs/troubleshooting.md) | What the screen says, and what to do |
| [Security](https://github.com/WireCatLabs/cli-memo/blob/main/docs/security.md) | What is read, written and sent |
| [Compared with other tools](https://github.com/WireCatLabs/cli-memo/blob/main/docs/compare.md) · [web](https://wirecat.dev/en/docs/memo/compare) | How does memo compare with Hindsight, mem0, Graphiti, Cognee, basic-memory, Obsidian and Screenpipe? |
| [Changelog](https://github.com/WireCatLabs/cli-memo/blob/main/CHANGELOG.md) | Every release |

The reader guides live on [wirecat.dev](https://wirecat.dev/en/docs/memo).

## Development

```sh
pnpm install
pnpm lint && pnpm typecheck && pnpm test
```

Pull requests are welcome; examples and tests use invented people only.

More: [installation](https://github.com/WireCatLabs/cli-memo/blob/main/docs/installation.md#development)

## License

[Apache License 2.0](https://github.com/WireCatLabs/cli-memo/blob/main/LICENSE).
