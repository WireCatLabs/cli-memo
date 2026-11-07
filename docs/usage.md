# Using Memo

This page shows what a normal day with Memo looks like once it is installed: bringing in what
changed, finding something, preparing for a conversation and saving what you learned. Each step
links to the page with the details. Most of the time you ask your agent and it runs the commands;
the commands are here so you can check what it does.

## Bring in what changed

Memo reads your folders and mailboxes when you ask, not all the time. One command brings in
everything that changed since the last run:

```sh
memo sync
```

Only changed files and new mail are read, so a second run is quick. On Linux, `memo jobs start` runs it
for you every few minutes ([keeping Memo up to date](archive.md)). Telegram, MAX and WhatsApp messages come in
through tg, max and wa, not through Memo.

## Find something

```text prompt
Use memo CLI to find what I wrote or received about the venue for the Harbour project.
Show the matching text and the source of each result.
```

Your agent searches your notes, mail and messages together and shows where each result comes from.
When you know where something is, search only there:

```sh
memo search all 'venue'               # messages, mail, notes and calendar events together
memo search notes 'venue'             # notes only
memo search mail 'from:kai invoice'   # mail only
```

[Search](search.md) explains the search words and how to give your agent the sources.

## Prepare for a conversation

```text prompt
Use memo CLI to show what I know about Kai Sample on Telegram: recent messages, mail and my notes.
Summarise what is still open between us.
```

`memo context telegram:"Kai Sample"` gathers the person's recent messages, mail and the notes linked
to them, each with its source. See [People and projects](people.md).

## Save what you learned

```sh
memo notes add 'Prefers calls in the morning' --subject telegram:'Kai Sample'
memo tags add follow-up --note note:NOTE_ID
memo tasks add --project HRB --title 'Book the venue'
```

A note keeps your own words about a person, a message or a project ([notes](notes.md#write-your-own-notes)).
A tag is a label that helps you find things again ([tags](tags.md)). A task is something to do
([tasks](tasks.md)).

## Review what your agent suggested

An agent can propose an action, such as a reply. An app connected through MCP can also save
memories and facts. These wait for you:

```text prompt
Use memo CLI to show the memories, facts and actions waiting for my review, with their evidence.
Do not confirm or approve anything; I will decide.
```

[Memories and facts](memories.md) explains how to confirm or reject them. Approving an action makes
it a task for you; Memo never sends anything. A memory or fact your agent adds with the `memo` command
waits for you too: memo records the agent as its author when `AI_AGENT` or `CLAUDECODE` is set. One you
add yourself is confirmed (memory) or accepted (fact) at once.

Project proposals use a separate [review flow](recipes.md#review-project-facts-and-follow-ups).
By default only you decide them. Set [`agent_decisions: true`](configuration.md#agent_decisions) to let
an agent decide them with a recorded reason, creating accepted facts and numbered tasks. Meeting findings
still require the owner.

## Keep track of money

Invoices and payments are rows with an amount, a currency and a party, not facts. Amounts are decimals such as
`50000.00`, and totals stay per currency: Memo never converts them.

```sh
memo invoices add 50000.00 RUB Bed rental, November --kind receivable --organization organization:3 --project HRB
memo payments add 25000.00 RUB --kind in --organization organization:3 --occurred-time 2026-11-01 --project HRB
memo payments allocate payment:9 invoice:4 25000.00
memo projects status HRB
```

One you add yourself is confirmed at once. One your agent adds waits in `memo review kind:invoice,payment`, and only
you confirm money. A payment the agent reads in a chat becomes a payment or an invoice when you confirm the finding.
`projects status` shows what was billed, paid and is still owed, from confirmed rows only.

A payment allocated to the wrong invoice, or with the wrong amount, is set right with
`memo payments unlink payment:9 invoice:4`, which takes that allocation back, and `payments allocate`, which makes
the right one. A confirmed payment's split is yours to correct: an agent's run is refused.

A source's export, such as a payment sheet, comes in as a records envelope (JSON, or JSONL with a header line).
`memo records check payments.jsonl --account rentals` says what an import would do and writes nothing;
`memo records import` writes it. The same file twice changes nothing, and its invoices and payments wait for you in
`memo review`.

When the file names a party by its own id, such as `organization:client`, its invoices and payments wait until you
say which of your entries that is. `memo records list waiting:true --account sheet:rentals` shows what waits, and
`memo records link organization:client organization:3 --account sheet:rentals` links it; only you can.

## Track deals and leads

A deal is what you hope to sell: a title, the client, the expected amount and the stage it is in. A lead is a first
contact, before it is a deal. Each stands in a pipeline, a list of stages in order; its status (open, won or lost) is
kept apart from the stage. Memo starts with one lead pipeline, `Leads` (new, contacted, qualified, won, lost).

```sh
memo pipelines add Sales Call Quote Contract won lost
memo deals add 'Site for the clinic' Call 500000.00 RUB --organization organization:3 --project HRB
memo deals move deal:5 Quote
memo deals close deal:5 won
memo leads add 'Call from the site'
memo pipelines show Sales
```

Your agent writes deals, leads and pipelines as you do, at once. To limit what it may do over MCP, set the
[`permissions`](configuration.md#permissions) keys, such as `"deals": "readonly"`. Two CRM accounts may each have a
pipeline named Sales: name one by its reference, `pipeline:3`. `pipelines show` counts, per stage, how many deals
reached it and the share that went on to the next. `projects status` lists up to five open deals of the project.

## Answers for scripts and agents

Add `--json` to most commands to get an answer a program can read. The text answer is for people;
agents and scripts should ask for JSON.

Every result names its source with a **reference**, such as `note:12`, `document:3` or
`msg:telegram/1/77/42`. You can pass a reference to other commands: to tag it, write a note about
it or use it as evidence. [How Memo works](how-it-works.md#references) explains each kind.

Every JSON answer has the same shape. One thing is under `item`; a list is under `items`, with `page`
saying whether more follow (`page.has_more`). `meta` names the run and the accounts read, and `missing`, when
present, says what the answer could not cover and why. `--json=a,b` keeps only those fields of the item or of
each item in the list. Dotted paths traverse nested objects and arrays. Use
`--json=ref,excerpt` for compact `memo search all` hits. Paths are relative to the answer payload;
pagination, coverage, next steps, missing data and execution metadata remain. Field selection
reduces printed output, not the work scanned.

Where a search answer keeps its references:

| Command | Reference of each result |
|---|---|
| `memo search messages`, `memo search mail` | `items[].ref`, as in `tg personal search messages` |
| `memo search all` | `items[].ref`, with `kind`; `next` lists the open tasks that point at a result (`tasks list source:"<ref>"`) |
| `memo search notes` | `items[].ref` |

`content:` narrows a search to the text of files, `transcript:` to voice transcripts and `filename:` to file
names. Compare like with like: `memo search messages 'content:invoice'` with
`tg personal search messages 'content:invoice'`, a plain word with a plain word.

## Choosing an account

When you have several Telegram, MAX or mail accounts, Memo does not choose one for you. Name accounts
with `--source`: one account as `telegram:1` or `email:work`, every account of a messenger as `telegram`,
every account of a kind as `mail`, or a saved group as `group:work`; separate several with commas. A list
reads every account it names and says which. A search with no account searches all of them and says so;
so do `memo tasks list` and `memo reminders list` (a project's tasks need `project:<key>`). A notes folder is an account too: `notes:<number>`, with the
number search results give as `folder_id`.

A command that changes something, such as adding a task or a reminder, acts as one account. Name it with
`--account` as provider and account together: `--account telegram:1`, `--account email:work`. Without it,
Memo tells you which accounts exist.

Reads use `--source`; account-scoped writes use `--account provider:account`. Retired selection flags are refused.

### Groups of accounts

A group keeps work apart from the rest. Put an account in one with `memo groups add work bitrix24:acme`, and
read only that group by naming it first: `memo work search all "renewal"`, `memo work context person:5`.
`MEMO_GROUP=work` does the same for every command. In a group, a read takes only the group's accounts; an explicit
`--source` narrows inside it, and an account outside it is refused, as is a write's `--account` or a reference
(`msg:…`, `chat:…`) to an account outside it.

`memo groups list` shows each group with its accounts, every app's profile names for each (`tg work`, `b24 work`),
why each is in, and the other groups that hold it too. An account may be in several groups; the list names those
duplicates. A profile named like a group is only a suggestion; it never puts an account in a group.

`personal` always exists: every account in no other group, plus any you add to it, and the notes you write with
`memo notes add`. With no group saved, `personal` is every account. `--source personal` is not this group: it means
your own messenger accounts, not bots. The group is `memo personal …` or `--source group:personal`, and every answer
names the accounts it read.

`memo groups remove work telegram:102` takes an account out, and `memo groups move telegram:102 personal work`
moves it in one write. Without a lock, a group is a convenience, not a boundary: any run without the word still
reads every account. To pin a process to one group, see [the MCP lock](mcp.md#lock-an-agent-to-a-group).
