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
memo memories list status:proposed
memo facts list status:proposed
memo actions list status:proposed
```

Open each source, then confirm what is right and leave or reject the rest. The rest of this page
shows how.

For a batch of cited meeting facts and tasks, use the [meeting findings review](#meeting-findings) below.

**What waits for you.** A proposed action always waits until you approve or reject it. A memory or
fact waits when an agent adds it: through [the MCP server](mcp.md), or with the `memo` command in an
agent's terminal (`AI_AGENT` or `CLAUDECODE` set), where the agent is recorded as its author. One you
add yourself is confirmed at once; in an agent's terminal, add `--as-owner` to make it yours. An agent
can pass `--as-owner` too, so tell it not to.

## Memories

A memory is a short conclusion with its **evidence**: the references of the messages, notes or
meetings that show it. It has a kind and a scope:

- kind: `preference` (what someone likes or wants), `summary` or `digest`;
- scope: `personal` or `work`.

```sh
memo memories add 'Kai Sample prefers Friday meetings' --kind preference --scope work --evidence note:12
memo memories list kind:preference scope:work
memo memories show memory:3
memo search memories friday meetings scope:work
memo memories confirm memory:3
memo memories stale memory:3
```

A memory you add with the `memo` command is confirmed at once. One an agent adds waits as
`proposed` until you check its evidence and `confirm` it. When the evidence no longer holds, for
example Kai now prefers Mondays, mark it `stale`. `--subject person:…` says who or what the memory is about.
`memories list` narrows by `kind`, `status`, `scope` and `subject` in its query: `subject:"person:42"`.

## Facts

A fact records what happened, with its evidence. Its kind is `fact`, `statement`, `question`,
`decision` or `promise`.

```sh
memo facts add 'We moved the launch to spring' --kind decision --evidence 'msg:telegram/1/77/42'
memo facts list kind:decision project:HRB
memo facts show fact:4
memo facts confirm fact:4
```

A fact you add with the `memo` command is accepted at once. One an agent adds waits as `proposed`
until you `accept` it; `author` and `origin` say who wrote it. `facts list` narrows by `kind`,
`status`, `project` and `subject` in its query. `--project project:1` puts the fact in a project, and `--occurred-time` gives the date it happened.

A decision can replace an earlier one: add `--supersedes fact:2`. When you accept the new decision,
the old one stops holding. When a decision no longer holds and nothing replaced it, run
`memo facts reverse fact:4`.

## Meeting findings

After reading meeting evidence, ask your agent to propose the decisions and follow-up work you want to keep. Review the cited cues before creating records. A project-name match alone does not establish membership: the meeting must already have a confirmed link to the project.

The agent stages a JSON batch through `memo meetings actions add`. Each finding names an ID, a project and exact cue references with the fingerprints returned by `zm meetings evidence`. Facts retain their kind, such as `decision` or `promise`; tasks say whether a commitment was explicit or an inferred follow-up. Unknown dates and assignees stay absent; supplied values need their own supporting cues.

```sh
memo meetings actions add findings.json --source zoom:me@example.com
memo meetings actions list status:proposed --source zoom:me@example.com
memo meetings actions show 5 --source zoom:me@example.com
```

The file uses `schema_version: 1`, a stable `key`, `extractor` and `findings`. Each finding has `id`, `kind`, `project` and `evidence` (objects with `reference` and `fingerprint`). A fact adds `type` and `statement`. A task adds `type` (`bug`, `chore` or `feature`), `title`, `reason` and `commitment` (`explicit` or `inferred`). Optional `due_at` is an ISO timestamp with a timezone and needs `due_evidence`; optional `assignee` is a `person:<id>` reference and needs `assignee_evidence`, both listing supporting cue references. `-` reads JSON from stdin. The batch accepts up to 16 findings and 65,536 UTF-8 bytes.

Staging creates no fact or task. Your preview shows previous decisions on unchanged candidates. Open the sources, then personally confirm the candidate IDs you want to keep, or reject the batch. Replace the hash below with the preview's exact fingerprint:

```sh
memo meetings actions confirm 5 decision followup --fingerprint <hash> --source zoom:me@example.com
memo meetings actions reject 5 --fingerprint <hash> --source zoom:me@example.com
```

Confirmation creates selected facts and project tasks together and rejects the other new candidates. It sends nothing. A terminal identified as an agent cannot confirm or reject these batches; the owner runs those commands directly. The generic `memo actions confirm` path refuses meeting findings.

Repeating the same batch key and content returns the existing batch. Repeating a review returns its receipt. A later batch reuses accepted references and keeps unchanged rejected candidates rejected; leaving out an existing accepted candidate does not revoke it. This prevents exact retries from duplicating work, not differently worded proposals or records you added elsewhere. Changed sources or project membership make pending review stale: ask for a new preview. Reviewed receipts keep their original citations after later transcript revisions.

## Proposed actions

A proposed action is something an agent wants done in one of your accounts: a reply, an invitation, a
ban in a group. Memo never does it.

```sh
memo actions list status:proposed
memo actions show 5
memo actions confirm 5
memo actions reject 5
```

Approving an action makes it a task in the account that would act, so it appears in
`memo tasks list`. You then do it yourself, or ask your agent to do it with tg or max. Rejecting it
closes it, and nothing is done.

An agent proposes an action like this:

```sh
memo actions add reply --reason 'Kai asked twice' --source telegram:1 --target 'msg:telegram/1/77/42' --payload '{"text":"Friday works"}'
```

## What agents did

```sh
memo agents log --limit 20
memo agents log agent:memo-mcp
```

The agent log lists every call an agent made through the MCP servers of Memo, tg and max, newest
first: which agent, which tool, the result and the time. It never stores what the agent sent.

## Through the MCP server

An app without a terminal, such as Claude Desktop, can add memories, facts and proposed actions
through [the MCP server](mcp.md). What it adds always waits for you: through MCP an agent cannot
confirm, accept, approve or reject.

Next: [connect an app through MCP](mcp.md).
