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
- **Mail:** set up [Himalaya](https://github.com/pimalaya/himalaya), then `memo mail import`
  ([mail guide](https://github.com/WireCatLabs/cli-memo/blob/main/docs/mail.md)).
- **Stay current:** `memo auto on` runs `memo import` every five minutes (Linux, systemd).

Details: [installation](https://github.com/WireCatLabs/cli-memo/blob/main/docs/installation.md).

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

## Built for AI agents

- **Any agent with a terminal** — Claude Code, Codex, Gemini CLI and others run `memo` commands; `--json`
  gives them structured output.
- **Evidence, not guesses** — `memo ask` hands over sources with references, and says what it could not
  search.
- **MCP** — `memo mcp` lets MCP apps such as Claude Desktop or Cursor propose memories and actions and
  read the agent log; they wait for you to confirm.

```json
{ "mcpServers": { "memo": { "command": "memo", "args": ["mcp"] } } }
```

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

## What it reads

- **Folders of notes:** Obsidian or plain Markdown, with links, aliases and tags.
- **Documents in them:** TXT, CSV/TSV, text-layer PDF, DOCX, XLSX, ODT/ODS, PPTX and EPUB, with the page,
  row or cell each passage came from.
- **Mail:** Gmail or another IMAP account, through Himalaya, attachments included.
- **Messages:** the tg and max store, with the people linked across messengers and mail.

You add your own notes about messages, people and projects, tags, tasks and reminders, organizations and
projects.

**Status:** early. Context, notes and their links, document import, Gmail and IMAP imports, tasks,
manual relationships, evidence bundles and local reminders work.

## Part of WireCat

[WireCat](https://wirecat.dev) is an open-source, local-first context layer for AI agents: tg for
Telegram, max for MAX, memo for your notes and mail, all in one local store. Start with your notes. Add
more context when you need it. Your context. Any agent.

## Documentation

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

## Security

- Note folders and mailboxes are read-only; nothing is sent, moved or marked read.
- A note or mail deleted at the source loses its text in the store on the next import.
- Evidence reaches a model only with `--model`, and a remote one only with `--allow-remote`.

More: [security](https://github.com/WireCatLabs/cli-memo/blob/main/docs/security.md).

## Contributing

```sh
pnpm install
pnpm lint && pnpm typecheck && pnpm test
```

Pull requests are welcome; examples and tests use invented people only.

## License

[Apache License 2.0](https://github.com/WireCatLabs/cli-memo/blob/main/LICENSE).
