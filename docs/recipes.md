# Recipes

This page gives you whole tasks to hand to your AI agent once Memo has your notes, mail or messages.
Copy a request into your agent and change the names and topics to yours. Each one ends with
something you can check: sources you can open, or a list waiting for your decision. None of them
sends a message or changes your files.

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

## Find where something was decided

```text prompt
Use memo CLI to find where we decided the launch date for the Harbour project.
Search my notes, mail and messages. Quote the text and show the source of each result.
If you find nothing, tell me what you searched.
```

Your agent uses `memo search all`, then the search for one kind of source if needed. An empty answer
means only that the local store has no match ([search](search.md)).

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

A memory added with the `memo` command is confirmed at once, so the request asks your agent to
show it first. Later, `memo memories stale` marks it when it no longer holds ([memories](memories.md)).

## Record a decision from a chat

```text prompt
Use memo CLI to find the decision about the venue in the Harbour chat.
Show me the decision and the message first. After I agree, record it as a decision fact
with the message as evidence, in the Harbour project.
```

A fact added with the `memo` command is accepted at once, so the request asks your agent to show it
first. If it replaces an earlier decision, ask your agent to mark that with `--supersedes`.

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
