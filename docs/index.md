# wcat

Before a call, get everything you know about the person in one answer: the last messages each way, the mail, your
notes and what you promised. Your notes, mail and chats stay on your computer, and the AI agent you already use, such
as Claude Code or Codex, searches all of them at once.

Ask "What do I need to know about Alice before the call?", "Where did we discuss the Harbour budget?" or "What did I
promise people this week?". Every answer points back to its source: a note, a page of a file, an email or a message.

**On this page:**

1. [What you get](#what-you-get)
2. [Before you start](#before-you-start)
3. [How it looks](#how-it-looks)
4. [Why wcat](#why-wcat)
5. [What it can do](#what-it-can-do)
6. [How it works](#how-it-works)
7. [Start in a few minutes](#start-in-a-few-minutes)
8. [Limits](#limits)
9. [Find a guide for your task](#find-a-guide-for-your-task)

## What you get

- **One person, one answer.** Every account linked to them, the last message each way, chats in common, mail, your
  notes and open tasks, each with a link to its source.
- **Search that does not care where it was said.** Messages, mail and notes ranked together, by words or by meaning.
- **Your Obsidian vault in the same search.** Notes keep their links, aliases and tags, and the PDF, Word and other
  documents in the folder are searched too, down to the PDF page a passage came from.
- **Promises you can track.** Tasks and reminders for what you owe people and what they owe you.
- **A memory you control.** What your agent wants to remember waits for your confirmation, with the evidence behind
  it.
- **Answers with evidence.** Your agent gets the matching sources with their references and what could not be
  searched, so it cites instead of guessing.

## Before you start

- **wcat reads what the other tools copied.** `tg`, `max` and `wa` copy your chats, and `mail` copies your mail, into
  the WireCat local store, one file on your computer. wcat imports your folders into the same file and searches it. A chat no tool has
  copied is not there, so an empty search does not prove a message was never sent.
- **Nothing is sent, and your sources stay as they are.** wcat has no command that sends a message or an email.
  Importing leaves your files and your mailbox unchanged.
- **An agent proposes, you decide.** Memories and facts an agent records wait for your review before they count.
- **Connecting an app such as Claude Desktop?** Set what it must not do first ([MCP](mcp.md)).
- **Search by meaning needs a model you download once.** Until then wcat searches by words and says so.

## How it looks

```text
You:    What do I need to know about Alice before the call?
Agent:  (runs wcat context telegram:"Alice Example" --json)
        Alice wrote yesterday in "Harbour": she needs the revised budget by Friday.
        Your note "people/Alice Example.md" says she prefers a short call.
        Open task: send her the contract draft.
        Sources: msg:telegram/1/77/42, people/Alice Example.md, task 7.
You:    Add a task to send her the budget.
Agent:  Draft task: "Send Alice the revised budget", linked to her message in "Harbour". Save it?
You:    Yes.
```

## Why wcat

- **It reads your real conversations.** Of the memory tools on the [comparison](compare.md), such as Hindsight, mem0
  and Graphiti, none documents reading your Telegram, MAX and WhatsApp chats or your meeting transcripts.
- **Every answer has a source.** A result carries a reference you or your agent can open.
- **Identities are never merged because a name matches.** Accounts join only on an email address or phone number
  nobody else has, or when you link them yourself.
- **No AI key needed.** Import and search run on your computer, and search by meaning uses a local model. wcat sends
  text to an AI provider only when you set one up and allow it.
- **Every agent call is logged**, and you set for each command what an agent may do: allow, ask, read only or refuse.
- **Free and open source.** Apache 2.0.

Another tool fits better when you want memory that builds itself from conversations with a model (Hindsight, mem0,
Graphiti, Cognee), or a hosted memory service for a product you build.

## What it can do

- **Notes and folders:** import Markdown or an Obsidian vault, and write your own notes about a person or a message.
  [Notes and folders](https://wirecat.dev/en/docs/files)
- **Search:** everything at once, or only notes, mail or messages. [Search](search.md)
- **People and projects:** everything about a person or a company. [People and projects](people.md)
- **Mail:** search the mail the `mail` tool keeps, beside your chats and notes. [Mail](mail.md)
- **Tasks and reminders:** what you owe and what you are owed. [Tasks and reminders](tasks.md)
- **Memories and facts:** what your agent learned, waiting for your review. [Memories and facts](memories.md)
- **Business data:** contracts, invoices, payments and bank lines, with money waiting for your review.
  [Business data](business.md)
- **Agents everywhere:** a skill for terminal agents, an MCP server for Claude Desktop and Cursor, and a signed-in
  link for apps on the web or phone through your own HTTPS tunnel. [The MCP server](mcp.md),
  [Remote connection](remote.md)

## How it works

- **One store on your computer.** wcat copies the text of your notes and documents into the local store, beside the
  messages and mail the other WireCat tools keep there. [How wcat works](how-it-works.md)
- **Stays current.** `wcat sync` reads what changed, and on Linux a timer can run it every five minutes.
  [Keep your notes current](archive.md)
- **Made for scripts and agents.** `--json` gives structured answers, and `wcat answers create` hands an agent the
  evidence for a question.
- **What it reads, writes and sends.** [Security](security.md)

## Start in a few minutes

Paste this into your agent:

```text prompt
Install wcat with npm install -g @wirecat/wirecat and wcat skill install --for all. Then help me add a folder of notes I choose, import it, and search it for a word I give you with the source of each result.
```

Or in a terminal. Replace `/path/to/notes` with a folder on your computer:

```sh
npm install -g @wirecat/wirecat
wcat skill install --for all       # puts wcat's skill where your agents read it
files folders add /path/to/notes    # Obsidian format when it is a vault
wcat sync --only notes             # reads the notes, their links and tags
wcat search notes budget
```

You need Node.js 22.16 or a later 22.x, or Node.js 24 or later ([Installation](installation.md)).

Your chats come in through their own tools. Set up [tg](https://github.com/WireCatLabs/tg-cli) for Telegram,
[max](https://github.com/WireCatLabs/max-cli) for MAX or wa for WhatsApp, and [mail](mail.md) for email. wcat searches
them as soon as they are saved. Then ask your agent: "What do I need to know about Alice before the call?"

## Limits

- wcat is tested on Linux. macOS and Windows are not tested yet.
- Search by meaning needs a local model of about 220 MB, downloaded once.
- Repeating the import on a timer works on Linux with systemd.
- One store per computer. There is no hosted copy to reach from another device, and no window of its own.

## Find a guide for your task

| Task | Guide |
|---|---|
| Install and update | [Installation](installation.md) |
| A normal day with wcat | [Using wcat](usage.md) |
| Where data lives and what a reference means | [How wcat works](how-it-works.md) |
| A ready request for your agent | [Recipes](recipes.md) |
| Connect Claude Desktop or Cursor | [The MCP server](mcp.md) |
| Every command | [All commands](commands.md) |
| Something does not work | [Troubleshooting](troubleshooting.md) |
| What wcat reads, writes and sends | [Security](security.md) |
| How wcat compares with other memory tools | [Compared with other tools](compare.md) |
