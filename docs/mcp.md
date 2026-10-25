# The MCP server

This page helps you connect Memo to an AI app that has no terminal, such as Claude Desktop or Cursor.
MCP (Model Context Protocol) is the way these apps use a program on your computer. Once connected,
the app can read your messages, mail, notes and archived meetings, and what Memo knows about a person. It can also save
memories, record facts and propose actions. New suggestions wait for review; project proposals have
separate decision permissions described below.

For apps on the web or phone, use [the remote connection guide](remote.md). It serves the same
three tools over authenticated HTTP through your HTTPS tunnel.

## Commands and permissions

Memo uses cli-core's shared MCP surface. It lists three tools:

| Tool | What it does |
|---|---|
| `memo_tools_search` | Find commands by words and inspect their arguments and answer shape; no query lists the full catalogue with current availability |
| `memo_read` | Run a reading command by its CLI path |
| `memo_write` | Run a writing command by its CLI path; permissions are checked before execution |

For example, find a note reader with `memo_tools_search {"query":"notes show"}`, then call
`memo_read {"command":"notes show","arguments":{"note":"note:12"}}`.
Arguments use the CLI's positional names and snake_case options. Unknown arguments are refused.
The commands run the CLI itself in-process, using the same services, answers and errors.

Set `permissions` in Memo's [configuration](configuration.md#permissions) to limit what an app can do.
A dotted command path is a key, such as `notes.edit`; a parent key such as `notes` covers its commands.
`deny` marks a command unavailable in discovery, `readonly` permits reads, and `ask` or `allow` permits writes. Over MCP, `ask` runs
without a terminal question; approval prompts depend on the client app. Writes without a saved level use `ask`.
`mail delete` and `mail restore` also require `yes: true`, just as their CLI commands need `--yes`.

Commands that change source folders or mail rules need `mcp.authority`, which defaults to `deny`.
Meeting findings decisions (`meetings.actions.confirm` and `meetings.actions.reject`) and
`projects.annotations.restore` also default to `deny`; the owner must explicitly permit each operation
before an agent can use it. Save permissions in the configuration; discovery and the next command call
read the current levels. Permissions and the shared WireCat read ceiling are checked again on every call.

`memo mcp --permission notes.edit=deny` makes a saved permission stricter for one server; repeat the option
for more keys. It cannot loosen the saved permissions, including more specific keys.
`MEMO_READ_ONLY=1` marks every writing command unavailable and refuses writes on an existing connection.
Discovery retains blocked commands with current `availability` and the reason, as cli-core does.

The named CLI-only exclusions are `mcp`, `upgrade`, `skill install`, `jobs start` and `jobs stop`: they start
another server, replace the running program, install instructions in other apps, or manage a background timer.

`memories add`, `facts add`, `actions add`, `meetings actions add` and `projects actions add` save proposals.
By default, `projects actions confirm` and `projects actions reject` may decide project proposals with a recorded
reason. Set [`agent_decisions: false`](configuration.md#agent_decisions) to require owner decisions for project
proposals through the CLI and MCP. Memo never sends a message or mail.

## Open a cited item

Pass a search hit's `ref` to `notes show` as `note`, or a message or email reference to `messages show` as `message`.
`notes show` returns the whole note; `messages show` returns the stored message or email and takes `full: true` for whole
attachment text. `mail inspect` reads mailbox headers for an explicit account. `tags list` lists tags.
Messenger reads use the explicit account and chat encoded in the reference; nothing is fetched from a provider.

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

<a id="existing-tool-names"></a>

## Update a saved client

Reconnect after upgrading so the app refreshes its tool list. Replace per-command tools with
`memo_read` or `memo_write`, passing the CLI path in `command`. For instance, `notes_show` becomes
`memo_read {"command":"notes show","arguments":{"note":"note:12"}}`.
The old tool names are no longer registered. Use discovery to get the current argument schema.

| Previous call | Current command and arguments |
|---|---|
| `person_context` | `context`; keep `person` and explicit `source` |
| `project_context`, `project_evidence` | `projects context`, `projects evidence`; evidence uses `no_catch_up: true` instead of `catch_up: false` |
| `search_notes`, `search_messages`, `search_mail`, `search_all` | `search notes`, `search messages`, `search mail`, `search all`; use `query` instead of `text` |
| `facts_add` | `facts add`; use `statement` instead of `text` |
| `search_memories` | `search memories`; use `query` instead of `text` |
| `meeting_passage`, `meeting_prepare` | `meetings passage`, `meetings prepare`; discover the CLI's arguments |
| `meeting_actions_add`, `project_actions_add` | `meetings actions add`, `projects actions add`; `input` carries the JSON proposal without touching MCP stdin |
| `meeting_actions_list` | `meetings actions list`; use `query: "status:proposed"` instead of a `status` field |
| `project_annotations_snapshot` | `projects annotations show`; reads without creating a file |
| `project_annotations_preview` | `projects annotations check`; `file` and `bindings` name existing local JSON files |
| Other underscore names | Their CLI paths, such as `memories add`, `actions list`, `vocabulary check` and `tasks status` |

Permission keys remain dotted CLI paths, such as `projects.evidence`, rather than old tool names.
Vocabulary budget arguments now use snake_case, such as `max_comparisons`.

Suggestions are saved under the agent name `memo-mcp`. Review proposed memories and facts with
`memo memories list status:proposed` and the commands in [Memories and facts](memories.md).

## The agent log

Each command that reaches Memo’s command runner is written to the agent log, including permission and validation refusals:

```sh
memo agents list agent:memo-mcp --limit 20
```

The log shows the command as an underscore name, the result and the time, never its arguments.
Discovery and shared-protocol refusals happen before the command runner.

For meeting evidence, see [meeting search](search.md#search-stored-meetings). Ask your agent to read
passages with `meetings passage`, then stage a batch with `meetings actions add`. Give one `account` as
`example:work` and an `input` object with `schema_version: 1`, `key`, `extractor` and `findings`, using
the same fields as `memo meetings actions add --help`. Every finding needs exact cue references and
fingerprints and a confirmed project link. Unknown dates and assignees stay absent; inferred follow-ups
are labelled as such. Exact retries reuse the key; changed input needs a new key.

`meetings actions show` and `meetings actions list` take an explicit `source`. The owner reviews
batches through `memo meetings actions confirm` or `reject`, or explicitly permits the corresponding MCP decision commands. Staging creates no facts or numbered tasks.

`projects actions add` stages cited facts and follow-ups about one project: each reference is a `msg:` or
`document:` reference with the `fingerprint` `projects evidence` gave, and a text changed since then refuses as
stale. `projects actions list` pages through a project's proposals — suggested key documents (`key:<n>`) and
findings batches — each with its evidence: whether the text changed (`state`), the text and the messages around
it unless `brief`; cited documents include nearby paragraphs. A text changed since staging refuses only the
findings that cite it. Decide the ones you are confident about with `projects actions confirm` (the finding IDs to
create) or `projects actions reject`, always with a `reason`, which is kept with the decision; ask the owner about
the rest. A batch needs its `fingerprint`. When the owner sets `agent_decisions: false`, decisions are refused and
only the owner decides, through `memo projects actions confirm` or `reject`.

Key-document suggestions have no saved text fingerprint and return `state: "untracked"`; reread them
before deciding. Findings retain their own cited fingerprints for detecting source changes.

`projects evidence` takes the options of `memo projects evidence` in snake_case and needs `source`: account
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
New mail and documents are indexed for search first; `no_catch_up: true` reads the index as it is. Each message
hit carries `around`: `before_n` and `after_n` messages next to it in its chat (default 2), as context, never as
more hits. Every message of a chat confirmed as the project's (`memo relationships add
chat:<provider>/<account>/<chat> project:<id>`) is read too when `source` holds its account: those items have
`context: "linked-chat"` and name nothing, their lane has `query: null` and `chat` set. Each `linked_chats` entry has
`items` (new items this run) and `capped`: one run takes at most a share of the item limit from each chat, and
`cursor` reads the rest of a capped one. A linked chat outside
`source` is listed in `unread_sources`, never read. `mentions` lists the other projects, tags and topics the texts name, cited; a name is not
membership. An item found only through a
contact's name has `context: "person-only"`. A `person:<id>` contact reads what that person's stored identities
wrote in `source` (lane `kinds: ["sender"]`, `query: null`, `senders` set; items `context: "sender"`, which may name
nothing) and searches only the aliases the owner gave them, not their messenger display name. `people` lists who
wrote this run's message and mail items, from stored contacts, never from names in the text: one entry per stored
person (`person: "person:<id>"`, `name`, every `identities` entry `{provider, account, id}` seen, so one person's
Telegram and WhatsApp count together) or per identity linked to no person (`person: null`), with `items` and
`contexts` (items per `context`). The owner's own messages are left out. Most items first, at most 20;
`people_omitted` counts the rest. Counts cover this call only: add them up across `cursor` calls. Failed or unread sources are listed, and `completeness` stays
`unknown`. When it returns a `checkpoint`, call again with the same arguments and `cursor` set to it.
It creates no facts, tasks or project links; the index catch-up above can update local search indexes.

Use `projects context` with a project key, exact name or alias to review pending findings together.
Meeting previews read at most five batches from each of eight linked meeting accounts; coverage and
continuation commands identify more or missing records. A preview includes only this project's
undecided findings. Read the full batch before review: it can also hold findings for another project.

`projects annotations show` returns a version-2 `snapshot`, its `fingerprint`, coverage and bounded
read counters for an existing project. It omits source bodies and preserves proposed state. Save that
snapshot to a private local JSON file, then call `projects annotations check` with that `file`,
an explicit `target_store`, destination `project:<id>` and a `bindings` JSON file mapping every external
reference and the project. `max_read_bytes` can lower the
4 MiB read budget. The target must already exist and have matching sources and project key/name;
the tool reports conflicts and a fingerprint without restoring annotations. Both tools refuse
unknown arguments. Schema validation is followed by the shared graph and content checks.

Notes, meeting memberships, tasks, memories, labels and findings are omitted, so this is a selected
annotation format rather than a full project backup. The owner uses
the [selected annotation workflow](recipes.md#keep-selected-project-annotations), or explicitly permits
`projects.annotations.restore` for the command. These reading
commands remain available with `MEMO_READ_ONLY=1`; calls still produce the normal agent audit entry.

Next: [review what the app saved](memories.md).
