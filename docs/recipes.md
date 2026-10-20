# Recipes

This page gives you whole tasks to hand to your AI agent once Memo has your notes, mail or messages.
Copy a request into your agent and change the names and topics to yours. Each one ends with
something you can check: sources you can open, or a list waiting for your decision. Saving a record
changes Memo's local store; exporting a note creates a file. These requests do not ask your agent
to send a message.

## Prepare for a meeting with someone

```text prompt
Use memo CLI to prepare me for a meeting with Kai Sample tomorrow.
Show our recent messages and mail, my notes about Kai and the open tasks between us.
Give me three points to raise, each with its source.
```

Your agent runs `memo context` for the person and reads the sources. Check the points against the
sources it shows. If a part is empty, the chats may not be downloaded or the accounts not linked
([people](people.md)).

If you have archived meetings from the same recurring series, ask your agent to include them:

```text prompt
Prepare for my next Harbour meeting. Find the exact meeting series in my selected Zoom account,
then gather its archived discussions, linked people and projects, notes and open tasks.
Also search the stored messages in my personal Telegram profile for Harbour over the last month.
Suggest an agenda with sources. Separate proposals from agreed actions and say what history is missing.
Do not claim that a future time is verified from the local archive.
```

The agent uses `memo meetings prepare <series-id> --source <provider>:<account>` with the provider's
exact series ID, which Zoom's meeting list can show. The ID is not a local meeting number. This reads
stored history only: it needs no new Zoom permission and does not check the calendar. Use the provider's
calendar to verify a future occurrence. An unarchived series can still have selected message context,
but Memo cannot invent its missing transcripts.

Messages and mail are included only when selected. `--context-source tg.personal` means the stored
`personal` profile of `tg`; `max.personal` works the same way. `email.work` means a mailbox called `work`
in Memo's mail settings. The profile or mailbox must already be stored. Repeat the flag for up to eight
accounts and give `--context-query Harbour`. Every literal word must match; `OR` is not an alias operator.
Use separate queries for alternative names. This selection does not include file notes or documents;
read those separately with [project context](people.md#organizations-and-projects) and [search](search.md).

For a fixed period, give zoned timestamps with `--context-since-time` and the exclusive
`--context-before-time`. Defaults cover fourteen days before the preparation start; a communications
window cannot exceed ninety days. `--history-since-time` separately controls earlier meetings.
Add `--json` for cited evidence, linked context and coverage. Each communications source reports its
index state and, when possible, `next_cursor`; continue with `--context-source tg.personal=<cursor>`
and the same query and explicit window. If `restart_required` is true, increase `--bytes` and restart;
do not assume the displayed excerpts cover every match. Nothing is accepted or assigned by preparation.

## Review a meeting's decisions and follow-ups

Use this after your meeting transcripts are archived. Your agent can read evidence in Memo, suggest
what matters and leave the result for your decision:

```text prompt
Review the recent Harbour meetings in my selected Zoom account. Look up the project's existing
aliases and tags first. Search the stored transcripts and read the surrounding passages.
Show observed attendees separately from people merely mentioned. Propose decisions, key statements
and follow-up tasks, citing each exact passage. Leave unknown dates and assignees blank, distinguish
explicit commitments from inferred tasks, and leave everything proposed for my review.
```

For attendee lists, the agent reads archived meeting metadata with `zm meetings show`; transcript
speaker labels alone are not an attendance roster. The agent uses `memo search meetings` and
`memo meetings passage`, then stages a batch with
`memo meetings actions add` using the cue references and fingerprints. This creates a review proposal;
it does not immediately create accepted facts or tasks. Confirmed meeting-to-project links must already
exist for project findings. If they are missing, the agent should show candidate links for review.
Use existing tags rather than creating synonyms; `memo vocabulary check` can suggest similar names,
but similarity does not establish that two tags mean the same thing.

Review the batch with `memo meetings actions list status:proposed` and `memo meetings actions show`.
Check each claim against its source before confirming selected finding IDs with the batch's current
fingerprint. Only you can confirm or reject a meeting findings batch; an agent cannot approve its own
work. Accepted tasks use the project's numbered keys. Repeating an identical batch key retries it
without duplicating the proposal; changing the contents requires a new key.

For preparation, ask the agent to combine the earlier meeting passages with the project's accepted
facts and open tasks (`memo projects context`) and the participants' messages, mail and notes
(`memo context`). `memo meetings prepare` gathers bounded stored series history and linked context;
it does not locate an upcoming calendar event or infer project membership.
The answer should show its sources and missing history before it suggests an agenda.

If no passages appear, check the selected account and archive coverage, then try project aliases
without a project filter. [Meeting search](search.md#search-stored-meetings) explains these boundaries.

## Review project facts and follow-ups

Use this when a project's evidence is spread across stored messages, imported mail and files.
Memo keeps the agent's suggestions with their sources so you can review key documents, facts and
follow-ups together. The project must already exist; [project names and aliases](people.md#organizations-and-projects)
help the agent reuse it. Source accounts must already be imported or synced.

```text prompt
Use memo CLI to gather Harbour project evidence from my personal Telegram profile and work mail.
Read the project's key documents first and reuse its recorded aliases. Search the last 60 days,
show the selected accounts and dates, and say which history is missing or incomplete.
Read the cited sources before suggesting facts or follow-ups. Leave unknown dates and assignees
blank, and distinguish explicit commitments from inferred follow-ups.
Propose the key documents and findings for my review. Show the proposals with their source context.
Do not confirm or reject anything.
```

The agent starts with `memo projects context`, then gathers cited sources with
[`memo projects evidence`](search.md#gather-a-projects-meeting-context). Each project name, alias or
extra query is searched separately. A name match does not establish membership, identity or an agreement.
The agent stages selected message/document findings with `memo projects actions add`, using the exact
references and source fingerprints returned by gathering. Fingerprints are check values used to notice
later source changes. This creates a proposal, not accepted facts or tasks.
An exact retry reuses its batch key and input; changed findings need a new key.

For transcript findings, use the [meeting review flow](#review-a-meetings-decisions-and-follow-ups),
which accepts meeting cue references and checks confirmed meeting-to-project links. Project findings
accept `msg:` and `document:` references; a `meeting:` or `note:` reference is not interchangeable.

Inspect the proposals in your terminal, replacing `HRB` with your project's key, name or alias:

```sh
memo projects actions list HRB --limit 5 --page 1 --json
memo projects actions list HRB --brief
```

The normal view includes cited excerpts and nearby messages or document paragraphs. Read the full source when an excerpt is
not enough to judge the claim. `--brief` keeps references and source state without that context.
Key-document suggestions have no saved text fingerprint: their state is `untracked`, so reread them
before deciding. This differs from a finding whose cited text can be checked against its saved fingerprint.
`--limit` counts findings batches; proposed key documents are added on the first page. Use `--page 2`
and later pages while the result reports more. Gathering uses checkpoints; this review list uses page numbers.

Check each finding's meaning, project, date and assignee against its evidence. An exact quote or
unchanged source fingerprint does not establish that a conclusion follows from the text. If a cited
source changed or disappeared, reread it and prepare a fresh proposal for the affected findings. You
can still accept findings whose own project, assignee and cited text are unchanged. Some older batches
require every citation to be unchanged; if those refuse, stage the findings you still want in a new
batch. An obsolete batch can be rejected.

An owner can confirm a key document such as `key:12`, or accept selected finding IDs from a batch.
For example, replace `7`, both finding IDs and `BATCH_FINGERPRINT` with values from the review list:

```sh
memo projects actions confirm HRB 7 launch-status draft-check --fingerprint BATCH_FINGERPRINT
```

Confirming creates the selected findings and rejects the batch's other new findings. Choose the whole
set you want to accept before confirming; leave an undecided batch open. `projects actions reject`
rejects every new finding in a batch. After a decision, `memo projects context HRB` shows accepted facts,
key documents and open numbered tasks; `projects actions list HRB status:reviewed` shows past batch decisions.

By default an agent may decide project proposals with a recorded reason. The request above explicitly
leaves that decision to you. To require owner decisions in this flow, set
[`agent_decisions` to `false`](configuration.md#agent_decisions); this refuses agent confirmations and
rejections through both CLI and MCP. It does not prevent reading or staging proposals. The separate
meeting review flow still leaves confirmation to the owner.

Next, [prepare an agenda using the project's accepted context](#prepare-for-a-meeting-with-someone).

## Find where something was decided

```text prompt
Use memo CLI to find where we decided the launch date for the Harbour project.
Search my notes, mail and messages. Quote the text and show the source of each result.
If you find nothing, tell me what you searched.
```

Your agent uses `memo search all`, then the search for one kind of source if needed. An empty answer
means this search returned no match; check its source coverage before concluding that nothing was
decided ([search](search.md)).

## Turn requests into tasks

```text prompt
Use memo CLI to find messages and emails from the last week where someone asked me to do something.
List them with their sources. Create a task only for the ones I choose.
```

Your agent searches, shows you the requests, and runs `memo tasks add` for the ones you pick. See
your tasks with `memo tasks list` ([tasks](tasks.md)).

## Keep a project's notes together

```text prompt
Use memo CLI to find my notes, emails and messages about the Harbour project.
Tag the ones I confirm with harbour, then show everything tagged harbour.
```

Afterwards `memo search all 'tag:harbour'` finds them, and a tag on a folder covers new notes too
([tags](tags.md)).

## Remember a preference, with its source

```text prompt
Use memo CLI to find what Kai Sample said about meeting times.
Show me the memory you would save and the message it is based on.
Save it with the message as evidence only after I agree.
```

A memory you record directly is confirmed; one added by an agent stays proposed for your review.
Check the claim and its source before confirming it. Later, `memo memories stale` marks memories
that no longer hold ([memories](memories.md)).

## Record a decision from a chat

```text prompt
Use memo CLI to find the decision about the venue in the Harbour chat.
Show me the decision and the message first. After I agree, record it as a decision fact
with the message as evidence, in the Harbour project.
```

A fact you record directly is accepted; one added by an agent stays proposed. The
[project review flow](#review-project-facts-and-follow-ups) keeps cited findings together before a
decision. If a fact replaces an earlier decision, ask your agent to mark that with `--supersedes`.

## Weekly review

```text prompt
Use memo CLI to give me a weekly review: open tasks by project, tasks that are ready to start,
and the memories, facts and actions waiting for my review. Do not approve or confirm anything.
```

Your agent combines `memo tasks list`, `memo tasks list project:HRB ready:true`, and the review lists from
[Memories and facts](memories.md). Decide each item yourself.

## Write a summary into your vault

```text prompt
Use memo CLI to write a short note about the Harbour project that summarises what I know,
with the sources it is based on. Show me the note, then export it to my vault.
```

Your agent writes the note with `memo notes add --subject project:…` and exports it with
`memo notes export` ([notes](notes.md#save-your-notes-as-files)). Memo never overwrites a file you
edited.

## Ask with sources only

```text prompt
Use memo CLI to collect the sources about the Harbour budget with memo ask, using the key words
"Harbour budget". Answer only from those sources and cite each one.
```

`memo ask` collects the sources; your agent answers. Memo sends nothing to an AI provider unless you
set one up and allow it ([search](search.md#give-your-agent-the-sources)).

## Run it on a schedule

On Linux, `memo auto start` keeps your notes and mail current. To run a recipe every morning, use your
agent's own scheduling, or a scheduler on your computer that starts your agent with the request.
