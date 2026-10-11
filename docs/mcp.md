# Memories, facts, proposed actions and MCP

This page is for letting an AI agent remember what it learned, record what happened and suggest what to do,
while you stay in charge. An agent proposes; you confirm a memory, accept a fact or approve an action. MCP (Model Context Protocol)
is how apps such as Claude Desktop or Cursor call a local tool; `memo mcp` serves memories, facts,
proposed actions and the agent log that way. Search and context are reached through the command line with
`--json`, not through MCP.

```sh
memo memories add 'Bob Sample prefers Friday meetings' --kind preference --scope work --evidence note:NOTE_ID
memo memories list --status proposed
memo memories confirm memory:MEMORY_ID
memo facts add 'Releases go out on Fridays' --type decision --evidence msg:telegram/1/77/42
memo facts list --type decision --status proposed
memo facts accept fact:FACT_ID
memo actions propose reply --reason 'asked twice' --provider telegram --payload '{"text":"Friday works"}'
memo actions approve ACTION_ID
memo agents log --agent memo-mcp --limit 20
```

## Memories

A memory is what was concluded — a summary, digest or preference — with its evidence (any stored reference)
and a scope, `personal` or `work`. One you write is confirmed at once; an agent's waits as `proposed` until you
`confirm` it, and `stale` marks one whose evidence no longer holds. `memories search` finds the words in
them.

## Facts

A fact is what happened: a fact, a statement, a question, a decision or a promise, with its evidence. Yours is
accepted at once; an agent's waits as `proposed` until you `facts accept` it. A decision with `--supersedes`
ends the one it replaces once accepted, and `facts reverse` ends an accepted decision nothing replaced.

## Proposed actions

A proposed action is what an agent wants done in one account: a reply, a ban, an invitation. Nothing is ever
sent. `actions approve` makes it a task in that account's inbox, so it shows in `memo tasks list`, and the
proposal remembers the task; `actions reject` closes it. `actions list --status` filters them.

## The agent log

`memo agents log` lists what agents did through the MCP servers that share the store, newest first: the
agent, the tool, its tier, the outcome and the times, never the arguments.

## The MCP server

`memo mcp` serves the same to an agent over MCP, on stdin and stdout: `memories_add`, `memories_list`,
`memories_show`, `memories_search`, `facts_add`, `facts_list`, `facts_show`, `actions_propose`, `actions_list`,
`actions_show` and `agents_log`. An agent's memories, facts and proposals are its own (`memo-mcp`) and wait for
you; it cannot confirm, accept, approve or reject. Every call goes into the agent log.

```json
{ "mcpServers": { "memo": { "command": "memo", "args": ["mcp"] } } }
```

Next: [see what an approved action became](tasks.md).
