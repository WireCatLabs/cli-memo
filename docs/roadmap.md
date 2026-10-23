# Roadmap

This page says what Memo does today, what is being built and what is planned. Read it before you look for a
workaround: a missing feature may already be planned. The order is rough and can change. Suggest your own in
[issues on GitHub](https://github.com/WireCatLabs/cli-memo/issues).

## What works today

Memo reads folders of notes and the documents in them, imports Gmail and IMAP mail through Himalaya, and reads
the messages tg, max and wa keep in the local store. You can search all of it together, see what you know about
one person or project, tag anything, keep tasks and local reminders, and let an agent record memories, facts
and proposals for you to review, from the terminal or over MCP. Every command and option is in
[all commands](commands.md); the guides start at [the overview](index.md).

## In progress

Nothing is being built right now. The first items under Next come first.

## Next

- **Clearer first steps.** Correct the hints and examples a new user sees first: the mail import hint, the
  example output in the README, and the install notes for npm 11 and 12.
- **Project evidence, next steps.** Before gathering, say which sources are fresh enough to search; read the
  whole thread around a match; optionally add search by meaning.
- **Download the search model from Memo.** Today another WireCat tool downloads it for Memo.
- **Add a mail account with one command**, checked against Himalaya, instead of editing the settings file.
- **Open a whole note, email or message over MCP**, not only its excerpt in a search result.
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

What changed in each released version is in the [changelog](../CHANGELOG.md).
