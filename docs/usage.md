# Using Memo

This page shows what a normal day with Memo looks like once it is installed: bringing in what
changed, finding something, preparing for a conversation and saving what you learned. Each step
links to the page with the details. Most of the time you ask your agent and it runs the commands;
the commands are here so you can check what it does.

## Bring in what changed

Memo reads your folders and mailboxes when you ask, not all the time. One command brings in
everything that changed since the last run:

```sh
memo sync
```

Only changed files and new mail are read, so a second run is quick. On Linux, `memo auto start` runs it
for you every few minutes ([keeping Memo up to date](archive.md)). Telegram and MAX messages come in
through tg and max, not through Memo.

## Find something

```text prompt
Use memo CLI to find what I wrote or received about the venue for the Harbour project.
Show the matching text and the source of each result.
```

Your agent searches your notes, mail and messages together and shows where each result comes from.
When you know where something is, search only there:

```sh
memo search all 'venue'               # messages, mail and notes together
memo search notes 'venue'             # notes only
memo search mail 'from:kai invoice'   # mail only
```

[Search](search.md) explains the search words and how to give your agent the sources.

## Prepare for a conversation

```text prompt
Use memo CLI to show what I know about Kai Sample on Telegram: recent messages, mail and my notes.
Summarise what is still open between us.
```

`memo context telegram:"Kai Sample"` gathers the person's recent messages, mail and the notes linked
to them, each with its source. See [People and projects](people.md).

## Save what you learned

```sh
memo notes add 'Prefers calls in the morning' --subject telegram:'Kai Sample'
memo tags add follow-up --note note:NOTE_ID
memo tasks add --project HRB --title 'Book the venue'
```

A note keeps your own words about a person, a message or a project ([notes](notes.md#write-your-own-notes)).
A tag is a label that helps you find things again ([tags](tags.md)). A task is something to do
([tasks](tasks.md)).

## Review what your agent suggested

An agent can propose an action, such as a reply. An app connected through MCP can also save
memories and facts. These wait for you:

```text prompt
Use memo CLI to show the memories, facts and actions waiting for my review, with their evidence.
Do not confirm or approve anything; I will decide.
```

[Memories and facts](memories.md) explains how to confirm or reject them. Approving an action makes
it a task for you; Memo never sends anything. A memory or fact your agent adds with the `memo` command
waits for you too: memo records the agent as its author when `AI_AGENT` or `CLAUDECODE` is set. One you
add yourself is confirmed at once.

## Answers for scripts and agents

Add `--json` to most commands to get an answer a program can read. The text answer is for people;
agents and scripts should ask for JSON.

Every result names its source with a **reference**, such as `note:12`, `document:3` or
`msg:telegram/1/77/42`. You can pass a reference to other commands: to tag it, write a note about
it or use it as evidence. [How Memo works](how-it-works.md#references) explains each kind.

Every JSON answer has the same shape. One thing is under `item`; a list is under `items`, with `page`
saying whether more follow (`page.has_more`). `meta` names the run and the accounts read, and `missing`, when
present, says what the answer could not cover and why. `--json=a,b` keeps only those fields of the item or of
each item in the list. Dotted paths traverse nested objects and arrays. Use
`--json=ref,excerpt` for compact `memo search all` hits. Paths are relative to the answer payload;
pagination, coverage, next steps, missing data and execution metadata remain. Field selection
reduces printed output, not the work scanned.

Where a search answer keeps its references:

| Command | Reference of each result |
|---|---|
| `memo search messages`, `memo search mail` | `items[].ref`, as in `tg search messages` |
| `memo search all` | `items[].ref`, with `kind`; `next` lists the open tasks that point at a result (`tasks list source:"<ref>"`) |
| `memo search notes` | `items[].ref` |

`content:` narrows a search to the text of files, `transcript:` to voice transcripts and `filename:` to file
names. Compare like with like: `memo search messages 'content:invoice'` with
`tg search messages 'content:invoice'`, a plain word with a plain word.

## Choosing an account

When you have several Telegram, MAX or mail accounts, Memo does not choose one for you. Name accounts
with `--source`: one account as `telegram:1` or `email:work`, every account of a messenger as `telegram`,
every account of a kind as `mail`, or a saved group as `group:work`; separate several with commas. A list
reads every account it names and says which. A search with no account searches all of them and says so;
so do `memo tasks list` and `memo reminders list`. A notes folder is an account too: `notes:<number>`, with the
number search results give as `folder_id`.

A command that changes something, such as adding a task or a reminder, acts as one account. Name it with
`--account` as provider and account together: `--account telegram:1`, `--account email:work`. Without it,
Memo tells you which accounts exist.

The old `--provider` with a bare `--account 1` still works for one release and prints the new spelling.
