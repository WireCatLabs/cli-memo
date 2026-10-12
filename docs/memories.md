# Memories and facts

This page helps you let your AI agent remember what it learned and record what happened, while you
stay in charge of what is kept. Memo keeps three kinds of records, each with the sources that show it:

- a **memory**: something concluded, such as "Kai prefers Friday meetings";
- a **fact**: something that happened, such as a decision, a promise or a question;
- a **proposed action**: something an agent wants done, such as a reply.

## Review what your agent suggested

```text prompt
Use memo CLI to show the memories, facts and actions waiting for my review, with their evidence.
Do not confirm or approve anything; I will decide.
```

Or yourself:

```sh
memo memories list --status proposed
memo facts list --status proposed
memo actions list --status proposed
```

Open each source, then confirm what is right and leave or reject the rest. The rest of this page
shows how.

**What waits for you.** A proposed action always waits until you approve or reject it. A memory or
fact waits when an agent adds it: through [the MCP server](mcp.md), or with the `memo` command in an
agent's terminal (`AI_AGENT` or `CLAUDECODE` set), where the agent is recorded as its author. One you
add yourself is confirmed at once; in an agent's terminal, add `--by owner` to make it yours. An agent
can pass `--by owner` too, so tell it not to.

## Memories

A memory is a short conclusion with its **evidence**: the references of the messages, notes or
meetings that show it. It has a kind and a scope:

- kind: `preference` (what someone likes or wants), `summary` or `digest`;
- scope: `personal` or `work`.

```sh
memo memories add 'Kai Sample prefers Friday meetings' --kind preference --scope work --evidence note:12
memo memories list
memo memories show memory:3
memo memories search friday meetings
memo memories confirm memory:3
memo memories stale memory:3
```

A memory you add with the `memo` command is confirmed at once. One an agent adds waits as
`proposed` until you check its evidence and `confirm` it. When the evidence no longer holds, for
example Kai now prefers Mondays, mark it `stale`. `--subject person:…` says who or what the memory is about.

## Facts

A fact records what happened, with its evidence. Its type is `fact`, `statement`, `question`,
`decision` or `promise`.

```sh
memo facts add 'We moved the launch to spring' --type decision --evidence 'msg:telegram/1/77/42'
memo facts list --type decision
memo facts show fact:4
memo facts accept fact:4
```

A fact you add with the `memo` command is accepted at once. One an agent adds waits as `proposed`
until you `accept` it; `author` and `source` say who wrote it. `--project project:1` puts the fact in a project, and `--occurred` gives the date it happened.

A decision can replace an earlier one: add `--supersedes fact:2`. When you accept the new decision,
the old one stops holding. When a decision no longer holds and nothing replaced it, run
`memo facts reverse fact:4`.

## Proposed actions

A proposed action is something an agent wants done in one of your accounts: a reply, an invitation, a
ban in a group. Memo never does it.

```sh
memo actions list --status proposed
memo actions show 5
memo actions approve 5
memo actions reject 5
```

Approving an action makes it a task in the account that would act, so it appears in
`memo tasks list`. You then do it yourself, or ask your agent to do it with tg or max. Rejecting it
closes it, and nothing is done.

An agent proposes an action like this:

```sh
memo actions propose reply --reason 'Kai asked twice' --provider telegram --target 'msg:telegram/1/77/42' --payload '{"text":"Friday works"}'
```

## What agents did

```sh
memo agents log --limit 20
memo agents log --agent memo-mcp
```

The agent log lists every call an agent made through the MCP servers of Memo, tg and max, newest
first: which agent, which tool, the result and the time. It never stores what the agent sent.

## Through the MCP server

An app without a terminal, such as Claude Desktop, can add memories, facts and proposed actions
through [the MCP server](mcp.md). What it adds always waits for you: through MCP an agent cannot
confirm, accept, approve or reject.

Next: [connect an app through MCP](mcp.md).
