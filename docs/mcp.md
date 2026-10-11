# The MCP server

This page helps you connect Memo to an AI app that has no terminal, such as Claude Desktop or Cursor.
MCP (Model Context Protocol) is the way these apps use a program on your computer. Once connected,
the app can save memories, record facts, propose actions and read the agent log. What it saves waits
for your review.

## What the app can do through MCP

| The app can | The app cannot |
|---|---|
| Add, list, show and search memories | Confirm a memory |
| Add, list and show facts | Accept a fact |
| Propose actions and list them | Approve or reject an action |
| Read the agent log | Change your notes, mail or messages |
| Look up projects, tags and topics by name, and see which tasks are ready | Create or link tasks |

Search, a person's context and notes are not part of Memo's MCP server. An app reaches them through
tg's or max's MCP server (see [the tg MCP server](https://wirecat.dev/en/docs/tg/mcp)), or an agent
with a terminal runs `memo` with `--json`.

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
| `memories_add`, `memories_list`, `memories_show`, `memories_search` | Save and read memories |
| `facts_add`, `facts_list`, `facts_show` | Record and read facts |
| `actions_propose`, `actions_list`, `actions_show` | Propose actions and read them |
| `agents_log` | Read the agent log |
| `vocabulary_list`, `vocabulary_resolve`, `vocabulary_preflight` | Look up projects, tags and topics, read only |
| `task_relations`, `task_readiness`, `tasks_ready` | See how tasks depend on each other, read only |

Everything the app adds is saved under the agent name `memo-mcp` and waits as proposed. You review it with
`memo memories list --status proposed` and the commands in [Memories and facts](memories.md).

## The agent log

Every call the app makes is written to the agent log:

```sh
memo agents log --agent memo-mcp --limit 20
```

The log shows the tool, the result and the time, never what the app sent.

Next: [review what the app saved](memories.md).
