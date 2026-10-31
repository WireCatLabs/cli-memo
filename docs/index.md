# Memo

Memo keeps what you know about people and projects in one place on your computer: your notes, your
email and your Telegram, MAX and WhatsApp messages. Your AI agent (for example Claude Code, Codex, Cursor or
Gemini CLI) uses it to find what was said, gather the context for a reply and remember what matters.

This page tells you what Memo can do, how it works in short, and how to get a first result in a few
minutes.

Three words appear on every page:

- **Terminal** (command line): the window where you type commands, such as Terminal on macOS or
  PowerShell on Windows. `memo` is a command you type there, or that your agent types for you.
- **AI agent**: a program that does tasks for you and can run commands. It runs `memo` for you.
- **Local store**: one file on your computer that holds your messages, mail and notes. Memo, tg and
  max all read and write the same file.

## What it can do

| You want to | Where |
|---|---|
| Search a folder of notes or documents, or an Obsidian vault | [Notes and folders](./notes.md) |
| Write your own notes about a person, a message or a project | [Notes and folders](./notes.md#write-your-own-notes) |
| Put labels such as `work` or `follow-up` on notes, messages and people | [Tags](./tags.md) |
| Find something when you do not remember where it was written | [Search](./search.md) |
| See everything about one person: messages, mail and notes | [People and projects](./people.md) |
| Bring your email in beside your notes and messages | [Mail](./mail.md) |
| Keep track of what you owe people, and get reminded | [Tasks and reminders](./tasks.md) |
| Let your agent remember what it learned, with you deciding what stays | [Memories and facts](./memories.md) |
| Use Memo from an app with no terminal, such as Claude Desktop | [The MCP server](./mcp.md) |
| Connect an app on the web or phone | [Remote connection](./remote.md) |

## How it works

1. **You choose your sources.** You add a folder of notes, connect a mail account, or use tg, max and wa
   to save your chats. Nothing is read until you choose it.
2. **Memo copies the text into the local store.** Imports leave your files and mail
   unchanged. On Linux, a timer can repeat the import. Separate [Gmail cleanup commands](./mail.md#clean-up-gmail)
   move selected mail to Trash or restore it only with `--yes`.
3. **You or your agent ask.** Memo answers with the matching text and a reference to each source,
   so you can open the original and check it.
4. **You control project decisions.** An agent's new memories, directly recorded facts and outbound action
   proposals wait for review. By default an agent may decide project proposals with a recorded
   reason; [require owner decisions](./configuration.md#agent_decisions) if you want to review each one.
   Meeting findings decisions need explicit owner permissions. Memo never sends a message or an email.

Memo keeps the store on your computer. Memo sends your text to an AI provider only when you set one up
and allow it for that request. [How Memo works](./how-it-works.md) explains this in more detail.

## Get started

The easiest way is to ask your agent. Copy this request into it:

```text prompt
Install Memo with npm install -g @wirecat/cli-memo and check that memo --help works.
Then help me add a folder of notes I choose and import it.
Search it for a word I give you and show me the source of each result.
```

Or type the commands yourself. Replace `/path/to/notes` with a folder on your computer:

```sh
npm install -g @wirecat/cli-memo
memo folders add /path/to/notes --format markdown
memo sync --only notes --no-embed
memo search notes budget
```

Memo needs Node.js 22.16+ or 24+ ([what to install first](./installation.md)). Your files stay
where they are. Memo reads your files and mail without changing them. `notes edit` can change a note's
source file; `notes export` writes notes to files. Explicit `memo mail delete` and `memo mail restore` move Gmail mail
to Trash, only with `--yes`.

## Where to go next

| Page | Answers |
|---|---|
| [Installation](./installation.md) | What does it need, where do its files go, how do I update or remove it? |
| [Using Memo](./usage.md) | What does a normal day with Memo look like? |
| [How Memo works](./how-it-works.md) | Where is my data, what is imported, and what does a reference mean? |
| [Notes and folders](./notes.md) | How do I import Markdown or Obsidian notes, and write my own? |
| [Tags](./tags.md) | How do I label notes, messages and people, and find them again? |
| [Search](./search.md) | How do I find something, and give my agent the sources? |
| [People and projects](./people.md) | How do I see everything about a person, a company or a project? |
| [Mail](./mail.md) | How do I bring my email in? |
| [Tasks and reminders](./tasks.md) | How do I track what I owe people? |
| [Memories and facts](./memories.md) | How does my agent remember things, and how do I check them? |
| [The MCP server](./mcp.md) | How do I connect Claude Desktop, Cursor or another app? |
| [Keeping Memo up to date](./archive.md) | How do I import changes, by hand or on a timer? |
| [Recipes](./recipes.md) | What can my agent do for me with Memo? |
| [All commands](./commands.md) | Every command and option |
| [Configuration](./configuration.md) | Every setting in the config file |
| [Troubleshooting](./troubleshooting.md) | Something does not work: what the screen says, and what to do |
| [Security](./security.md) | What does Memo read, write and send? |
| [Compared with other tools](./compare.md) | How does Memo compare with other memory tools, and when does another tool fit better? |
