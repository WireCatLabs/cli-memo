# Search

This page helps you find something you wrote or received, in your notes, your mail or your Telegram
and MAX messages, and give your agent the sources behind an answer. Every result names its source,
so you can open the original and check it. An empty result means this search returned no match.
The selected sources, imported history or search index may still be incomplete.

## Ask your agent

```text prompt
Use memo CLI to find what was agreed about the Harbour budget, in my notes, mail and messages.
Quote the matching text, show the source of each result and tell me what you could not search.
```

Your agent picks the search, reads the matching text and shows you the sources. You can check each
one with `memo notes show` or in the original app.

## Choose where to search

| Where it is | Command |
|---|---|
| You do not know | `memo search all 'budget'` |
| Your notes and files | `memo search notes 'budget'` |
| Your email | `memo search mail 'budget'` |
| Telegram or MAX messages | `memo search messages 'budget'` |
| Stored meeting transcripts and summaries | `memo search meetings 'budget' --source zoom:work` |
| A person, by name, username or alias | `memo search people kai` |

`search all` looks in messages, mail and notes together. It does not search meetings, people, memories,
projects or tasks; use `memo search people`, `memo context`, `memo search memories` and `memo tasks list` for those.
When you know where something is, its own search is better, because it understands more search
words.

## Search words

A search finds results that contain **every** word you type, including other forms of the word
(`meeting` also finds `meetings`).

| To find | Type |
|---|---|
| All of these words | `budget venue` |
| An exact phrase | `"budget review"` |
| One word or another | `budget OR invoice` |
| Without a word | `budget NOT cancelled` |
| With a tag | `tag:follow-up` |
| On a day, or from a day on | `date:2026-10-08`, `date:[2026-09-01 TO *]` |
| From or to someone (mail and messages) | `from:kai`, `to:kai@example.com` |
| In the subject or a mail folder (mail) | `subject:invoice`, `mailbox:important` |
| Inside an attached file (messages and mail) | `content:invoice`, `filename:*.pdf` |

`content:` narrows a search to the text of files and `filename:` to their names:
`memo search messages 'content:invoice'`. A file's text is there once tg or max has read it
(`tg personal attachments extract`) or an agent has written it.

Put the search in single quotes so the terminal passes it to Memo as it is:
`memo search notes '"budget review" NOT cancelled'`. `--exact` matches words only as written.

## Narrow down your notes

```sh
memo search notes 'budget' --filter 'tag:work'          # only notes with a tag
memo search notes 'budget' --source notes:2              # only one folder, by the id a hit shows
memo search notes 'budget source:internal'               # only notes you wrote in Memo
memo search notes 'budget' --filter 'date:2026-10-08'    # and a second condition
```

`source:file` shows only notes from files. The query field `source:` is the note's own source; the `--source`
option is different: it chooses which folders are read. Results come 20 at a time; when there are more, `--page 2`
shows the next page, and the answer's `page.next_page` says which page that is.

## Search mail

```sh
memo search mail 'from:kai subject:invoice'
memo search mail 'mailbox:important budget'
memo search mail 'budget' --source email:you@example.com
```

`mailbox:` finds a mail folder or a Gmail label, such as `inbox`, `important` or `starred`. Without
`--source`, Memo searches every mail account; `--source email:work,email:personal` searches those two. Text inside attachments is searched too
(`filename:` and `content:`).

## Search stored meetings

Once Zoom has archived your meetings into the shared store, Memo can find matching transcript passages,
meeting titles, summaries and chat text locally. It does not contact Zoom or send text to a model.
Use your stored account name in place of `zoom:work`. `--source zoom` also works when the store has
exactly one Zoom account; an ambiguous selection lists the accounts to choose from:

```sh
memo search meetings 'budget' --source zoom:work --project HRB --since-time 2026-10-01 --limit 10 --json
memo meetings passage 'meeting:1/42/3/0' --source zoom:work --before-n 2 --after-n 2 --json
```

Copy a hit's `ref` into the passage command. A transcript hit has a cue reference such as
`meeting:1/42/3/0`, its parent meeting reference and `offset_ms`. A title, summary or chat hit points
to the meeting; passage reading requires a transcript cue. The passage includes nearby cues, speaker
labels, revision and fingerprints so an agent can cite exactly what it read. Preserve a null speaker
as unknown; a label alone does not establish a person's identity.

`--project` accepts a project key, name or recorded alias and selects confirmed meeting links.
The MCP `search_meetings` tool also accepts `tag` and `topic` with existing labels and their aliases.
A project word in a transcript does
not link the meeting to that project. To discover unlinked meetings, search the project's different
names separately without `--project`, then review the matches. MCP `identity_id` and `person_id`
select meetings with observed participants; they do not restrict results to that person's speech.

Meeting search uses its own word query and flags; the mail/message query fields above do not apply.
Use `memo search meetings --help` for date and project options; MCP also has event and series selectors.
JSON answers have the standard
`items`, `page`, `next` and `meta.accounts`; use the returned cursor with the same account and filters.
The `missing` field reports unknown archive completeness. Even when indexing is ready, an empty search
cannot prove that no meeting discussed the subject. If passages changed during indexing, rerun the
search as its next step suggests. An unarchived or missing transcript must first be obtained with Zoom.

Next, [turn cited meeting passages into findings for review](recipes.md#review-a-meetings-decisions-and-follow-ups).

## Gather a project's meeting context

When preparing for a project discussion, gather its different names across your selected accounts.
This finds transcript cues even before a meeting has been linked to the project. Ask your agent:

```text prompt
Use memo CLI to gather Harbour project evidence from my work meeting account and Telegram.
Search the last 60 days using the project's recorded aliases. Show cited passages, separate
reported facts from suggested follow-ups, and tell me which sources or transcripts are missing.
Do not confirm findings or create tasks.
```

For direct command use, replace the project key and account names with yours:

```sh
memo projects evidence HRB --source zoom:work,telegram:1 --since-time 60d --json
```

To compare runs over the same time window, set an exact exclusive end with `--before-time`:

```sh
memo projects evidence HRB --source zoom:work,telegram:1 --since-time 60d --before-time 2026-10-01T12:00:00Z --json
```

Days back are counted from that timestamp. An explicit `--since-time` start date also keeps this end;
the start is included and the end is excluded. Use a real timestamp with `Z` or a UTC offset, not a date
alone. Text output prints the exact cutoff. Keep `--before-time` and the other options unchanged when using
`--cursor`. A fixed window does not freeze source contents, registered aliases or account selection:
later imports, edits or deletions can still change the evidence.

Each name or alias is a separate search: every word of it must appear in one text, in any order, as whole
words; hits are joined. Every message of a chat confirmed as the project's is read too when `--source` holds
its account. Those items are labelled `linked-chat`: they name nothing, they belong to the chat. One run takes at
most a share of the item limit from each linked chat (50 for one chat at the default 100, 20 from four chats up);
a chat with more is listed as capped and `--cursor` reads the rest. A linked chat
outside `--source` is listed as not read. `--contact person:<id>` reads every message and mail that person's
stored identities wrote in `--source`, labelled `sender` (matched by who wrote it, not by words), and searches
the aliases you gave them; their messenger display name is not searched, since texts rarely spell it out. A
literal `--contact "<name>"` is searched as words. A meeting hit retains its
exact cue reference and uses the meeting start date, so an old meeting imported today stays old.
Read a relevant cue and its neighbours with `memo meetings passage` before drawing conclusions.
Gathering does not create project links, establish attendees or save extracted facts and tasks.

To see who is involved, read `people` in the `--json` result (text output prints one "people who wrote these" line):
who wrote this run's messages and emails, counted from the stored contacts, never by matching names in the text. A
person's identities in several messengers and mail count as one entry when they are linked ([link a person's accounts](people.md#link-a-persons-accounts));
an identity linked to no one is its own entry. Your own messages are left out. Each run counts only its own new items,
so add the counts up across `--cursor` runs.

A document hit includes short paragraphs around the first paragraph naming a searched word. They
help locate the passage; they do not establish that a conclusion is supported. If `oversized` lists
a document, gathering did not read its text: open its returned reference with `memo notes show` when
needed. Keep the unread source in the result rather than calling that evidence absent.

If `units` reports a pending meeting index, run `memo search meetings` for the same account through
the [meeting search workflow](#search-stored-meetings), then gather again. Mail/document catch-up
does not index transcript cues. Missing transcripts must first be archived by their meeting tool;
finished pagination still leaves archive completeness unknown.

Use a returned checkpoint with the same options and `--cursor` to continue a bounded run. Check
whether sources actually made progress: repeated empty pages with the same failed source state do
not establish complete coverage. Keep the unresolved sources in the answer rather than retrying forever.

For facts and follow-ups supported by stored messages, imported mail or files,
[review project proposals with their evidence](recipes.md#review-project-facts-and-follow-ups).
Transcript cue references use the separate
[meeting findings review](recipes.md#review-a-meetings-decisions-and-follow-ups), which requires confirmed
meeting-to-project links. Gathering itself creates neither kind of proposal.

## Search by meaning

With the search model on your computer, Memo also searches by meaning, so `holiday` can find a note
about a vacation. tg or max downloads the model once:

```sh
memo models download e5-small
```

The model runs on your computer. After the download, run `memo sync` so your notes are prepared
for it. Each result says whether it was found by words, by meaning or both. Without the model,
Memo says "Searched by words only" and searches stored notes by words.

## What a result shows

For a note, a result shows the file and the first matching line. Below the results, Memo lists the
notes and people that the results link to:

```text
Projects/Budget.md
  # Budget review

Linked from these notes
  Kai Sample  (nobody by that name yet)  (1)
```

`nobody by that name yet` means the note links to a name that is not a known person in the local
store yet. Add `--json` to get each result's reference, its links and how it was found.

## Give your agent the sources

`memo answers create` collects the sources for a question, so your agent can answer and cite them:

```sh
memo answers create 'What is the Harbour budget?' 'Harbour budget' --all
```

The words after the question are what Memo searches for; without them, Memo searches for the whole
question, and every word must match. `--all` searches every account; use `--source telegram:1` for one
account. The answer lists each source with its reference and text, what was searched and whether
anything was left out. Memo does not answer the question itself and does not save the answer.

Memo can also send the sources to an AI provider you set up and return its answer: add `--analyze`,
and `--allow-remote` for a provider outside your computer. See
[configuration](configuration.md#environment-variables). The provider's answer is generated text:
check it against the sources.

Next: [see everything about one person](people.md), or [turn what you found into a task](tasks.md).

## Meeting reader scope

Memo and zm share cli-core's meeting search selectors and parsers: meeting, identity, person, event and
series ids; project, tag and topic; time bounds, cursor and read budget. Memo selects tags/topics in
the native query (`tag:` and `topic:`); stored topic labels can also use the shared `--topic-name` selector. For example:

```sh
memo search meetings "draft topic:finance" --source zoom:work --meeting-id 12
```

Their account selection differs: Memo needs one stored `--source provider:account`; zm selects its account
with its profile argument. Memo's `meetings passage` reuses the shared passage grammar, and `meetings prepare`
reuses the shared preparation builder and answer schema. Their JSON evidence and coverage retain the shared
shape; the text summaries describe each tool's actual reads.

Memo reads stored archives. Its preparation summary leaves the next meeting time unverified because it does
not read a provider calendar. zm can use its selected provider connection to check that schedule.
zm also adds optional semantic search and remote embedding settings around the shared search grammar;
Memo's meeting search is the stored word-search path. Those options require a separate embedding workflow
and are not part of Memo's current meeting reader. Memo's `search notes` and `search all` still support the
shared local meaning model for notes and mail.
