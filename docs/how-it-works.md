# How Memo works

This page explains what happens to your notes, mail and messages when Memo uses them: where the
text is kept, what an import does, how links and references work, and what an agent can and cannot
do. Read it when you want to know why Memo answers the way it does, or before you point it at
something private.

## The local store

Memo keeps everything in one file on your computer, the **local store** (`wirecat.db`). tg and max
save your Telegram and MAX messages in the same file, so Memo can answer about messages, mail and
notes together.

| Where it comes from | Who puts it in the local store |
|---|---|
| Telegram and MAX messages | tg and max, when they download your chats |
| Email | `memo mail <account> import` or `memo import` |
| Files in your note folders | `memo notes import` or `memo import` |
| Your own notes, tags, tasks, memories and facts | Memo, when you or your agent add them |

Memo never changes the original: your files stay as they are, and your mailbox is opened read-only.
The local store holds a copy of their text.

## What an import does

An import reads your folders and mail accounts and brings the local store up to date.

- **Only what changed is read.** A file that has the same size and change time as last time is
  skipped. Mail that is already stored is skipped. A second import is quick.
- **Edits keep history.** When you edit a note file, the local store keeps the old text as an
  earlier version.
- **Moves keep everything.** A file moved inside its folder keeps its links and tags.
- **Deletions are respected.** When you delete a file or an email, its text leaves the local store
  on the next import.
- **A safety stop.** If an import finds that most of a folder or mailbox is suddenly missing (for
  example, a disk that is not connected), it deletes nothing and tells you.
- **Search by meaning is prepared.** If the search model is on your computer, the import also
  prepares the new text for search by meaning. `--no-embed` skips this step.

Two imports never run at the same time, and one source that fails does not stop the others.

## Folders on more than one computer

When you add a folder, Memo gives it an ID (a short number) in the local store. Notes and links use
that ID, not the folder's path. If you use the same notes on another computer, `memo folders attach`
connects the ID to the folder's path there. Because the ID stays the same, the notes keep their
links and tags.

## Links between notes and people

When Memo imports a note, it also reads the links in it:

- A link to another note in the folder becomes a link to that note.
- A link to a name, such as `[[Kai Sample]]` in Obsidian, becomes a link to that person as soon as
  someone with that name, nickname or username is in the local store. If two people have the same
  name, the link waits until you choose.
- A link written as a reference, such as `[Kai](person:7)` or `msg:telegram/1/77/42`, links straight
  to that person or message.

A name in ordinary text is **not** a link. Memo does not guess who a note is about from the words in
it.

## One person, several accounts

The same person can have a Telegram account, a MAX account and an email address. Memo treats them as
one person only after you link them, with `tg contacts link` or `max contacts link`. A matching name
or email domain is never enough. This keeps one person's messages from being mixed with someone
else's.

## References

Every result names its source with a reference. You can copy a reference into another command to
tag it, write a note about it or use it as evidence.

| Reference | What it points to |
|---|---|
| `note:12` | A note you wrote in Memo |
| `document:3` | A file from one of your note folders |
| `msg:telegram/1/77/42` | One message: the messenger, the account, the chat and the message |
| `chat:…`, `contact:…` | A chat or a contact in one account |
| `person:…` | A person whose accounts you linked |
| `organization:…`, `project:…`, `task:…` | Your organizations, projects and tasks |
| `memory:…`, `fact:…` | A memory or a fact |
| `meeting:…` | A meeting saved in the local store |

A message reference includes the account, so the same message number in another account is a
different message.

## Search by words and by meaning

Memo always searches by words: it finds notes, mail and messages that contain every word you typed,
including other forms of the word. With the search model on your computer, it also searches by
meaning, so `holiday` can find a note about a vacation. The model runs on your computer; your text
is not sent anywhere for this. Each result says how it was found.

An empty result means only that the local store has nothing that matches. It does not prove that
something never happened: the chat may not be downloaded, or the folder may not be imported.

## Agents suggest, you decide

Your agent can add three kinds of records:

- a **memory**: something concluded, such as a preference;
- a **fact**: something that happened, such as a decision;
- a **proposed action**: something to do, such as a reply. It always waits until you approve or
  reject it. Approving it makes it a task for you. Memo never sends a message or an email.

What an app adds through the [MCP server](mcp.md) waits as **proposed** until you confirm the memory
or accept the fact. Through MCP, an agent cannot confirm, accept, approve or reject, and every call it
makes is written to the agent log (`memo agents log`), without the details it sent.

The `memo` command tells an agent's terminal by `AI_AGENT` or `CLAUDECODE`, the variables agents such
as Claude Code set. There, a fact, memory, relationship or proposed action is recorded as the agent's
and waits for you, as through MCP. Without them, or with `--by owner`, it is yours and confirmed at
once. The variables and `--by owner` are labels, not a lock: an agent that sets or passes them can
still write as you.

## What can leave your computer

Nothing, unless you ask for it. `memo ask` prepares sources for your own agent by default. It sends
text to an AI provider only when you set one up and add `--model`, and to a remote provider only
with `--allow-remote` as well. What your agent does with the text it reads is up to that agent.
See [Security](security.md).
