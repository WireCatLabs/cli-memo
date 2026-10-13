# Recipes

This page gives you whole tasks to hand to your AI agent once Memo has your notes, mail or messages.
Copy a request into your agent and change the names and topics to yours. Each one ends with
something you can check: sources you can open, or a list waiting for your decision. None of them
sends a message or changes your files.

## Prepare for a meeting with someone

```text prompt
Use memo CLI to prepare me for a meeting with Kai Sample tomorrow.
Show our recent messages and mail, my notes about Kai and the open tasks between us.
Give me three points to raise, each with its source.
```

Your agent runs `memo context` for the person and reads the sources. Check the points against the
sources it shows. If a part is empty, the chats may not be downloaded or the accounts not linked
([people](people.md)).

## Find where something was decided

```text prompt
Use memo CLI to find where we decided the launch date for the Harbour project.
Search my notes, mail and messages. Quote the text and show the source of each result.
If you find nothing, tell me what you searched.
```

Your agent uses `memo search all`, then the search for one kind of source if needed. An empty answer
means only that the local store has no match ([search](search.md)).

## Turn requests into tasks

```text prompt
Use memo CLI to find messages and emails from the last week where someone asked me to do something.
List them with their sources. Create a task only for the ones I choose.
```

Your agent searches, shows you the requests, and runs `memo tasks add` for the ones you pick. See
your tasks with `memo tasks list` ([tasks](tasks.md)).

## Keep a project's notes together

```text prompt
Use memo CLI to find my notes, emails and messages about the Harbour project.
Tag the ones I confirm with harbour, then show everything tagged harbour.
```

Afterwards `memo search all 'tag:harbour'` finds them, and a tag on a folder covers new notes too
([tags](tags.md)).

## Remember a preference, with its source

```text prompt
Use memo CLI to find what Kai Sample said about meeting times.
Show me the memory you would save and the message it is based on.
Save it with the message as evidence only after I agree.
```

A memory added with the `memo` command is confirmed at once, so the request asks your agent to
show it first. Later, `memo memories stale` marks it when it no longer holds ([memories](memories.md)).

## Record a decision from a chat

```text prompt
Use memo CLI to find the decision about the venue in the Harbour chat.
Show me the decision and the message first. After I agree, record it as a decision fact
with the message as evidence, in the Harbour project.
```

A fact added with the `memo` command is accepted at once, so the request asks your agent to show it
first. If it replaces an earlier decision, ask your agent to mark that with `--supersedes`.

## Weekly review

```text prompt
Use memo CLI to give me a weekly review: open tasks by project, tasks that are ready to start,
and the memories, facts and actions waiting for my review. Do not approve or confirm anything.
```

Your agent combines `memo tasks list`, `memo tasks list --ready`, and the review lists from
[Memories and facts](memories.md). Decide each item yourself.

## Write a summary into your vault

```text prompt
Use memo CLI to write a short note about the Harbour project that summarises what I know,
with the sources it is based on. Show me the note, then export it to my vault.
```

Your agent writes the note with `memo notes add --about project:…` and exports it with
`memo notes export` ([notes](notes.md#save-your-notes-as-files)). Memo never overwrites a file you
edited.

## Ask with sources only

```text prompt
Use memo CLI to collect the sources about the Harbour budget with memo ask, using the key words
"Harbour budget". Answer only from those sources and cite each one.
```

`memo ask` collects the sources; your agent answers. Memo sends nothing to an AI provider unless you
set one up and allow it ([search](search.md#give-your-agent-the-sources)).

## Run it on a schedule

On Linux, `memo auto start` keeps your notes and mail current. To run a recipe every morning, use your
agent's own scheduling, or a scheduler on your computer that starts your agent with the request.
