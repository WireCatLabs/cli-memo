# The MCP server

This page helps you connect Memo to an AI app that has no terminal, such as Claude Desktop or Cursor.
MCP (Model Context Protocol) is the way these apps use a program on your computer. Once connected,
the app can read your messages, mail, notes and archived meetings, and what Memo knows about a person. It can also save
memories, record facts and propose actions. What it saves waits for your review.

## What the app can do through MCP

| The app can | The app cannot |
|---|---|
| Search and read your stored messages, mail and notes | Send a message or a mail |
| Read a person's context or review a project's pending findings | Change your notes, mail or messages |
| Add, list, show and search memories | Confirm a memory |
| Add, list and show facts | Accept a fact |
| Propose actions and list them | Approve or reject an action |
| Read the agent log | Delete anything |
| Look up projects, tags and topics by name, and see which tasks are ready | Create or link tasks |

Four tools write: `memories_add`, `facts_add`, `actions_add` and `meeting_actions_add`. What they add waits as proposed
until you confirm it, and an action is never sent. Other tools do not change source records; meeting search may update its local text index. Connect Memo only to an app
you trust to read your messages, mail and notes.

## Connect an app

Add Memo to the app's MCP settings. Most apps use a file like this:

```json
{ "mcpServers": { "memo": { "command": "memo", "args": ["mcp"] } } }
```

Add the `memo` entry next to any servers already in the file:

| App | Settings file |
|---|---|
| Cursor | `~/.cursor/mcp.json` |
| Claude Desktop, macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Claude Desktop, Windows | `%APPDATA%\Claude\claude_desktop_config.json` |

Restart the app after you save the file. Memo must be installed on the same computer as the app. If
the app cannot find `memo`, replace `"memo"` with its full path, which `which memo` (macOS and Linux)
or `where.exe memo` (Windows) prints.

Then try it:

```text prompt
Use the memo tools to list the memories waiting for my review.
```

## The tools

| Tool | What it does |
|---|---|
| `search_all` | Search messages from every messenger, mail and notes together, read only |
| `search_messages`, `search_mail`, `search_notes` | Search one kind with all its fields, read only |
| `search_meetings`, `meeting_passage` | Search stored meetings in one explicit source account and read cited transcript passages |
| `meeting_prepare` | Gather stored series history and linked context, optionally with explicitly selected message/mail accounts; does not verify the next meeting time |
| `project_context` | Key documents, pending relationships, facts and meeting findings, plus open numbered tasks |
| `project_evidence` | Cited references about a project from stored messages, mail, meeting transcripts and notes folders, searched by its names, more words and people; read only |
| `meeting_actions_add`, `meeting_actions_show`, `meeting_actions_list` | Propose and inspect cited meeting facts and follow-ups; never confirm them |
| `person_context` | One person across messengers and mail, with linked notes and tasks, read only |
| `memories_add`, `memories_list`, `memories_show`, `search_memories` | Save and read memories |
| `facts_add`, `facts_list`, `facts_show` | Record and read facts |
| `actions_add`, `actions_list`, `actions_show` | Propose actions and read them |
| `agents_log` | Read the agent log |
| `vocabulary_list`, `vocabulary_show`, `vocabulary_check` | Look up projects, tags and topics, read only |
| `vocabulary_inspect` | Inspect two selected tags before consolidation; counts, overlaps and bounded samples; merges nothing |
| `tasks_relations`, `tasks_status`, `tasks_list` | See how tasks depend on each other, read only |

Everything the app adds is saved under the agent name `memo-mcp` and waits as proposed. You review it with
`memo memories list status:proposed` and the commands in [Memories and facts](memories.md).

## The agent log

Every call the app makes is written to the agent log:

```sh
memo agents log agent:memo-mcp --limit 20
```

The log shows the tool, the result and the time, never what the app sent.

For meeting evidence, see [meeting search](search.md#search-stored-meetings). Ask your agent to read
passages with `meeting_passage`, then stage a batch with `meeting_actions_add`. Give one `account` as
`example:work` and an `input` object with `schema_version: 1`, `key`, `extractor` and `findings`, using
the same fields as `memo meetings actions add --help`. Every finding needs exact cue references and
fingerprints and a confirmed project link. Unknown dates and assignees stay absent; inferred follow-ups
are labelled as such. Exact retries reuse the key; changed input needs a new key.

`meeting_actions_show` and `meeting_actions_list` take an explicit `source`. Only the owner reviews
batches through `memo meetings actions confirm` or `reject`. Staging creates no facts or numbered tasks.

`project_evidence` takes the options of `memo projects evidence` in snake_case and needs `source`: account
entries, a kind, `group:<name>` or `all`. It searches the project's name, its key, each of its aliases and each
`alias`, each `context_query` and each `contact` separately and joins the hits; `since_time` defaults to `60d`.
Optional `before_time` fixes the exclusive end to an ISO 8601 timestamp with `Z` or a UTC offset. Days back
are counted from that instant; an explicit start date also uses it as the end. Keep the same value on
continuation. It fixes the window, not the source data or the registered aliases/accounts.
Meeting accounts are supported: a recorded profile such as `zm:work` selects that account's stored,
indexed transcript cues. Hits retain exact `meeting:` cue references and use the meeting start date
(`time_kind: "meeting-start"`). Superseded/deleted transcripts are excluded. Missing transcripts and
incomplete archives remain unknown; Memo does not fetch recordings. Transcript indexing uses the meeting
provider's existing indexing workflow; the mail/document catch-up below does not build transcript indexes.
New mail and documents are indexed for search first; `catch_up: false` reads the index as it is. Each message
hit carries `around`: `before_n` and `after_n` messages next to it in its chat (default 2), as context, never as
more hits. `mentions` lists the other projects, tags and topics the texts name, cited; a name is not
membership. An item found only through a
contact's name has `context: "person-only"`. Failed or unread sources are listed, and `completeness` stays
`unknown`. When it returns a `checkpoint`, call again with the same arguments and `cursor` set to it.
It creates no facts, tasks or project links; the index catch-up above can update local search indexes.

Use `project_context` with a project key, exact name or alias to review pending findings together.
Meeting previews read at most five batches from each of eight linked meeting accounts; coverage and
continuation commands identify more or missing records. A preview includes only this project's
undecided findings. Read the full batch before review: it can also hold findings for another project.

Next: [review what the app saved](memories.md).
