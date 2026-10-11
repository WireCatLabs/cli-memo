# Security

This page says what memo reads, what it writes and what can leave your computer, so you can decide what
to point it at. In short: your sources are read, never changed; everything memo adds stays in a local
file; and evidence goes to a model only when you configure one and allow it.

## Your sources are read, never changed

- Note folders are only read. Hidden folders such as `.obsidian` are skipped. Files are written to a
  folder only by `memo notes export` or `--export`, and a file edited since memo wrote it is left alone.
- The mailbox is opened read-only: nothing is sent, moved or flagged, and no mail is marked read.
- Tags leave note files, front matter, Gmail labels and mailbox flags untouched.

## What memo adds stays local

Notes you write here, links, labels, relationships, memories, proposed actions and task reminders live
in the local store shared with tg and max. Search by meaning uses a local model. Reminders are
delivered to a local caller that polls for them, never to a messenger or mailbox.

## Deletions are honoured

A note deleted from its folder, or a mail deleted at the source, loses its text in the store on the next
import. A run that finds an unusually large share missing at once deletes nothing and says so.

## Agents propose, you decide

- An agent's memories and proposed actions wait for you; through MCP it cannot confirm, approve or
  reject. Approving an action makes it your task; nothing is ever sent.
- The agent log records the agent, the tool, the outcome and the times, never the arguments.
- Identities are never merged because a name or a domain matches; you link them.

## What can leave your computer

`memo ask` returns evidence to your own agent by default. It calls a model only with `--model`, and a
remote model only with `--allow-remote` as well. Model claims are generated and unverified. What your
agent does with the evidence is up to that agent.
