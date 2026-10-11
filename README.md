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

<!-- Demo slot: a 30–45 s recording of an agent answering "What did I promise Alice?" from memo, with
     sources. Add it here once recorded; until then the example below shows the real output. -->

**Example** — two invented notes in a vault, `people/Alice Example.md` and `Projects/Harbour budget.md`:

```text
$ memo search notes budget Friday
Projects/Harbour budget.md
  # Harbour budget
people/Alice Example.md
  Asked for the revised budget by Friday. See [[Harbour budget]].

Linked from these notes
  Alice Example  document:2  (1)
  Bob Sample  (nobody by that name yet)  (1)
  Harbour budget  document:1  (1)
```

Each hit names its file, and `[[links]]` become links to notes and people. `Bob Sample` becomes a link to
a person once someone by that name is in the store.

## Quick start

You need Node.js 22.16 or newer.

```sh
npm install -g @wirecat/cli-memo
memo folders add /path/to/notes   # your notes folder; Obsidian format by default
memo notes import                 # reads the notes, their links and tags; run again after edits
memo search notes "budget"
```

That is all notes need. Then add more context:

- **Messages:** install [tg-cli](https://github.com/WireCatLabs/tg-cli) or
  [max-cli](https://github.com/WireCatLabs/max-cli); memo reads the same local store.
- **Search by meaning:** `tg models text download e5-small` downloads the local model once.
- **Mail:** set up [Himalaya](https://github.com/pimalaya/himalaya), then `memo mail import`.
- **Stay current:** `memo auto on` runs `memo import` every five minutes (Linux, systemd).

Or ask your agent: "Help me install memo with `npm install -g @wirecat/cli-memo`, read `memo --help`, then
help me connect a notes folder I choose."

More: [installation](https://github.com/WireCatLabs/cli-memo/blob/main/docs/installation.md) ·
[install memo on wirecat.dev](https://wirecat.dev/en/docs/memo#install-memo)

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
memo ask 'What did I promise this week?' --query 'promised OR "by Friday"' --all --json
```

An evidence bundle for your agent: the matching sources with their references, what was searched, and
the instruction to cite them. Your agent writes the answer; memo calls a model only when you ask it to.

More: [search and evidence](https://github.com/WireCatLabs/cli-memo/blob/main/docs/search.md) ·
[ask for the context you need](https://wirecat.dev/en/docs/memo#ask-for-the-context-you-need)

## Built for AI agents

- **Any agent with a terminal** — Claude Code, Codex, Gemini CLI and others run `memo` commands; `--json`
  gives them structured output.
- **Evidence, not guesses** — `memo ask` hands over sources with references, and says what it could not
  search.
- **MCP** — `memo mcp` lets MCP apps such as Claude Desktop or Cursor propose memories and actions and
  read the agent log; they wait for you to confirm.

More: [connect your AI agent](https://wirecat.dev/en/docs/agents) ·
[memories, proposed actions and MCP](https://github.com/WireCatLabs/cli-memo/blob/main/docs/mcp.md)

## Why memo?

1. **Local first.** Everything lives in a local store; search by meaning uses a local model.
2. **Every answer has a source.** Hits carry a reference you or your agent can open: a note, a file
   page, an email, a message.
3. **Links, not guesses.** Notes link to people and records; identities are never merged because a name
   matches.
4. **Your sources stay untouched.** Folders and mailboxes are read-only; tags and your own notes live in
   the store.
5. **Agents propose, you decide.** Memories and actions an agent suggests wait for your confirmation;
   nothing is ever sent.

**Status:** early. Context, notes and their links, document import, Gmail and IMAP imports, tasks,
manual relationships, evidence bundles and local reminders work.

More: [security](https://github.com/WireCatLabs/cli-memo/blob/main/docs/security.md) ·
[security on wirecat.dev](https://wirecat.dev/en/docs/security)

## What it reads

- **Folders of notes:** Obsidian or plain Markdown, with links, aliases and tags.
- **Documents in them:** TXT, CSV/TSV, text-layer PDF, DOCX, XLSX, ODT/ODS, PPTX and EPUB, with the page,
  row or cell each passage came from.
- **Mail:** Gmail or another IMAP account, through Himalaya, attachments included.
- **Messages:** the tg and max store, with the people linked across messengers and mail.

You add your own notes about messages, people and projects, tags, tasks and reminders, organizations and
projects.

More: [notes](https://github.com/WireCatLabs/cli-memo/blob/main/docs/notes.md) ·
[files memo can read](https://wirecat.dev/en/docs/memo#files-memo-can-read)

## Commands by task

| Task | Commands |
| --- | --- |
| Connect notes folders | `memo folders add` · `folders attach` · `folders list` |
| Import what changed | `memo import` · `notes import` · `mail import` · `auto on` / `off` / `status` |
| Read notes | `memo notes list` · `notes show` · `notes about` · `memo note` (the note about a person) |
| Write your own notes | `memo notes add` · `notes edit` · `notes remove` · `notes export` |
| Search | `memo search all` · `search notes` · `search mail` · `search messages` |
| Hand evidence to an agent | `memo ask` |
| Know a person | `memo context` |
| Organizations and projects | `memo organizations add` / `list` / `context` · `projects add` / `list` / `context` |
| Relationships | `memo relationships add` / `list` / `remove` / `confirm` / `suggest` |
| Labels | `memo tags add` · `tags remove` · `tags list` |
| Open work | `memo tasks add` · `tasks list` · `tasks assign` · `tasks close` |
| Reminders | `memo reminders schedule` / `list` / `poll` / `ack` / `snooze` / `cancel` |
| Agents | `memo memories …` · `actions …` · `agents log` · `memo mcp` |

Every command takes `--help`; most take `--json`.

More: [technical docs](#technical-docs) · [notes and files on wirecat.dev](https://wirecat.dev/en/docs/memo)

## Notes from files, and notes you write

**From a folder.** `memo folders add` gives a folder an id that the store uses; its path is only where it is
on this computer, so the same folder on another computer is attached with `memo folders attach <id> <path>`.
`memo notes import` stores each file as a note named by its path. An edited file keeps its old text as a
revision; a moved file keeps its id, links and tags; a deleted file loses its text on the next import. The
`obsidian` format (the default) reads `[[Note|label]]` links, aliases, `tags:` and `#tags`; `markdown` reads
`[label](path.md)` links and `tags:`. A `[[Kai Sample]]` link becomes a link to a person once someone by that
name is in the store. Hidden folders such as `.obsidian` are skipped.

**Written in memo.** A note you write is the store's, not a file's, and is about whatever `--about` names: a
person, a message, a chat, a project, a task, another note.

```sh
memo notes add 'Prefers mornings' --about telegram:'Alice Example'
memo notes edit NOTE_ID --revision 1 --text 'Prefers early mornings'
memo notes export --to /path/to/vault/memo --format obsidian
```

An edit names the revision it changes, so an edit made meanwhile is never lost. `export` writes your notes
as files that import then skips, and never overwrites a file you edited.

More: [notes](https://github.com/WireCatLabs/cli-memo/blob/main/docs/notes.md) ·
[add your notes](https://wirecat.dev/en/docs/memo#add-your-notes) ·
[create your own notes](https://wirecat.dev/en/docs/memo#create-your-own-notes)

## Search and evidence

Notes are searched by words and word stems in the query language messages use — phrases, `AND`/`OR`/`NOT`,
`tag:`, `date:` — and by meaning once the local model is downloaded; both are ranked together. `search all`
reads messages, imported mail and notes together, and nothing else. When you know the kind, its own search
reads every field: `search mail` takes `from:`, `to:`, `cc:`, `bcc:`, `subject:` and `mailbox:`.

```sh
memo search notes '"budget review" AND NOT cancelled' --limit 20
memo search mail 'from:alice@example.com subject:budget'
memo notes show note:NOTE_ID --json
```

`memo ask` needs a scope (`--all`, or `--provider` with `--account`) and returns evidence by default. To
call a model instead, set `MEMO_MODELS_ANALYSIS_PROVIDER` and `MEMO_MODELS_ANALYSIS_MODEL` and pass
`--model`; a remote model also needs `--allow-remote`.

More: [search and evidence](https://github.com/WireCatLabs/cli-memo/blob/main/docs/search.md) ·
[searching on wirecat.dev](https://wirecat.dev/en/docs/search)

## People, organizations and projects

`memo context` answers from the shared store: every identity linked to the person, the last message each
way, recent messages, chats in common, linked mail, the notes about them and the open tasks. Who is who is
decided in messaging — `tg contacts link <person> email:<address>` — and a same name is never enough.
`memo note telegram:"Alice Example" /path/to/notes/people/Alice.md` names the note that is about her.

Organizations and projects are yours, not one account's. Relationships (`member-of`, `related-to`) are
manual statements; `relationships suggest` only proposes shared-domain links for you to confirm.

```sh
memo organizations add 'Synthetic Studio' --kind company
memo projects add 'Synthetic Harbour' --organization organization:ORGANIZATION_ID
memo projects context PROJECT_ID --json
```

More: [people, organizations and projects](https://github.com/WireCatLabs/cli-memo/blob/main/docs/people.md) ·
[people on wirecat.dev](https://wirecat.dev/en/docs/people)

## Mail

memo reads mail through [Himalaya](https://github.com/pimalaya/himalaya), a command-line mail client you
set up first. Gmail is the default; another IMAP provider uses `mode: "imap"` with the folders to read. The
mailbox is opened read-only, `--max` (default 200) bounds the new mail per run and the next run continues.
Gmail labels become mailboxes, attachments' text is searched with its email, and mail deleted at the
source loses its text in the store.

```sh
memo mail import --since 2026-09-01
memo search mail 'mailbox:important budget'
```

More: [mail](https://github.com/WireCatLabs/cli-memo/blob/main/docs/mail.md) ·
[email on wirecat.dev](https://wirecat.dev/en/docs/email)

## Tags, tasks and reminders

Tags are your labels on a note, an email, a message, a chat, a person, an organization, a project, a task,
a meeting, or every note under a folder. They live in the store; files, Gmail labels and mailbox flags are
never changed. A task points at the message or note it came from. Reminders are local: a caller you choose
polls for them, and nothing is delivered to a messenger or mailbox.

```sh
memo tags add follow-up --note note:NOTE_ID
memo tasks add 'msg:telegram/1/77/42' --type request
memo reminders schedule TASK_ID --at 2026-10-09T09:00:00+02:00 --provider telegram --account 1
```

More: [tags](https://github.com/WireCatLabs/cli-memo/blob/main/docs/tags.md) ·
[open work and reminders](https://github.com/WireCatLabs/cli-memo/blob/main/docs/tasks.md) ·
[tag your sources](https://wirecat.dev/en/docs/memo#tag-your-sources)

## Agents and MCP

An agent with a terminal runs `memo` with `--json`. An MCP app starts `memo mcp`, which serves memories,
proposed actions and the agent log on stdin and stdout:

```json
{ "mcpServers": { "memo": { "command": "memo", "args": ["mcp"] } } }
```

An agent's memories and proposals wait as `proposed`; it cannot confirm, approve or reject. Approving an
action makes it your task; nothing is ever sent. `memo agents log` lists every call — the agent, the tool,
the outcome and the times, never the arguments. Search and context are not served over MCP.

More: [memories, proposed actions and MCP](https://github.com/WireCatLabs/cli-memo/blob/main/docs/mcp.md) ·
[MCP on wirecat.dev](https://wirecat.dev/en/docs/mcp)

## Keeping it current

`memo import` brings notes and mail up to date and reads only what changed. `memo auto on --every 5m` runs
it on a systemd user timer; `auto status` shows the next and last run. A lock keeps two imports apart, and
one failing source does not stop the others.

More: [keeping the store current](https://github.com/WireCatLabs/cli-memo/blob/main/docs/archive.md) ·
[import a folder on wirecat.dev](https://wirecat.dev/en/docs/memo#import-the-folder-you-choose)

## Configuration

`memo folders add` and `memo auto on` write `~/.config/cli-memo/config.json` for you. By hand you set what
to skip, mail accounts and where exported notes go:

```json
{
  "notes": { "ignore": ["Journal/Private.md", "Archive"], "export": { "dir": "/path/to/vault/memo" } },
  "mail": { "accounts": [{ "name": "gmail", "address": "you@example.com" }] }
}
```

More: [configuration](https://github.com/WireCatLabs/cli-memo/blob/main/docs/configuration.md) ·
[configuration on wirecat.dev](https://wirecat.dev/en/docs/configuration)

## Security

- Note folders and mailboxes are read-only; nothing is sent, moved or marked read.
- What memo adds — your notes, links, tags, tasks, memories — stays in the local store.
- A note or mail deleted at the source loses its text in the store on the next import; a run that finds an
  unusually large share missing deletes nothing and says so.
- Evidence reaches a model only with `--model`, and a remote one only with `--allow-remote`.
- Agents propose; only you confirm memories and approve actions.

More: [security](https://github.com/WireCatLabs/cli-memo/blob/main/docs/security.md) ·
[security on wirecat.dev](https://wirecat.dev/en/docs/security)

## Limits

- Files up to 50 MiB; stored text up to 200,000 characters a file. Scanned PDFs and legacy DOC/XLS are
  reported, not read.
- Search by meaning embeds at most 600 chunks a run; the next run continues.
- `memo mail import` reads 200 new messages a run by default (`--max`).
- Searches return at most 100 results; `tags list` shows 100 labels unless `--limit` says more.
- Tags are 1–32 letters a–z, digits or hyphens.

More: [documents in a folder](https://github.com/WireCatLabs/cli-memo/blob/main/docs/notes.md#documents-in-a-folder) ·
[files memo can read](https://wirecat.dev/en/docs/memo#files-memo-can-read)

## When something is missing

- **Searched by words only:** the meaning model is not downloaded — `tg models text download e5-small`.
- **A folder is refused by import:** it has no id yet — `memo folders add <path>`.
- **A name is refused:** two people share it; use one of the ids it lists.
- **`memo ask` asks for a scope:** add `--all`, or `--provider` with `--account`.
- **An empty search:** the store holds nothing that matches — not proof that it never happened. Try the
  kind's own search, looser words, or import that source first.

More: [if something is missing](https://wirecat.dev/en/docs/memo#if-something-is-missing) ·
[search and evidence](https://github.com/WireCatLabs/cli-memo/blob/main/docs/search.md)

## Part of WireCat

[WireCat](https://wirecat.dev) is an open-source, local-first context layer for AI agents: tg for
Telegram, max for MAX, memo for your notes and mail, all in one local store. Start with your notes. Add
more context when you need it. Your context. Any agent.

## Technical docs

| Page | What it covers |
| --- | --- |
| [Installation](https://github.com/WireCatLabs/cli-memo/blob/main/docs/installation.md) | Requirements, install, where files go, update |
| [Notes](https://github.com/WireCatLabs/cli-memo/blob/main/docs/notes.md) | Folders, formats, documents, your own notes, export |
| [Search and evidence](https://github.com/WireCatLabs/cli-memo/blob/main/docs/search.md) | Query language, `search all`, `ask` |
| [People, organizations and projects](https://github.com/WireCatLabs/cli-memo/blob/main/docs/people.md) | Person context, linking, relationships |
| [Mail](https://github.com/WireCatLabs/cli-memo/blob/main/docs/mail.md) | Gmail and IMAP through Himalaya |
| [Tags](https://github.com/WireCatLabs/cli-memo/blob/main/docs/tags.md) | Labels on any source |
| [Open work and reminders](https://github.com/WireCatLabs/cli-memo/blob/main/docs/tasks.md) | Tasks and local reminders |
| [Memories, proposed actions and MCP](https://github.com/WireCatLabs/cli-memo/blob/main/docs/mcp.md) | What agents propose, the agent log |
| [Keeping the store current](https://github.com/WireCatLabs/cli-memo/blob/main/docs/archive.md) | `memo import` and the timer |
| [Configuration](https://github.com/WireCatLabs/cli-memo/blob/main/docs/configuration.md) | Every setting and variable |
| [Security](https://github.com/WireCatLabs/cli-memo/blob/main/docs/security.md) | What is read, written and sent |
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
