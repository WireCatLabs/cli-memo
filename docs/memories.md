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

For sources gathered across a project, use the [project proposal review](recipes.md#review-project-facts-and-follow-ups).
By default only you decide those proposals. Set [`agent_decisions: true`](configuration.md#agent_decisions)
to let an agent decide them with a recorded reason, creating accepted facts and numbered tasks. Meeting findings decisions require explicit permissions.

**What waits for you.** A proposed action always waits until you approve or reject it. A memory or
directly recorded fact waits when an agent adds it: through [the MCP server](mcp.md), or with the `memo` command in an
agent's terminal (`AI_AGENT` or `CLAUDECODE` set), where the agent is recorded as its author. One you
add yourself at a terminal is confirmed (memory) or accepted (fact) at once; in an agent's terminal, `--as-owner`
makes it yours after you answer y at the terminal. WireCat Desktop passes `--from-app`, which records what you
do in the app as yours.

## Memories

A memory is a short conclusion with its **evidence**: the references of the messages, notes or
meetings that show it. It has a kind and a scope:

- kind: `preference` (what someone likes or wants), `summary` or `digest`;
- scope: `personal` or `work`.

```sh
memo memories add 'Kai Sample prefers Friday meetings' --kind preference --scope work --evidence note:12
memo memories list kind:preference scope:work
memo memories show memory:3 --sources
memo search memories friday meetings scope:work
memo memories confirm memory:3
memo memories invalidate memory:3
```

A memory you add with the `memo` command is confirmed at once. One an agent adds waits as
`proposed` until you check its evidence and `confirm` it. When the evidence no longer holds, for
example Kai now prefers Mondays, mark it `stale`. `--subject person:…` says who or what the memory is about.
`--project SYH` puts it in a project, by key or `project:<id>`; `memories update memory:4 --project LHT` moves it, and
`--project none` takes it out.
`memories list` narrows by `kind`, `status`, `scope`, `subject` and `project` in its query: `subject:"person:42"`,
`project:SYH`.
Each memory carries `subject_name`, what its subject is called, `subject_is_owner` when it is about you, and
`project_name` beside `project`.
`show --sources` reads each piece of evidence back: the sender or title, the time, a short excerpt, and
`missing: true` when the source was deleted since.

## Correct or forget

Three ways to deal with a wrong memory or fact, from keeping the most to keeping nothing:

```sh
memo memories add 'Kai Sample prefers Monday calls' --kind preference --scope work --evidence note:12 --supersedes memory:3
memo memories invalidate memory:3
memo memories remove memory:3
memo facts reject fact:4
memo facts remove fact:4
```

- **Correct**: add the right memory with `--supersedes`. The old one stays, marked `superseded`, so you keep a
  record of the mistake. Yours applies at once. An agent's correction waits as proposed until you confirm it, and
  the memory it corrects stays as it is until then; rejecting or removing the correction leaves it. A memory is
  superseded once only.
- **No longer true**: `invalidate` marks a memory `stale`; `facts reverse` does it for an accepted decision, and
  `facts reject` turns down a fact an agent proposed. Each keeps the record.
- **Forget**: `remove` erases the record: its text, its links to its sources and its entry in Memo's search. The
  messages, notes and meetings it cites stay. A store backup made before keeps it, until that backup is deleted.

An agent cannot forget or reject through the MCP server; a correction it proposes there waits for you like any other.

## When a source changes

A memory or fact rests on its sources. When one of them changes, goes or is contradicted, memo opens a
**source review** for you and marks the record, but never changes its status: it stays confirmed or accepted until
you decide.

**See it.** `memo sync` ends with the step "memories follow sources", so the timer checks for you. To check now:

```sh
memo memories check
memo review list kind:memory_source_review
memo memories show memory:3
```

`memories show`, `memories list`, `facts show` and `facts list` carry `source_review`: the open review's id and its
cause, or `null`. The causes, from the mildest:

- `changed`: a source was edited, and the words the record rests on are gone or were never quoted;
- `outdated`: a cited memory or fact was itself replaced or withdrawn; the review names what replaced it;
- `deleted`: a source was deleted;
- `contradicted`: you or an agent ran `challenge` with evidence that says otherwise.

A source that changed but still says the quoted words raises nothing. A record written before memo kept
signatures raises a review only when its source changed after it was cited. `memo review agenda` lists the reviews
raised within `--since-time` (a day unless you say) in its `sources` section, with the sources found changed in
that time that no review names; a review that only grew in place is not listed again.

**Decide it.**

```sh
memo review show 17090
memo review confirm 17090
memo review reject 17090 --reason 'the edit is a typo fix'
```

`review show` gives each source as it was cited and as it is now, the quote, every challenge with its evidence and
reason, and any suggested wording, then the command for each answer:

- **Still true**: `review confirm`. A memory counts as checked now.
- **Dismiss**: `review reject --reason`.
- **Correct or replace**: add the right one with `memories add … --supersedes memory:3` or `facts add …
  --supersedes fact:4`, as in [Correct or forget](#correct-or-forget).
- **Withdraw**: `memories invalidate memory:3` or `facts reverse fact:4`.

Confirm and reject sign the sources again as they are now, so the same change does not come back. Only you decide a
source review. WireCat Desktop passes `--from-app`, which records the decision as yours.

**Find the original evidence.** `memories show memory:3 --sources` reads each cited source back as it is now and
says `missing: true` once one is gone; `review show` adds the text as it was cited, for notes, documents and
messages.

**For agents.** An agent may look and propose, never decide:

```sh
memo memories check --json
memo memories challenge memory:3 --evidence note:15 --reason 'the later note moves delivery to the 30th' --suggest 'Delivery is on the 30th'
memo facts challenge fact:4 --evidence 'msg:telegram/1/77/50' --reason 'the decision was reversed in chat'
memo memories add 'Delivery is on the 28th' --kind preference --scope work --evidence note:12 --quote 'note:12=delivery on the 28th'
```

- `memories check --json` answers `checked`, `baselined`, `raised`, `refreshed`, `closed` and `changed_refs`. The last
  lists changed sources that no findings batch reads yet; read those again and stage what is new with
  `memo projects actions add`. A run names a change once, and `memo sync` usually finds it first, so
  `memories check --since-time 1d` also lists what earlier runs found changed since then. The agenda's `sources`
  section lists them too.
- `challenge` opens the record's source review, or adds to the open one, with the evidence, the reason and an optional
  `--suggest`. It changes nothing else.
- `--quote <ref>=<words>` on `memories add` and `facts add` stores the words of an `--evidence` reference the record
  rests on, so a later edit that keeps them raises nothing. A quote the source does not say is refused
  (`evidence.quote-not-found`), and so is one that names no `--evidence` reference (`evidence.quote-unmatched`).
- `review confirm` and `review reject` refuse an agent on a source review (`proposal.owner-only`), whatever its
  permissions and `agent_decisions` say.

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
until you run `memo facts confirm`; `author` and `source` say who wrote it. `facts list` narrows by `kind`,
`status`, `project` and `subject` in its query. `--project project:1` puts the fact in a project, and `--occurred-time` gives the date it happened.

To correct a fact of any kind, add the right one with `--supersedes fact:2`. The old one stays, marked
`superseded` once the new one is accepted, which yours is at once. Only a proposed or accepted fact can be corrected.
An agent may propose a correction of another proposed fact; one you accepted only you correct. When a decision no longer holds and nothing replaced it, run
`memo facts reverse fact:4`.

## Meeting findings

After reading meeting evidence, ask your agent to propose the decisions and follow-up work you want to keep. Review the cited cues before creating records. A project-name match alone does not establish membership: the meeting must already have a confirmed link to the project.

The agent stages a JSON batch through `memo meetings actions add`. Each finding names an ID, a project and exact cue references with the fingerprints returned by `zm meetings evidence`. Facts retain their kind, such as `decision` or `promise`; tasks say whether a commitment was explicit or an inferred follow-up. Unknown dates and assignees stay absent; supplied values need their own supporting cues.

```sh
memo meetings actions add findings.json --account zoom:me@example.com
memo meetings actions list status:proposed --source zoom:me@example.com
memo meetings actions show 5 --source zoom:me@example.com
```

The file uses `schema_version: 1`, a stable `key`, `extractor` and `findings`. Each finding has `id`, `kind`, `project` and `evidence` (objects with `reference` and `fingerprint`). A fact adds `type` and `statement`. A task adds `type` (`bug`, `chore` or `feature`), `title`, `reason` and `commitment` (`explicit` or `inferred`). Optional `due_at` is an ISO timestamp with a timezone and needs `due_evidence`; optional `assignee` is a `person:<id>` reference and needs `assignee_evidence`, both listing supporting cue references. `-` reads JSON from stdin. The batch accepts up to 16 findings and 65,536 UTF-8 bytes.

Staging creates no fact or task. Your preview shows previous decisions on unchanged candidates. Open the sources, then personally confirm the candidate IDs you want to keep, or reject the batch. Replace the hash below with the preview's exact fingerprint:

```sh
memo meetings actions confirm 5 decision followup --fingerprint <hash> --account zoom:me@example.com
memo meetings actions reject 5 --fingerprint <hash> --account zoom:me@example.com
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
memo actions add reply --reason 'Kai asked twice' --account telegram:1 --target 'msg:telegram/1/77/42' --payload '{"text":"Friday works"}'
```

## What agents did

```sh
memo agents list --limit 20
memo agents list agent:memo-mcp
```

The shared agent log lists commands that reach Memo’s executor and calls recorded by tg and max, newest
first: which agent, which tool, the result and the time. It never stores what the agent sent.

## Through the MCP server

An app without a terminal, such as Claude Desktop, can add memories, facts and proposed actions
through [the MCP server](mcp.md). New records start as proposed. The command tools can confirm memories,
accept facts and decide actions when their saved permissions allow it. Project proposal decisions also
respect `agent_decisions`, as described above.

Next: [connect an app through MCP](mcp.md).
