# Security

This page says what Memo reads, what it writes and what can leave your computer, so you can decide
what to point it at. In short: Memo reads your sources and never changes them, everything it adds
stays in a file on your computer, and your text goes to an AI provider only when you set one up and
allow it.

## Your sources are only read

- **Note folders** are only read. Hidden folders such as `.obsidian` are skipped. Memo writes files
  only when you export notes, into the folder you name, and never overwrites a file you edited.
- **Your mailbox** is opened read-only. Memo never sends, moves, deletes or flags mail, and does not
  mark it as read.
- **Tags** leave your files, Gmail labels and mailbox flags as they are.

## What Memo adds stays on your computer

Your notes, links, tags, tasks, reminders, memories, facts and proposed actions are kept in the local
store, a file on your computer shared with tg and max. Search by meaning uses a model that runs on
your computer. Reminders go to a program on your computer that asks for them, never to a messenger
or a mailbox.

## Deletions are respected

When you delete a note file or an email, its text leaves the local store on the next import. If an
import finds that an unusually large part of a folder or mailbox is missing at once, it deletes
nothing and tells you.

## Agents suggest, you decide

- Proposed actions, and memories and facts added through the MCP server, wait for your review.
  Through the MCP server, an agent cannot confirm, accept, approve or reject.
- A fact, memory, relationship or proposed action added with the `memo` command records who wrote it.
  When an agent's terminal runs it (`AI_AGENT` or `CLAUDECODE` is set), the agent is the author and the
  fact, memory or relationship waits for you like one added through MCP. Yours is confirmed at once;
  in an agent's terminal, add `--as-owner`. `--as-owner` is a label, not a lock: an agent can pass it
  too, so tell your agent never to.
- Approving an action makes it a task for you. Memo never sends a message or an email.
- The agent log records the agent, the tool, the result and the time, never what the agent sent.
- Two accounts are treated as one person only after you link them. A matching name or email domain
  is never enough.

## What can leave your computer

- `memo ask` gives the sources to your own agent by default. It sends them to an AI provider only
  with `--model`, and to a provider outside your computer only with `--allow-remote` as well. The
  provider's answer is generated text: check it against the sources.
- What your agent does with the text it reads is up to that agent and its provider. Memo cannot
  control it. Point your agent only at the sources you are willing to share with it.
