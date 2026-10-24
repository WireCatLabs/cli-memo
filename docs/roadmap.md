# Roadmap

This page says what Memo does today, what is being built and what is planned. Read it before you look for a
workaround: a missing feature may already be planned. The order is rough and can change. Suggest your own in
[issues on GitHub](https://github.com/WireCatLabs/cli-memo/issues).

## What works today

Memo reads folders of notes and the documents in them, imports Gmail and IMAP mail through Himalaya, and reads
the messages tg, max and wa keep in the local store. You can search all of it together, see what you know about
one person or project, tag anything, keep tasks and local reminders, and let an agent record memories, facts
and proposals for you to review, from the terminal or over MCP. MCP exposes command tools, including writes,
limited by saved permissions, and can open cited records in full. Download the search model with
`models download` and add an explicit Himalaya account with `mail add`. Every command and option is in
[all commands](commands.md); the guides start at [the overview](index.md).

## In progress

Nothing is being built right now. The first items under Next come first.

## Next

- **Project evidence, next steps.** Before gathering, say which sources are fresh enough to search; read the
  whole thread around a match; optionally add search by meaning.
- **Meetings in `search all` and in a person's context.** Today stored meetings have their own search.
- **Faster search.** A search should not take seconds on a small store.

## Later

- A full export and restore of one project, beyond the aliases, facts and links Memo moves today.
- Optional AI analysis of a project's evidence, reported as what changed since the last run.
- Merging duplicate tags. Today Memo shows what a merge would touch and changes nothing.
- Reminders on a project's own tasks.
- macOS and Windows support. Today Memo is tested on Linux only.
- MCP over HTTP, for apps that do not start Memo themselves.
- Finding images by the conversation around them and by photo data.
- Reading mail without Himalaya: Memo connects to your mailbox itself, so there is no separate mail program to
  install and set up.

What changed in each released version is in the [changelog](../CHANGELOG.md).
