<p align="center">
  <img src="https://raw.githubusercontent.com/WireCatLabs/wirecat/main/docs/images/social-preview.png" alt="Local knowledge for your AI agents" width="100%">
</p>

<h1 align="center">wcat</h1>

<p align="center">
  <strong>Local knowledge for your AI agents.</strong><br>
  Your notes, documents, mail and messages in one local store — linked to people, tagged, and searchable
  with a reference to every source.
</p>

<p align="center">
  <a href="https://wirecat.dev/en/docs/wcat">Docs</a> ·
  <a href="https://github.com/WireCatLabs/wirecat/blob/main/docs/installation.md">Install</a> ·
  <a href="https://github.com/WireCatLabs/wirecat/blob/main/docs/usage.md">Usage</a> ·
  <a href="https://discord.gg/DebENqbRrJ">Discord</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@wirecat/wirecat"><img alt="npm" src="https://img.shields.io/npm/v/@wirecat/wirecat"></a>
  <a href="https://github.com/WireCatLabs/wirecat/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/npm/l/@wirecat/wirecat"></a>
  <img alt="Node" src="https://img.shields.io/node/v/@wirecat/wirecat">
</p>

`wcat` is a command-line tool. It reads the notes and documents that [files](https://github.com/WireCatLabs/files-cli) imports from a folder such
as an Obsidian vault, the mail that [mail](https://github.com/WireCatLabs/mail-cli) syncs, and the messages that [tg-cli](https://github.com/WireCatLabs/tg-cli) and
[max-cli](https://github.com/WireCatLabs/max-cli) keep. Then you, or your AI agent, ask: what do I know
about this person, where did we discuss this, what did I promise. Every answer points back to its source.

**Example** — search two invented notes in a notes folder:

```text
$ wcat search notes budget Friday
Searched by words only: embeddinggemma is not downloaded — install it with a WireCat CLI that has `models download` (tg, max or wa); they share the model folder

Projects/Harbour budget.md
  Review the Harbour budget by Friday.
people/Alice Example.md
  Asked for the revised budget by Friday.
```

Each hit names its file and shows a matching excerpt. The diagnostic line goes to stderr: the local model
is missing, so this search used words only. `--json` returns structured results for an agent or script.

## Quick start

You need Node.js 22.16+ or 24+ (not 23). wcat is tested on Linux; macOS and Windows are not tested yet.

```sh
npm install -g @wirecat/wirecat
wcat skill install --for all      # puts wcat's skill where your agents read it
npm install -g @wirecat/files-cli  # notes and documents come from the files CLI
files folders add /path/to/notes   # your notes folder; Obsidian format when it is a vault
wcat sync                          # runs files sync, embeds stored mail, links people; run again after edits
wcat search notes "budget"
```

A global install does not install the agent skill; run `wcat skill install --for all` above.
npm 11.17 and later warn about install scripts not covered by `allowScripts`; with npm 11 the scripts still run.
npm 12 blocks them instead. Run the `npm install -g --allow-scripts=…` command npm prints under the warning;
it allows only the packages it names, once. On Windows, open a new terminal if `wcat` is not found.

That is all notes need. wcat runs `wcat-files sync` itself when the files CLI is installed. Then add more context:

- **Messages:** install [tg-cli](https://github.com/WireCatLabs/tg-cli) or
  [max-cli](https://github.com/WireCatLabs/max-cli); wcat reads the same local store.
- **Search by meaning:** needs a local model of about 220 MB, downloaded once with: `wcat models download embeddinggemma`. Without it, wcat searches
  by words.
- **Mail:** install [mail](https://github.com/WireCatLabs/mail-cli), run `mail <profile> session start --address <address>`
  and `mail <profile> sync`; wcat then searches that mail (`wcat search mail 'invoice'`).
- **Stay current:** `wcat jobs start` runs `wcat sync` every five minutes (Linux, systemd).
- **Your agent:** `wcat skill install --for all` puts wcat's skill where Claude Code, Codex and Gemini CLI read
  it; `wcat skill show` prints it.

Or ask your agent: "Help me install wcat with `npm install -g @wirecat/wirecat` and
`wcat skill install --for all`, read `wcat --help`, then help me connect a notes folder I choose with the files CLI."

More: [installation](https://github.com/WireCatLabs/wirecat/blob/main/docs/installation.md) ·
[install wcat on wirecat.dev](https://wirecat.dev/en/docs/wcat/installation)

## What can you do?

**"What do I need to know about Alice before the call?"**

```sh
wcat context telegram:"Alice Example" --json
```

Every identity linked to her, the last message each way, chats in common, linked mail, the notes about
her and the open tasks — each with a link to its source.

**"Where did we discuss the Harbour budget?"**

```sh
wcat search all 'harbour budget' --json
```

Messages, imported mail and notes, ranked together. When you know the kind, `search notes`,
`search mail` and `search messages` read every field.

**"What did I promise people this week?"**

```sh
wcat answers create 'What did I promise this week?' 'promised OR "by Friday"' --all --json
```

An evidence bundle for your agent: the matching sources with their references, what was searched, and
the instruction to cite them. Your agent writes the answer; wcat calls a model only when you ask it to.

More: [search](https://github.com/WireCatLabs/wirecat/blob/main/docs/search.md) ·
[ask for the context you need](https://wirecat.dev/en/docs/wcat/people#everything-about-a-person)

## Built for AI agents

- **Any agent with a terminal** — Claude Code, Codex, Gemini CLI and others run `wcat` commands; `--json`
  gives them structured output.
- **Evidence, not guesses** — `wcat answers create` hands over sources with references, and says what it could not
  search.
- **MCP** — `wcat mcp serve` lets MCP apps such as Claude Desktop or Cursor read your messages, mail and notes, and
  propose memories, directly recorded facts and outbound actions. Project proposals can also be decided
  by the agent when allowed; you can require owner decisions instead. Apps on the web or phone use
  [authenticated HTTP MCP](docs/remote.md) through your HTTPS tunnel, with the same saved permissions.

More: [connect your AI agent](https://wirecat.dev/en/docs/agents) ·
[memories and facts](https://github.com/WireCatLabs/wirecat/blob/main/docs/memories.md) · [the MCP server](https://github.com/WireCatLabs/wirecat/blob/main/docs/mcp.md)

## Why wcat?

1. **Local first.** Everything lives in a local store; search by meaning uses a local model.
2. **Every answer has a source.** Hits carry a reference you or your agent can open: a note, a file
   page, an email, a message.
3. **Links, not guesses.** Notes link to people and records; identities are never merged because a name
   matches.
4. **wcat leaves your sources untouched.** wcat never changes a mailbox or a notes folder; [Gmail cleanup](docs/mail.md#commands-that-moved-to-mail)
   is a command of the separate `mail` program, and notes are the files CLI's. Tags live in the store.
5. **Review and delegation are recorded.** Memories and outbound actions an agent suggests wait for
   your confirmation. Project decisions can be delegated or left to the owner. wcat never sends anything.

**Status:** early. Context, search over the notes the files CLI stores and the mail the `mail` CLI stores,
tasks, manual relationships, evidence bundles and local reminders work. A task in a project cannot have a reminder yet.

More: [security](https://github.com/WireCatLabs/wirecat/blob/main/docs/security.md) ·
[security on wirecat.dev](https://wirecat.dev/en/docs/wcat/security)

## What it reads

- **Notes and documents:** what the [files](https://github.com/WireCatLabs/files-cli) CLI stored from your folders, with their links and tags.
- **Mail:** Gmail or another IMAP account, synced by the [mail](https://github.com/WireCatLabs/mail-cli) CLI, text and headers only.
- **Messages:** the tg, max and wa store, with the people linked across messengers and mail.

You add tags, tasks and reminders, organizations and projects.

More: [notes on wirecat.dev](https://wirecat.dev/en/docs/files)

## Commands by task

| Task | Commands |
| --- | --- |
| Sync what changed | `wcat sync` · `sync --only notes` · `sync --only mail` · `jobs start` / `stop` / `status` |
| Search | `wcat search all` · `search notes` · `search mail` · `search messages` |
| Hand evidence to an agent | `wcat answers create` |
| Know a person | `wcat context` |
| Prepare and review archived meetings | `wcat meetings prepare` · `search meetings` · `meetings passage` · `meetings actions add` |
| Organizations and projects | `wcat organizations add` / `list` / `context` · `projects add` / `list` / `context` · `projects key-documents add` / `remove` / `list` · `projects meetings list` / `link` |
| Project and topic aliases | `wcat vocabulary list` / `show` / `check` / `inspect` · `vocabulary aliases add` / `remove` · `vocabulary create` |
| Relationships | `wcat relationships add` / `list` / `remove` / `confirm` / `suggest` |
| Labels | `wcat tags add` · `tags remove` · `tags list` |
| Open work | `wcat tasks add` · `tasks list` · `tasks counts` · `tasks agenda` · `tasks show` · `tasks update` · `tasks move` · `tasks assign` · `tasks history` · `tasks close` · `stats tasks show` · `people list` |
| Task dependencies | `wcat tasks link` / `unlink` / `links` · `tasks status` · `tasks list project:HRB ready:true` |
| Reminders | `wcat reminders add` / `list` / `poll` / `ack` / `update` / `cancel` |
| Agents | `wcat memories …` · `facts …` · `actions …` · `agents list` · `wcat mcp serve` |

Every command takes `--help`; most take `--json`. `wcat guide` lists scenarios — the commands for a common task, in
order — and `wcat guide person-brief` gathers one person across every WireCat tool.

More: [technical docs](#technical-docs) · [wcat on wirecat.dev](https://wirecat.dev/en/docs/wcat)

## Notes

Notes and documents belong to the [files](https://github.com/WireCatLabs/files-cli) CLI: `files folders add`, `files sync`, `files notes add` and the
rest. wcat reads what it stored: `wcat search notes`, `wcat context`, `wcat tags` and `wcat tasks` see those notes,
and `wcat show note:<id>` names the `files notes show` command that opens one. `wcat sync` runs `wcat-files sync`
when the files CLI is on PATH.

More: [notes on wirecat.dev](https://wirecat.dev/en/docs/files)

## Search and evidence

Notes are searched by words and word stems in the query language messages use — phrases, `AND`/`OR`/`NOT`,
`tag:`, `date:` — and by meaning once the local model is downloaded (`wcat models download embeddinggemma`); both are ranked together. `search all`
reads messages, imported mail, notes and the calendar events gcal stored together, and nothing else. When you know the kind, its own search
reads every field: `search mail` takes `from:`, `to:`, `cc:`, `bcc:`, `subject:` and `mailbox:`.

```sh
wcat search notes '"budget review" AND NOT cancelled' --limit 20
wcat search mail 'from:alice@example.com subject:budget'
wcat show note:NOTE_ID --json
```

`wcat answers create` needs a scope (`--all`, or `--source`, such as `--source telegram:1,notes`) and returns evidence by default. To
call a model instead, set `WCAT_MODELS_ANALYSIS_PROVIDER` and `WCAT_MODELS_ANALYSIS_MODEL` and pass
`--analyze`; a remote model also needs `--allow-remote`.

More: [search](https://github.com/WireCatLabs/wirecat/blob/main/docs/search.md) ·
[searching on wirecat.dev](https://wirecat.dev/en/docs/wcat/search)

## People, organizations and projects

`wcat context` answers from the shared store: every identity linked to the person, the last message each
way, recent messages, chats in common, linked mail, their calendar events, the notes about them and the open tasks. Who is who is
decided in messaging — `tg personal contacts link <person> email:<address>` — and a same name is never enough.

Organizations and projects are yours, not one account's. Relationships (`member-of`, `related-to`) are
manual statements; `relationships scan` only proposes a project's likely chats and people, or shared-domain links,
for you to confirm. A project can hold meetings (`projects meetings link`), and `wcat vocabulary` gives projects and
topics reviewed aliases, so one name always means one project.

Before adding a new tag or topic, run `wcat vocabulary check <name> --json`. Reuse a
canonical label or add an alias if it means the same thing. For a deliberately distinct label,
run `wcat vocabulary create <name> --fingerprint <creation_fingerprint> --json`; select `--kind topic`
on both commands when creating a topic. The owner accepts this review; MCP has `vocabulary_check`
but no tool that creates a label. An intervening label or alias change requires a fresh review.
`wcat vocabulary check --json` finds likely synonyms already in the catalog. Its `complete`
flag reports whether the bounded comparison finished; candidates require review and are never
merged automatically. Use `--kind tag`, `--kind topic` or `--kind project` to narrow the review.

```sh
wcat organizations add 'Synthetic Studio' --kind company
wcat projects add 'Synthetic Harbour' --organization organization:ORGANIZATION_ID
wcat projects key-documents add PROJECT_ID document:DOCUMENT_ID --reason 'read this first'
wcat projects context PROJECT_ID --json   # start project work here: key documents come first
```

More: [people and projects](https://github.com/WireCatLabs/wirecat/blob/main/docs/people.md) ·
[people on wirecat.dev](https://wirecat.dev/en/docs/wcat/people)

## Mail

The separate [mail](https://github.com/WireCatLabs/mail-cli) CLI brings mail in: `mail <profile> session start
--address me@example.com`, then `mail <profile> sync`, fill the shared store, and wcat searches and shows that mail.
`mail` keeps text and headers, not attachments. `mail` can also file, delete and send mail in your mailbox; wcat never
changes it.

```sh
wcat search mail 'mailbox:important budget'
wcat messages show <ref>
```

wcat never opens a mailbox. Looking at a mailbox before a sync (`mail <profile> account inspect`), a Google Takeout
archive (`mail <profile> messages import`), rules and cleanup are commands of `mail`; `wcat sync` and its timer only
prepare the stored mail for search by meaning. To see how far a mailbox synced, run `mail <profile> status`.

More: [mail](https://github.com/WireCatLabs/wirecat/blob/main/docs/mail.md) ·
[mail on wirecat.dev](https://wirecat.dev/en/docs/wcat/mail)

## Tags, tasks and reminders

Tags are your labels on a note, an email, a message, a chat, a person, an organization, a project, a task,
a meeting, or every note under a folder. They live in the store; files, Gmail labels and mailbox flags are
never changed. A task points at the message or note it came from, or is your own in a
project (`--project RES --title …`), and can be blocked by another until it is done. `wcat tasks agenda`
says what needs a look today in the account you name; a notes folder is one (`--source notes`). Reminders are local:
a caller you choose polls for them, and nothing is delivered to a messenger or mailbox.

```sh
wcat tags add follow-up --note note:NOTE_ID
wcat tasks add 'msg:telegram/1/77/42' --type request
wcat reminders add TASK_ID --at-time 2026-10-09T09:00:00+02:00 --account telegram:1
```

More: [tags](https://github.com/WireCatLabs/wirecat/blob/main/docs/tags.md) ·
[tasks and reminders](https://github.com/WireCatLabs/wirecat/blob/main/docs/tasks.md) ·
[tag your sources](https://wirecat.dev/en/docs/wcat/tags)

## Agents and MCP

An agent with a terminal runs `wcat` with `--json`. An MCP app starts `wcat mcp serve` on stdin and stdout. Through it
the app can use wcat's commands, including writes, limited by the saved permissions and read lock.
It can open search references with `show` and `messages show` through `wcat_read`:

```json
{ "mcpServers": { "wirecat": { "command": "wcat", "args": ["mcp", "serve"] } } }
```

An agent's new memories, directly recorded facts and outbound action proposals start as `proposed`.
Permission keys limit reading, editing and decisions; writes without a saved level use `ask`, which runs over MCP
without a terminal question. Group, digest and schedule changes need `mcp.authority`, off by default.
Project proposals have a separate flow: by default only you decide them. Set `agent_decisions: true` to let an agent
decide them with a recorded reason, creating accepted facts and numbered tasks or confirming a key document. Meeting decisions and annotation restore require explicit permissions. wcat never sends a message
or email. `wcat agents list` lists each call, its result and time, without its arguments.

More: [memories and facts](https://github.com/WireCatLabs/wirecat/blob/main/docs/memories.md) · [the MCP server](https://github.com/WireCatLabs/wirecat/blob/main/docs/mcp.md) ·
[MCP on wirecat.dev](https://wirecat.dev/en/docs/wcat/mcp)

## Keeping it current

`wcat sync` brings notes (through the files CLI) and mail up to date and reads only what changed. `wcat jobs start --every 5m` runs
it on a systemd user timer; `jobs status` shows the next and last run, and while timer runs fail every wcat
command says so in one stderr line. A lock keeps two syncs apart: a
timer run that finds a sync still running skips and exits 0. One failing source does not stop the others.

More: [keep your notes current](https://github.com/WireCatLabs/wirecat/blob/main/docs/archive.md) ·
[add a notes folder on wirecat.dev](https://wirecat.dev/en/docs/files)

## Configuration

`wcat jobs start` and `wcat config` write `~/.config/wcat/config.json` for you. Notes folders are set in the files
CLI's own config.

More: [configuration](https://github.com/WireCatLabs/wirecat/blob/main/docs/configuration.md) ·
[configuration on wirecat.dev](https://wirecat.dev/en/docs/wcat/configuration)

## Security

- wcat never opens a mailbox or a notes folder, sends mail or changes one; mail is the `mail` CLI's, notes the files CLI's.
- What wcat adds — links, tags, tasks, memories — stays in the local store.
- Evidence reaches a model only with `--analyze`, and a remote one only with `--allow-remote`.
- Agents propose; only you confirm memories and approve actions.

More: [security](https://github.com/WireCatLabs/wirecat/blob/main/docs/security.md) ·
[security on wirecat.dev](https://wirecat.dev/en/docs/wcat/security)

## Limits

- Search by meaning embeds at most 600 chunks a run; the next run continues.
- `wcat sync --only mail` reads 200 new messages per account a run by default (`--limit`) and keeps up to 1,000,000
  characters of a body and 200,000 of an attachment's text (`mail.max_body_chars`, `mail.max_attachment_chars`).
- Searches return at most 100 results; `tags list` shows 100 labels unless `--limit` says more.
- Tags are 1–32 letters a–z, digits or hyphens.

More: [search](https://github.com/WireCatLabs/wirecat/blob/main/docs/search.md)

## When something is missing

- **Searched by words only:** the local meaning model is not downloaded. Install it through tg, max or wa;
  they share the model folder. Without it, word search still works ([search by meaning](docs/search.md)).
- **`wcat sync --only notes` fails with `files.not-installed`:** install the files CLI, `npm install -g @wirecat/files-cli`.
- **A name is refused:** two people share it; use one of the ids it lists.
- **`wcat answers create` asks for a scope:** add `--all`, or `--source`.
- **An empty search:** the store holds nothing that matches — not proof that it never happened. Try the
  kind's own search, looser words, or sync that source first.

- **A command failed and you want to see why:** `wcat runs list status:failed`, then `wcat runs show <run-id>`.
  Failed runs are kept for 30 days, runs that worked for 7
  ([runs](https://github.com/WireCatLabs/wirecat/blob/main/docs/configuration.md#record-and-keep_runs_for_days)).

More: [if something is missing](https://wirecat.dev/en/docs/wcat/troubleshooting) ·
[search](https://github.com/WireCatLabs/wirecat/blob/main/docs/search.md)

## Part of WireCat

[WireCat](https://wirecat.dev) is an open-source, local-first context layer for AI agents: tg for
Telegram, max for MAX, wa for WhatsApp, zm for archived Zoom recordings, drive for Google Drive and Docs,
files for your notes and documents, and wcat over all of them. Their context is searchable locally. Start with your
notes and add the sources you need.

Questions and setup help: join the [WireCat Discord](https://discord.gg/DebENqbRrJ). Bugs go to this
repository's issues.

## Technical docs

| Page | What it covers |
| --- | --- |
| [Overview](https://github.com/WireCatLabs/wirecat/blob/main/docs/index.md) | What wcat does and how it works, in short |
| [Installation](https://github.com/WireCatLabs/wirecat/blob/main/docs/installation.md) | Requirements, install, where files go, update |
| [Using wcat](https://github.com/WireCatLabs/wirecat/blob/main/docs/usage.md) | A normal day: sync, search, context, review |
| [How wcat works](https://github.com/WireCatLabs/wirecat/blob/main/docs/how-it-works.md) | The local store, links, references, review |
| [Tags](https://github.com/WireCatLabs/wirecat/blob/main/docs/tags.md) | Labels on any source |
| [Search](https://github.com/WireCatLabs/wirecat/blob/main/docs/search.md) | Search words, `search all`, `answers create` |
| [People and projects](https://github.com/WireCatLabs/wirecat/blob/main/docs/people.md) | Person context, linking, organizations, relationships |
| [Mail](https://github.com/WireCatLabs/wirecat/blob/main/docs/mail.md) | Bring mail in with `mail`, search it in wcat, an agent that proposes tasks from new mail |
| [Tasks and reminders](https://github.com/WireCatLabs/wirecat/blob/main/docs/tasks.md) | Tasks, dependencies and local reminders |
| [Memories and facts](https://github.com/WireCatLabs/wirecat/blob/main/docs/memories.md) | What agents and you record, and proposed actions |
| [The MCP server](https://github.com/WireCatLabs/wirecat/blob/main/docs/mcp.md) | Apps without a terminal, the agent log |
| [Remote connection](docs/remote.md) | Browser and phone apps, access-code login and revocation |
| [Keep your notes current](https://github.com/WireCatLabs/wirecat/blob/main/docs/archive.md) | `wcat sync` and the timer |
| [Recipes](https://github.com/WireCatLabs/wirecat/blob/main/docs/recipes.md) | Whole tasks to hand to your agent |
| [All commands](https://github.com/WireCatLabs/wirecat/blob/main/docs/commands.md) | Every command and option, generated |
| [Configuration](https://github.com/WireCatLabs/wirecat/blob/main/docs/configuration.md) | Every setting and variable |
| [Troubleshooting](https://github.com/WireCatLabs/wirecat/blob/main/docs/troubleshooting.md) | What the screen says, and what to do |
| [Security](https://github.com/WireCatLabs/wirecat/blob/main/docs/security.md) | What is read, written and sent |
| [Compared with other tools](https://github.com/WireCatLabs/wirecat/blob/main/docs/compare.md) · [web](https://wirecat.dev/en/docs/wcat/compare) | How does wcat compare with Hindsight, mem0, Graphiti, Cognee, basic-memory, Obsidian and Screenpipe? |
| [Changelog](https://github.com/WireCatLabs/wirecat/blob/main/CHANGELOG.md) | Every release |

The reader guides live on [wirecat.dev](https://wirecat.dev/en/docs/wcat).

## Development

```sh
pnpm install
pnpm lint && pnpm typecheck && pnpm test
```

Pull requests are welcome; examples and tests use invented people only.

More: [installation](https://github.com/WireCatLabs/wirecat/blob/main/docs/installation.md#development)

## License

[Apache License 2.0](https://github.com/WireCatLabs/wirecat/blob/main/LICENSE).
