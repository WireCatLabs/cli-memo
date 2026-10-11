# Search and evidence

This page is for finding something you wrote or received — in notes, imported mail or messages — and
for handing an AI agent the evidence behind an answer. Every hit carries a reference to its source, so
you or your agent can open the original. Empty results only mean the store holds nothing that matches,
not that the thing never happened.

```sh
memo search notes '"budget review" AND NOT cancelled' --limit 20
memo search notes 'project progress' --filter 'date:2026-10-08' --tag project --folder /path/to/vault
memo notes show note:NOTE_ID --json
memo search all 'budget AND date:[2026-09-01 TO *]' --json
memo ask 'What work is pending?' --query budget --all --json
```

## Notes

Notes are searched by their words and word stems, in the query language messages use: phrases,
`AND`/`OR`/`NOT`, `tag:`, `date:`; `--exact` matches every word as written. A message-only field such as
`from:` is refused. They are also searched by meaning when the model is downloaded, and the two are
ranked together: `by` says which ran, each hit's `foundBy` which found it, and `meaningSkipped` why
meaning did not run. Each hit carries its reference, the first matching line and the links the note
holds; `linked` counts what the notes found link to, with each person's name. Follow `nextOffset` with
`--offset`.

The meaning model is the local e5-small, shared with tg and max: `tg models text download e5-small`.

`notes show` takes `note:<id>` or a file in a configured folder, and answers with the note's tags, its
links, its backlinks and, for a PDF or sheet, where its text came from.

## Everything at once

`search all` searches messages, imported mail and native notes together, and nothing else: not people,
memories, projects, organizations or decisions. Use it when you do not know where something was written. When
you know the kind, its own search reads it with every field: `search mail` takes `from:`, `to:`, `cc:`, `bcc:`,
`subject:` and `mailbox:` (a folder or Gmail label); `search messages`, `search notes`; `search notes --type
internal|file` narrows note kinds. An empty answer means those three hold nothing that matches: try the kind's
own search, looser words, or `tg search conversations` to find mail and messages by meaning.
`search all` includes a separate `tasks` list for open work linked to matching sources. Results identify source
kind/account and skipped-resource coverage; a query using a field only messages have (`from:`, `after:`)
searches the messages and says the notes were not searched. Missing hits do not prove that an event
never happened.

## Evidence for an agent

`ask` returns an evidence bundle for your chosen agent by default. To call a model, configure
`MEMO_MODELS_ANALYSIS_PROVIDER`, `MEMO_MODELS_ANALYSIS_MODEL`, optionally
`MEMO_MODELS_ANALYSIS_BASE_URL` and `MEMO_MODEL_API_KEY`, then pass `--model`. Remote calls also require
`--allow-remote`. Model claims are generated and unverified, cite supplied evidence, and distinguish
assertions, conclusions and inferences. Suggestions create no task until you explicitly run
`memo tasks add <source> --type <kind>`. Answers are not saved as independent facts.

`ask` needs a scope: `--all`, or `--provider` (with `--account` when several accounts exist).

Next: [turn what you found into open work](tasks.md), or [label it with tags](tags.md).
