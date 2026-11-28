<!-- Generated from the command tree by pnpm generate. Do not edit. -->

# All commands

Look up every wcat command and option here. A command that reads names its accounts with `--source`: one as `telegram:1` or `email:work`, every account of a provider, a kind, or `group:<name>`. A command that writes names the one account it acts as with `--account telegram:1`. wcat never chooses an account for you. Add `--json` for an answer a script or agent can read. See [recipes](recipes.md) for whole tasks, [using wcat](usage.md) for a normal day and [the files CLI](https://wirecat.dev/en/docs/files) for notes and documents.

## Global options

These options work with the `wcat` command itself.

| Option | What it does |
|---|---|
| `-V, --version` | output the version number. |
| `--debug` | on failure, show the full error record: cause and stack. |
| `--record` | keep this run even where the config says record false; record_input false leaves the typed words out. |
| `--no-record` | do not keep this run, even if it fails. |
| `--compact` | one line per item for an agent: reference first, text last, paging and next steps as # lines. |

## `wcat context`

messages, mail, notes and events about a person, each with a link to its source, and `business`: their organizations, reporting lines, deals and projects, each relationship with its standing (`reported` is a CRM's word only). person:<id> reads every account; `coverage` names what was read and what was not. `proposals` counts what waits for you about them, by kind (`complete: false` means at least), and `next` names the command that lists them

```sh
wcat context <person> [options]
```

| Argument | | What it is |
|---|---|---|
| `person` | required | <messenger>:<name or id>, e.g. telegram:Ana or email:ana@example.com, person:<id>, or person:me for you. |

| Option | What it does |
|---|---|
| `--limit <n>` | most messages, notes and events of each kind, and history items. Default: `20`. |
| `--since-time <time>` | the history from this time: hours or days back (12h, 7d) or a date (2026-11-01); the newest when left out. |
| `--before-time <time>` | the history before this ISO time or date: what `history.before_time` gives, to page back. |
| `--json` | print JSON; --json=id,title keeps only those fields. |
| `--source <accounts>` | the accounts to read: every one when left out, or the group's in a group run; for <messenger>:<name>, the one account of that messenger. |
| `--trimmed` | each email's own text, without quoted earlier mail or the signature — for an agent's reads. |

**Example:** `wcat context telegram:'Kai Sample'`, `wcat context email:kai@example.com --limit 5 --json`, `wcat context person:7 --before-time 2026-10-01T00:00:00Z --json`

## `wcat show`

what any reference names, and the command that opens it

```sh
wcat show <ref> [options]
```

| Argument | | What it is |
|---|---|---|
| `ref` | required | 1 to 100 references any WireCat CLI printed: chat:, msg:, note:, document:, person:, task:…. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Example:** `wcat show chat:max/500/-1001 document:413`, `wcat show note:12 msg:telegram/1/77/42 --json`, `wcat show contract:2 invoice:4 --json`

## `wcat documents`

every document the store holds, of every account: Drive, notes folders, added sources, imports

### `wcat documents list`

documents of every account, newest change first, with their source, folder and kind

```sh
wcat documents list [query] [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | optional | field:value terms that narrow the list — the fields are below. |

| Option | What it does |
|---|---|
| `--limit <n>` | documents per page, 1–500. Default: `50`. |
| `--page <n>` | which page, from 1. Default: `1`. |
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Example:** `wcat documents list budget kind:pdf`, `wcat documents list source:google-drive:me@example.com folder:Contracts --page 2 --json`

### `wcat documents tree`

the accounts holding documents, each with its folders and how many documents each holds

```sh
wcat documents tree [options]
```

| Option | What it does |
|---|---|
| `--source <accounts>` | only this provider:account, or every account of a provider; repeat for more. |
| `--depth <n>` | folder levels to list, 0–20. Default: `3`. |
| `--json` | print JSON; --json=source,count keeps only those fields. |

**Example:** `wcat documents tree --depth 2 --json`

### `wcat documents show`

one document: a part of its text, its tags, the people it names and its meetings

```sh
wcat documents show <document> [options]
```

| Argument | | What it is |
|---|---|---|
| `document` | required | document:<id>, from documents list. |

| Option | What it does |
|---|---|
| `--cursor <cursor>` | the character its text starts at: where the last read ended. Default: `0`. |
| `--max-chars <n>` | characters of text at most, 1–200000. Default: `20000`. |
| `--json` | print JSON; --json=ref,text keeps only those fields. |

**Example:** `wcat documents show document:12 --cursor 20000 --max-chars 20000 --json`

## `wcat messages`

stored messenger messages and emails

### `wcat messages show`

one stored message or email whole, with optional stored neighbours

```sh
wcat messages show <message> [options]
```

| Argument | | What it is |
|---|---|---|
| `message` | required | the msg:provider/account/chat/message reference a search gives. |

| Option | What it does |
|---|---|
| `--before-n <n>` | also this many earlier emails of its thread. Default: `0`. |
| `--after-n <n>` | also this many later emails of its thread. Default: `0`. |
| `--full` | whole attachment text, not the first 4000 characters of each, and the HTML and AMP versions of the body. |
| `--trimmed` | each email's own text, without quoted earlier mail or the signature — for an agent's reads. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat messages show 'msg:email/me%40example.com/thread/42' --before-n 2 --after-n 2`

### `wcat messages acknowledge`

record that a holder — an agent or a pipeline — processed the mail `review --holder` gave it, with the cursor that review gave; the mark only moves forward, and mail still partial waits for the next review

This command changes the local store or your files.

```sh
wcat messages acknowledge [options]
```

| Option | What it does |
|---|---|
| `--holder <name>` | whose mark: lower-case letters, digits and dashes, such as mail-triage. |
| `--cursor <cursor>` | the cursor `review --holder` gave. |
| `--source <accounts>` | the one mailbox: email:<address>, email or group:<name>; may be left out when the store holds one mailbox. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Returns:** mail mark — holder, through_id, through_received_at, held, read, skipped, updated_at; every field: wcat commands info messages acknowledge

**Example:** `wcat messages acknowledge --holder mail-triage --cursor 9123.1762090000000 --source email:work`, `wcat messages acknowledge --holder mail-triage --cursor 9123.1762090000000 --source email:me@example.com --json`, `wcat messages acknowledge --holder backfill --cursor 870.1762090000000 --source email:personal`

### `wcat messages reset`

the owner moves a holder's mark back past the mail received since --since-time, or past the last --last emails it was given; its next reviews give that mail again. The answer says how many emails it reads again. Every reset counts, even one that leaves the mark where it is, so the holder's next findings key is new. An agent cannot: a holder only moves its own mark forward, with `messages acknowledge`

This command changes the local store or your files.

```sh
wcat messages reset [options]
```

| Option | What it does |
|---|---|
| `--holder <name>` | whose mark: lower-case letters, digits and dashes, such as mail-triage. |
| `--since-time <time>` | read again what was received since this ISO 8601 time, or 2d ago. |
| `--last <n>` | read again the last n emails the holder was given. |
| `--dry-run` | count what would be read again, and move nothing. |
| `--source <accounts>` | the one mailbox: email:<address>, email or group:<name>; may be left out when the store holds one mailbox. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Returns:** mail mark reset — mark, from_id, again, bulk, skipped, resets, dry_run; every field: wcat commands info messages reset

**Example:** `wcat messages reset --holder mail-triage --last 8 --dry-run --source email:me@example.com`, `wcat messages reset --holder mail-triage --since-time 2026-11-04T00:00:00Z --source email:work --json`

## `wcat people`

the people wcat knows: who is who across sources, and whom to assign tasks to

### `wcat people add`

add a person by name, before any message names them

This command changes the local store or your files.

```sh
wcat people add <name> [options]
```

| Argument | | What it is |
|---|---|---|
| `name` | required | what to call them. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat people add Lena Example`

### `wcat people list`

people of one kind: person (the default: the owner, people added by hand or assigned a task, and named people with a tie to you, such as a one-to-one chat, a group of at most 10, mail you wrote, a meeting, a CRM deal of yours or your address book), organization, automated (a name or a bulk mailbox marks them; bots are not people: bots list), stranger (no tie), unsorted (no name), test (what a test run left, hidden from every other list) or all, which leaves test out. The owner first, then by the messages and mail they sent

```sh
wcat people list [query] [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | optional | field:value terms that narrow the list — the fields are below. |

| Option | What it does |
|---|---|
| `--sort <field>` | interactions, recent, name, tasks (default interactions). Default: `interactions`. |
| `--limit <n>` | most people on a page, up to 5000. Default: `500`. |
| `--page <n>` | which page, from 1. Default: `1`. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat people list --json`, `wcat people list kind:organization --sort name --page 2`

### `wcat people check`

people whose names start like these words, the same name first: check before adding a person

```sh
wcat people check <name> [options]
```

| Argument | | What it is |
|---|---|---|
| `name` | required | the name being typed. |

| Option | What it does |
|---|---|
| `--limit <n>` | most people, up to 50. Default: `8`. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat people check ivan petrov --json`

### `wcat people show`

one person: their identities by source with the accounts that saw each, merges and open matches

```sh
wcat people show <who> [options]
```

| Argument | | What it is |
|---|---|---|
| `who` | required | person:<uid>, or <messenger>:<name or id> of an identity of the person. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat people show person:12`, `wcat people show telegram:Lena --json`

### `wcat people review`

what waits for the owner about who is who: matches (people that may be one) and splits (identities an agent says are not this person), highest score first, then newest; each match says what the two share and why it is not strong enough for an agent to merge, and each side: identities by source, the last messages or calls with dates, companies and deals (--full: more of each, with phones, addresses and accounts; --brief: no sides). --kind merged lists what agents merged on strong evidence, each with the people unmerge that undoes it. people confirm or people reject answers a match or a split, and people resolve company answers a match on a shared mailbox

```sh
wcat people review [options]
```

| Option | What it does |
|---|---|
| `--kind <kind>` | all, link, split, merged (default all). Default: `all`. |
| `--brief` | each match without its two sides. |
| `--full` | each side with phones, addresses, accounts, and more messages and calls in full. |
| `--limit <n>` | most proposals, up to 500. Default: `50`. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat people review`, `wcat people review --kind split --json`

### `wcat people confirm`

confirm matches (the people become one) and splits (the identities leave their person) by id or range as people review lists them, or `all` of what it lists with the same --kind and --limit; each is decided on its own, so a refusal leaves the others decided. `all` shows what it would do until --yes

This command changes the local store or your files.

```sh
wcat people confirm <ids> [options]
```

| Argument | | What it is |
|---|---|---|
| `ids` | required | ids or ranges as people review lists them (17080 17082-17085), or all. |

| Option | What it does |
|---|---|
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--kind <kind>` | with all: all, link, split (default all). Default: `all`. |
| `--limit <n>` | with all: as many as people review lists, up to 500. Default: `50`. |
| `--yes` | with all: do it, not only show what would be done. |
| `--reason <text>` | why, in a few words. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat people confirm 17080 17082-17085`, `wcat people confirm all --kind split --yes`

### `wcat people reject`

turn down matches and splits by id or range, or `all` of what people review lists; a turned-down match comes back only on new evidence, a turned-down split not while its identities stay on that person. `all` shows what it would do until --yes

This command changes the local store or your files.

```sh
wcat people reject <ids> [options]
```

| Argument | | What it is |
|---|---|---|
| `ids` | required | ids or ranges as people review lists them (17080 17082-17085), or all. |

| Option | What it does |
|---|---|
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--kind <kind>` | with all: all, link, split (default all). Default: `all`. |
| `--limit <n>` | with all: as many as people review lists, up to 500. Default: `50`. |
| `--yes` | with all: do it, not only show what would be done. |
| `--reason <text>` | why they are turned down, in a few words. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat people reject 17081 --reason 'two people'`, `wcat people reject all --kind link --reason 'not one'`

### `wcat people resolve`

answers a match with company: the address goes to the organization you name, else to the one that has the address or its company domain, else to one named --name, else to a new company named after the domain. The two people are not joined and are not proposed again on that address. A match on a shared mailbox (people review shows shared and mailbox) names its address; on any other match, by name say, --mailbox names which of the two people's addresses it is. organization answers a match whose two people are the company's mailboxes: every address on it goes to one organization, chosen the same way, else named after the people's shared name; people who are only those addresses become the company's, people with other identities keep them and stay people

This command changes the local store or your files.

```sh
wcat people resolve <id> <answer> [organization] [options]
```

| Argument | | What it is |
|---|---|---|
| `id` | required | the match's id as people review lists it. |
| `answer` | required | company: the mailbox is a company's, not either person's; organization: both are the company's mailboxes. |
| `organization` | optional | organization:<id> to give the addresses to. |

| Option | What it does |
|---|---|
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--name <name>` | the company's name, when no organization is named. |
| `--mailbox <address>` | with company, on a match not about a shared mailbox: the company's address. |
| `--all` | every match waiting on the same addresses, in this one answer; without it, only this match. |
| `--reason <text>` | why, in a few words. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat people resolve 17092 company`, `wcat people resolve 17093 company organization:12 --json`, `wcat people resolve 17094 organization --name "Shop Ltd"`

### `wcat people links`

who is who: the links that make identities one person

#### `wcat people links check`

people that may be wrong, you first: your person holding an identity under another name, what may be test data (sure test data is hidden without asking: people list kind:test), an identity joined by an address a person of another name has, one person with different names and nothing in common. Each says why and gives the unlink or unmerge that fixes it; an agent adds --reason and it waits for you in people review. What you linked by hand, what the person held when you did, what you kept with people links resolve <who> keep, or kept together by turning a split down, is left out

```sh
wcat people links check [options]
```

| Option | What it does |
|---|---|
| `--limit <n>` | most people on a page, up to 200. Default: `20`. |
| `--page <n>` | which page, from 1. Default: `1`. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat people links check`, `wcat people links check --page 2 --json`

#### `wcat people links resolve`

answers a doubt with keep: the person's links are right, so links check stops listing the identities in doubt until one of them moves to another person; an identity that joins later is checked again, and an agent's split of the kept ones is refused. Keep also says what looked like test data is a real contact, and brings back a person wcat hid as test data (people list kind:test lists them). test: the person is test data, hidden from every list until you keep them

This command changes the local store or your files.

```sh
wcat people links resolve <who> <answer> [options]
```

| Argument | | What it is |
|---|---|---|
| `who` | required | person:<uid> as people links check lists it, person:me, or an identity of the person. |
| `answer` | required | keep: the person is right as they are; test: the person is test data. |

| Option | What it does |
|---|---|
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat people links resolve person:42 keep`, `wcat people links resolve person:42 keep --from-app --json`, `wcat people links resolve person:42 test`

### `wcat people delete`

delete a person, the people merged into them earlier, their identities, your notes about them, and the tags, links, aliases and mentions that name them. A fact, task or imported entry that names them stays and loses the name; a note that only links to them stays. Messages, mail and meetings are their source's: they stay, and the next sync makes their sender a person again. An invoice, order or subscription that names the person must be changed first. Without --yes it shows what would go and changes nothing

This command changes the local store or your files.

```sh
wcat people delete <who> [options]
```

| Argument | | What it is |
|---|---|---|
| `who` | required | person:<uid> as people list prints it, or an identity of the person. |

| Option | What it does |
|---|---|
| `--yes` | delete; nothing of the person can be brought back. |
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat people delete person:17`, `wcat people delete person:17 --yes`

### `wcat people scan`

match people across sources now: the same address or a phone two people share joins them, the rest waits in people review; wcat sync runs it too

This command changes the local store or your files.

```sh
wcat people scan [options]
```

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat people scan`

### `wcat people link`

say two identities are one person: yours links them; an agent's merges them at once when the store finds strong evidence (one mobile number or personal address no one else has, or each source has once, from two sources, one of them a messenger or a call for a phone), and otherwise waits for you as a match that says why; agent_merges: propose makes every agent's link wait; wcat people unmerge undoes a merge

This command changes the local store or your files.

```sh
wcat people link <identity> <other> [options]
```

| Argument | | What it is |
|---|---|---|
| `identity` | required | <messenger>:<name or id>. |
| `other` | required | <messenger>:<name or id> of the person it joins. |

| Option | What it does |
|---|---|
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--reason <text>` | why, in a few words; required when an agent decides for you. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat people link max:Lena telegram:Lena`, `wcat people link max:Lena telegram:Lena --reason 'same phone in her signature'`

### `wcat people unlink`

take identities off their person: one gets a person of its own again, several move together to one new person, and no automatic match joins them back; yours applies at once, an agent's waits for you in people review

This command changes the local store or your files.

```sh
wcat people unlink <identities> [options]
```

| Argument | | What it is |
|---|---|---|
| `identities` | required | the identities that leave, each <messenger>:<id> exactly, all of one person. |

| Option | What it does |
|---|---|
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--reason <text>` | why, in a few words; required when an agent decides for you. |
| `--from <person>` | the person they leave, person:<uid> or person:me; refused when they sit on another. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat people unlink telegram:12345 --from person:me`, `wcat people unlink email:lena@example.com max:6789 --from person:42 --reason 'her husband's mailbox'`

### `wcat people unmerge`

give the identities a merge brought back to the person they came from; yours applies at once, an agent's waits for you in people review

This command changes the local store or your files.

```sh
wcat people unmerge <merge> [options]
```

| Argument | | What it is |
|---|---|---|
| `merge` | required | merge:<to>-<from>, as people show lists it. |

| Option | What it does |
|---|---|
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--reason <text>` | why, in a few words; required when an agent decides for you. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat people unmerge merge:12-34`, `wcat people unmerge merge:12-34 --reason 'a shared mailbox'`

## `wcat bots`

programs that write to you, apart from people: no-reply and alert addresses, a service's mail, a messenger's bot. Not agents (agents list)

### `wcat bots list`

the bots, by name: each with its identities, its organization, who sorted it (rules or you), its reach and the messages and mail it sent. type: is what a bot sends: alerts (security codes, sign-in and system alerts, account notices), receipts (orders, bills, shipping), newsletters, marketing, or messenger (a bot in a messenger)

```sh
wcat bots list [query] [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | optional | field:value terms that narrow the list — the fields are below. |

| Option | What it does |
|---|---|
| `--limit <n>` | most bots on a page, up to 5000. Default: `500`. |
| `--page <n>` | which page, from 1. Default: `1`. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat bots list name:shop`, `wcat bots list type:receipts`, `wcat bots list 'organization:"organization:3"' --page 2`

### `wcat bots show`

one bot: its identities, organization and counts, and every move between it and a person, oldest first

```sh
wcat bots show <bot> [options]
```

| Argument | | What it is |
|---|---|---|
| `bot` | required | bot:<id> as bots list prints it. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat bots show bot:3`, `wcat bots show bot:3 --json`

### `wcat bots move`

your word that a sender is a program (--kind bot) or a person (--kind person). Its whole history moves, past and future: every message and mail it sent stays where it is and now counts for the bot or the person, and no rule moves it back. The move is logged in bots show; moving it the other way undoes it, and a person moved back keeps their person:<uid>. Only you, never an agent

This command changes the local store or your files.

```sh
wcat bots move <who> [options]
```

| Argument | | What it is |
|---|---|---|
| `who` | required | bot:<id>, person:<uid>, an address, or <messenger>:<id> exactly as people show prints it. |

| Option | What it does |
|---|---|
| `--kind <kind>` | what the sender is: bot or person. |
| `--into <id>` | the bot:<id> or person:<uid> it joins, instead of a bot of its own or the person it came from. |
| `--name <name>` | with --kind bot: what to call a new bot. |
| `--reason <text>` | why, kept in the move log. |
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat bots move bot:3 --kind person`, `wcat bots move telegram:12345 --kind bot --into bot:3`, `wcat bots move noreply@shop.example --kind bot`

## `wcat tags`

your labels on stored sources and folders or threads

### `wcat tags add`

put labels on one source

This command changes the local store or your files.

```sh
wcat tags add <tag> [options]
```

| Argument | | What it is |
|---|---|---|
| `tag` | required | one or more tags: 1–32 letters a–z, digits or hyphens; case is ignored. |

| Option | What it does |
|---|---|
| `--message <message>` | a stored email or message's full msg: locator. |
| `--note <reference>` | a note: note:<id>, a file in a notes folder: document:<id>; a bare id is a note. |
| `--chat <chat>` | a stored mail thread or chat's exact id; requires --account. |
| `--task <id>` | label a task. |
| `--contact <person>` | label a contact identity, with --account. |
| `--person <uid>` | label a unified person. |
| `--organization <organization>` | label an organization: its id or organization:<id>. |
| `--project <project>` | label a project: its key or project:<id>. |
| `--meeting <id>` | label a meeting by its store id, with --account. |
| `--folder <folder>` | label a notes folder by its id or path, or with --subfolder one subfolder: every note under it. |
| `--subfolder <path>` | the subfolder inside --folder. |
| `--account <account>` | the account of --chat, --contact or --meeting: the account it acts as: provider:account, such as telegram:1 or email:personal. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat tags add follow-up --note note:12`, `wcat tags add harbour --project HRB`

### `wcat tags remove`

remove labels from one source

This command changes the local store or your files.

```sh
wcat tags remove <tag> [options]
```

| Argument | | What it is |
|---|---|---|
| `tag` | required | one or more tags: 1–32 letters a–z, digits or hyphens; case is ignored. |

| Option | What it does |
|---|---|
| `--message <message>` | a stored email or message's full msg: locator. |
| `--note <reference>` | a note: note:<id>, a file in a notes folder: document:<id>; a bare id is a note. |
| `--chat <chat>` | a stored mail thread or chat's exact id; requires --account. |
| `--task <id>` | label a task. |
| `--contact <person>` | label a contact identity, with --account. |
| `--person <uid>` | label a unified person. |
| `--organization <organization>` | label an organization: its id or organization:<id>. |
| `--project <project>` | label a project: its key or project:<id>. |
| `--meeting <id>` | label a meeting by its store id, with --account. |
| `--folder <folder>` | label a notes folder by its id or path, or with --subfolder one subfolder: every note under it. |
| `--subfolder <path>` | the subfolder inside --folder. |
| `--account <account>` | the account of --chat, --contact or --meeting: the account it acts as: provider:account, such as telegram:1 or email:personal. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat tags remove follow-up --note note:12`

### `wcat tags list`

list source labels, of every account or of the ones --source names

```sh
wcat tags list [query] [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | optional | field:value terms that narrow the list — the fields are below. |

| Option | What it does |
|---|---|
| `--source <accounts>` | only these accounts (default: every one): which accounts, separated by commas: provider:account (email:personal), a provider (email), a kind (mail, notes, documents) or group:<name>. |
| `--limit <n>` | most labels to show. Default: `100`. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat tags list tag:follow-up`, `wcat tags list --source email:me@example.com --json`

## `wcat tasks`

open work linked to stored messages, documents and emails

### `wcat tasks unlink`

unlink reviewed project task relationships

This command changes the local store or your files.

```sh
wcat tasks unlink <task> <other-task> [options]
```

| Argument | | What it is |
|---|---|---|
| `task` | required | the task: task:<id> or its id. |
| `other-task` | required | the task it relates to: task:<id> or its id. |

| Option | What it does |
|---|---|
| `--kind <kind>` | blocked-by, follow-up-of, related-to, duplicate-of, discovered-from. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat tasks unlink HRB-2 HRB-1 --kind blocked-by`

### `wcat tasks links`

a task's links to other tasks

```sh
wcat tasks links <task> [options]
```

| Argument | | What it is |
|---|---|---|
| `task` | required | the task: task:<id> or its id. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat tasks links HRB-2 --json`

### `wcat tasks status`

whether a task can start, and what it still waits for

```sh
wcat tasks status <task> [options]
```

| Argument | | What it is |
|---|---|---|
| `task` | required | the task: task:<id> or its id. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat tasks status HRB-2`

### `wcat tasks add`

add a task from a message, note or document, or one of your own in a project

This command changes the local store or your files.

```sh
wcat tasks add [source] [options]
```

| Argument | | What it is |
|---|---|---|
| `source` | optional | msg: source locator, note:<id> or document:<id>; leave out for a task in a project. |

| Option | What it does |
|---|---|
| `--account <account>` | the account it acts as: provider:account, such as telegram:1 or email:personal. |
| `--json` | print JSON; --json=id,title keeps only those fields. |
| `--title <title>` | one line saying what is to be done. |
| `--priority <n>` | low, medium, high, critical; 0 (urgent) … 4 (low) still read as before. |
| `--parent <id>` | the parent task, in the same project. |
| `--description <text>` | the detail, in Markdown. |
| `--type <type>` | question, request (default), mention or promise from a source; bug, feature or chore (default) in a project. |
| `--project <project>` | a task without a source: the project's key or project:<id>. |
| `--assignee <person...>` | who does it: a person's UID. |
| `--due <time>` | a project task: when it must be done, an ISO 8601 time or 2h, 3d from now. |
| `--status <state>` | a project task: its state from the start, open, todo, in_progress, done, dismissed. |
| `--agent <agent>` | a project task: the agent working on it, apart from its assignees. |
| `--external-id <service:id>` | its id in an outside service, such as avito:4512345678 for an Avito chat. |
| `--source-url <url>` | the http or https page it is about, such as the Avito ad or conversation. |
| `--into <id>` | link the source to this task instead of opening one that may be the same job. |
| `--new` | open the task even when one like it is open or was closed in the last 14 days. |

**Example:** `wcat tasks add 'msg:telegram/1/77/42' --account telegram:1 --type request`, `wcat tasks add --project HRB --title 'Draft the budget' --type feature`, `wcat tasks add --project INBOX --title 'Reply on Avito to Ivan' --external-id avito:4512345678 --source-url https://www.avito.ru/4512345678`

### `wcat tasks list`

tasks of the --source accounts, open by default; a board field lists every task

```sh
wcat tasks list [query] [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | optional | field:value terms that narrow the list — the fields are below. |

| Option | What it does |
|---|---|
| `--source <accounts>` | which accounts, separated by commas: provider:account (email:personal), a provider (email), a kind (mail, notes, documents) or group:<name>. |
| `--json` | print JSON; --json=id,title keeps only those fields. |
| `--limit <n>` | most tasks, at most 500 for a project's. Default: `100`. |
| `--sort <field>` | every task: priority, due, created, updated, key, state (default priority). |
| `--desc` | the --sort order reversed. |
| `--cursor <cursor>` | the next page of every task, from page.next_cursor, with the same query and order. |

**Returns:** task — ref, id, title, kind, state, created_at, key, description, and 26 more; every field: wcat commands info tasks list

**Next usually:** `wcat tasks links <task>`, `wcat tasks status <task>`, `wcat tasks show <task>`

**Example:** `wcat tasks list state:done --source telegram:1`, `wcat tasks list project:HRB ready:true --json`, `wcat tasks list project:* priority:[high TO critical] "invoice" --sort due --json`

### `wcat tasks counts`

how many tasks match, found ones too, by project, assignee, priority and state

```sh
wcat tasks counts [query] [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | optional | field:value terms that narrow the list — the fields are below. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Returns:** task — ref, id, title, kind, state, created_at, key, description, and 26 more; every field: wcat commands info tasks counts

**Next usually:** `wcat tasks links <task>`, `wcat tasks status <task>`, `wcat tasks show <task>`

**Example:** `wcat tasks counts project:* --json`

### `wcat tasks comments`

what people and agents wrote on a task

#### `wcat tasks comments add`

comment on a task, in your name or the agent's that runs wcat

This command changes the local store or your files.

```sh
wcat tasks comments add <id> <text> [options]
```

| Argument | | What it is |
|---|---|---|
| `id` | required | the task's id or key. |
| `text` | required | what to say, in Markdown. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat tasks comments add HRB-1 Booked the hall for Friday`

#### `wcat tasks comments list`

a task's comments, oldest first, with who wrote each and when

```sh
wcat tasks comments list <id> [query] [options]
```

| Argument | | What it is |
|---|---|---|
| `id` | required | the task's id or key. |
| `query` | optional | field:value terms; this list filters by none yet. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat tasks comments list HRB-1 --json`

### `wcat tasks history`

who changed a task, what and when, oldest first

```sh
wcat tasks history <id> [options]
```

| Argument | | What it is |
|---|---|---|
| `id` | required | the task's id or key. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat tasks history HRB-1 --json`

### `wcat tasks close`

close a task as done or dismissed

This command changes the local store or your files.

```sh
wcat tasks close <id> [options]
```

| Argument | | What it is |
|---|---|---|
| `id` | required | the task's id. |

| Option | What it does |
|---|---|
| `--account <account>` | the account it acts as: provider:account, such as telegram:1 or email:personal. |
| `--json` | print JSON; --json=id,title keeps only those fields. |
| `--as <state>` | done or dismissed. Default: `done`. |
| `--reason <text>` | why it is closed. |
| `--revision <n>` | refuse the write unless the task is still at this revision (conflict, task.stale, exit 15). |

**Example:** `wcat tasks close 7 --account telegram:1 --as dismissed --reason 'answered by phone'`

### `wcat tasks assign`

name who works on a task, or with --clear take them off it

This command changes the local store or your files.

```sh
wcat tasks assign <id> <person> [options]
```

| Argument | | What it is |
|---|---|---|
| `id` | required | the task's id or key. |
| `person` | required | explicit canonical person UID. |

| Option | What it does |
|---|---|
| `--role <role>` | assignee, reviewer, watcher. Default: `assignee`. |
| `--clear` | take the person off the task in that role, instead of adding them. |
| `--revision <n>` | refuse the write unless the task is still at this revision (conflict, task.stale, exit 15). |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat tasks assign 7 person:3`, `wcat tasks assign HRB-1 person:3 --clear --revision 4`

### `wcat tasks move`

put a project task before or after another in its board column: it takes a priority between them, and the answer says when its label changed; beside a task in another column it moves into that column

This command changes the local store or your files.

```sh
wcat tasks move <id> [options]
```

| Argument | | What it is |
|---|---|---|
| `id` | required | the task's id or key. |

| Option | What it does |
|---|---|
| `--status <state>` | move it to this column too: open, todo, in_progress, done, dismissed; with --before or --after it must be that task's column. |
| `--before <id>` | the task it goes just above. |
| `--after <id>` | the task it goes just below. |
| `--revision <n>` | refuse the write unless the task is still at this revision (conflict, task.stale, exit 15). |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat tasks move HRB-3 --status in_progress --before HRB-1 --revision 4`

### `wcat tasks agenda`

what needs a look today, from the local store and without message text: tasks overdue, due or to check, chats where you owe an answer, chats where you wait for one, open tasks someone else does

```sh
wcat tasks agenda [query] [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | optional | field:value terms that narrow the list — the fields are below. |

| Option | What it does |
|---|---|
| `--due-within <duration>` | list tasks due within this: 30m, 2h, 1d (default 1d). |
| `--unanswered <duration>` | list chats where someone else wrote last this long ago (default 1d). |
| `--waiting <duration>` | list chats where you wrote last this long ago (default 7d). |
| `--within <duration>` | leave out chats silent longer than this: they ended (default 30d). |
| `--holder <name>` | who you are for claims: a session id or a chat id; default WIRECAT_HOLDER, else Claude Code's session, else the agent's name. |
| `--source <accounts>` | the account: telegram:<account>, email:<account>, notes:<id>, or group:<name> of one. |
| `--json` | print JSON. |

**Returns:** agenda — at, account, stored_at, stale, tasks, owed, waiting, unsynced, and 2 more; every field: wcat commands info tasks agenda

**Example:** `wcat tasks agenda --source telegram:1`, `wcat tasks agenda --source max:1 --waiting 3d --within 90d --json`

### `wcat tasks update`

update stored tasks: source edits name --account; a found task takes priority, status, agent and --project

This command changes the local store or your files.

```sh
wcat tasks update <task> [options]
```

| Argument | | What it is |
|---|---|---|
| `task` | required | the task's id or key, as tasks list shows it. |

| Option | What it does |
|---|---|
| `--category <name>` | what it is about, from the list tasks categories prints: money, documents, meeting, …; a change is kept in the task's history. |
| `--priority <n>` | low, medium, high, critical or none; 0 (urgent) … 4 (low) still read as before. |
| `--parent <id>` | parent task in the same project; none clears it. |
| `--title <title>` | one line: the action and its object — send Alex the API token. |
| `--description <text>` | the detail, in Markdown; none clears it. |
| `--due <time>` | when it must be done: an ISO 8601 time, a date (its end), today, or 2h, 3d from now; none clears it. |
| `--remind-time <time>` | when to look at it again: an ISO 8601 time, a date (its start), today, or 2h, 3d from now; none clears it. |
| `--assignee <person...>` | who does it: sender (whoever sent the task's message) or person:<id>; none clears it. Leave it out when unsure: a task with no assignee is better than none. |
| `--account <account>` | the account it acts as: telegram:<account>, email:<account>, notes:<id>. |
| `--json` | print JSON. |
| `--agent <agent>` | the agent working on the task, apart from its assignees; none clears it. |
| `--project <project>` | move the task, a found one too, to a project, by key or project:<id>; it and its subtasks take new keys there, and the old keys still find them. A subtask moves alone only with --parent none. |
| `--type <type>` | bug, feature, chore in a project; a found task keeps a message kind until it moves into one. |
| `--revision <n>` | refuse the write unless the task is still at this revision (conflict, task.stale, exit 15). |
| `--status <state>` | the task's state: open, todo, in_progress, done, dismissed; a closed one reopens. |

**Returns:** task card — id, ref, key, project, project_key, project_name, created_by, title, and 26 more; every field: wcat commands info tasks update

**Example:** `wcat tasks update HRB-1 --title 'Send the budget' --priority high --account telegram:1`, `wcat tasks update 1a2b3c4d --due 2d --title 'Send the revised budget' --account telegram:1`

### `wcat tasks show`

one task: its plan and everything linked to it

```sh
wcat tasks show <task> [options]
```

| Argument | | What it is |
|---|---|---|
| `task` | required | the task's id or key, as tasks list shows it. |

| Option | What it does |
|---|---|
| `--source <accounts>` | the account: telegram:<account>, email:<account>, notes:<id>, or group:<name> of one. |
| `--json` | print JSON. |

**Returns:** task card — id, ref, key, project, project_key, project_name, created_by, title, and 26 more; every field: wcat commands info tasks show

**Example:** `wcat tasks show 1a2b3c4d --source telegram:1 --json`

### `wcat tasks link`

link a task to messages, chats, people or URLs — or to another task: task:<id>

This command changes the local store or your files.

```sh
wcat tasks link <task> [targets] [options]
```

| Argument | | What it is |
|---|---|---|
| `task` | required | the task's id or key, as tasks list shows it. |
| `targets` | optional | msg: locators, person:<id>, document:<id>, note:<id>, a URL; or task:<id>, which links two project tasks. |

| Option | What it does |
|---|---|
| `--chat <chat>` | a chat it concerns, repeatable; a stored chat, by its id or title. |
| `--kind <kind>` | related-to (default), evidence — it shows the task is real — or created-from; for task:<id>, related-to, blocked-by, follow-up-of, duplicate-of or discovered-from. |
| `--account <account>` | the account it acts as: telegram:<account>, email:<account>, notes:<id>. |
| `--json` | print JSON. |

**Returns:** task links — id, ref, key, project, project_key, project_name, created_by, title, and 28 more; every field: wcat commands info tasks link

**Example:** `wcat tasks link HRB-2 HRB-1 --kind blocked-by`

### `wcat tasks claim`

take an open task so no other agent works it at once; the claim lapses by itself

This command changes the local store or your files.

```sh
wcat tasks claim <task> [options]
```

| Argument | | What it is |
|---|---|---|
| `task` | required | the task's id or key, as tasks list shows it. |

| Option | What it does |
|---|---|
| `--lease <duration>` | how long the claim lasts: 30m, 2h (default 30m); claiming again extends it. |
| `--holder <name>` | who you are for claims: a session id or a chat id; default WIRECAT_HOLDER, else Claude Code's session, else the agent's name. |
| `--account <account>` | the account it acts as: telegram:<account>, email:<account>, notes:<id>. |
| `--json` | print JSON. |

**Returns:** task card — id, ref, key, project, project_key, project_name, created_by, title, and 26 more; every field: wcat commands info tasks claim

**Example:** `wcat tasks claim HRB-1 --lease 2h --account telegram:1`

### `wcat tasks release`

give back a task you claimed, before the claim lapses; the owner may release any

This command changes the local store or your files.

```sh
wcat tasks release <task> [options]
```

| Argument | | What it is |
|---|---|---|
| `task` | required | the task's id or key, as tasks list shows it. |

| Option | What it does |
|---|---|
| `--holder <name>` | who you are for claims: a session id or a chat id; default WIRECAT_HOLDER, else Claude Code's session, else the agent's name. |
| `--account <account>` | the account it acts as: telegram:<account>, email:<account>, notes:<id>. |
| `--json` | print JSON. |

**Returns:** task card — id, ref, key, project, project_key, project_name, created_by, title, and 26 more; every field: wcat commands info tasks release

**Example:** `wcat tasks release HRB-1 --account telegram:1`

## `wcat stats`

statistics about what the store holds

### `wcat stats tasks`

task statistics

#### `wcat stats tasks show`

tasks per chat, meeting or project: open now, and opened and closed in the period (created: in the query), with the median time to close and the mean age of the open ones

```sh
wcat stats tasks show [query] [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | optional | field:value terms that narrow the list — the fields are below. |

| Option | What it does |
|---|---|
| `--by <group>` | chat (default) or meeting: this account's tasks; project: the owner's project tasks, every project. |
| `--type <type>` | only this type: question, request, mention or promise. |
| `--timezone <zone>` | the IANA timezone for calendar days in the period, such as created>=today. |
| `--source <accounts>` | the account: telegram:<account>, email:<account>, notes:<id>, or group:<name> of one. |
| `--json` | print JSON. |

**Returns:** task — ref, id, title, kind, state, created_at, key, description, and 26 more; every field: wcat commands info stats tasks show

**Next usually:** `wcat tasks links <task>`, `wcat tasks status <task>`, `wcat tasks show <task>`

**Example:** `wcat stats tasks show --source telegram:1`, `wcat stats tasks show --type question --source telegram:1 --json`

### `wcat stats projects`

project statistics

#### `wcat stats projects show`

for each of your projects, the chats linked to it or its child projects (every confirmed link, any purpose, no chat limit, unlike projects status): how many, how many are muted, messages and yours in the period by when they were sent, the newest message and the three busiest chats; a muted chat's messages are not counted. Busiest first. One read for all projects; projects status <project> says where one stands

```sh
wcat stats projects show [options]
```

| Option | What it does |
|---|---|
| `--since-time <time>` | how far back: days (30d, at most 730d), a start date (2026-09-01) or all. Default: `30d`. |
| `--limit <n>` | most projects on a page, up to 200. Default: `20`. |
| `--page <n>` | which page, from 1. Default: `1`. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat stats projects show`, `wcat stats projects show --since-time 7d --json`

## `wcat organizations`

companies, teams, families and communities of yours

### `wcat organizations add`

add an organization of yours: a company, team, family or community; it is written at once, whoever runs it

This command changes the local store or your files.

```sh
wcat organizations add <name> [options]
```

| Argument | | What it is |
|---|---|---|
| `name` | required | the organization's name. |

| Option | What it does |
|---|---|
| `--kind <kind>` | company, team, family, community. |
| `--scope <scope>` | personal, work. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat organizations add 'Harbour Studio' --kind company --scope work`, `wcat organizations add 'Harbour Family' --kind family`

### `wcat organizations rename`

rename an organization of yours; it is written at once, whoever runs it

This command changes the local store or your files.

```sh
wcat organizations rename <organization> <name> [options]
```

| Argument | | What it is |
|---|---|---|
| `organization` | required | its id or organization:<id>. |
| `name` | required | the new name. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat organizations rename organization:1 'Harbour Studio Ltd'`, `wcat organizations rename 1 'Harbour Studio Ltd' --json`

### `wcat organizations delete`

delete an organization, your notes about it, the tags, links, aliases and mentions that name it, and which identities it held. A deal, lead, project, account or fact that names it stays and loses the name; a note that only links to it stays. One of your own companies is never deleted, and an invoice, order or subscription that names it must be changed first. Without --yes it shows what would go and changes nothing

This command changes the local store or your files.

```sh
wcat organizations delete <organization> [options]
```

| Argument | | What it is |
|---|---|---|
| `organization` | required | its id or organization:<id>, as organizations list prints it. |

| Option | What it does |
|---|---|
| `--yes` | delete; nothing of the organization can be brought back. |
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat organizations delete organization:12`, `wcat organizations delete organization:12 --yes`

### `wcat organizations show`

one organization by its id or organization:<id>, without its relationships, notes and tags

```sh
wcat organizations show <organization> [options]
```

| Argument | | What it is |
|---|---|---|
| `organization` | required | its id or organization:<id>. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat organizations show organization:1`

### `wcat organizations list`

your organizations; category:client, supplier, partner or employer keeps those its relationships make so

```sh
wcat organizations list [query] [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | optional | field:value terms that narrow the list — the fields are below. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Returns:** organization — id, ref, kind, name, scope, sector, created_at; every field: wcat commands info organizations list

**Example:** `wcat organizations list name:*harbour*`, `wcat organizations list category:client`, `wcat organizations list --json`

### `wcat organizations context`

one organization by its id or organization:<id>: its people by role, customers, suppliers and partners, projects, open deals and leads, invoices, payments and orders, what its people wrote, newest first, open tasks and categories, each relationship with its standing; then the notes about it and its tags. `coverage` names what was not read

```sh
wcat organizations context <organization> [options]
```

| Argument | | What it is |
|---|---|---|
| `organization` | required | its id or organization:<id>. |

| Option | What it does |
|---|---|
| `--limit <n>` | most items in each section. Default: `20`. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat organizations context organization:1`, `wcat organizations context 1 --json`

## `wcat projects`

projects of yours, each with a short key

### `wcat projects meetings`

explicit account-scoped project membership

#### `wcat projects meetings list`

meetings linked to a project in one account, or with confirmed:false proposed

```sh
wcat projects meetings list <project> [query] [options]
```

| Argument | | What it is |
|---|---|---|
| `project` | required | project reference, key or explicit alias. |
| `query` | optional | field:value terms that narrow the list — the fields are below. |

| Option | What it does |
|---|---|
| `--source <accounts>` | the meeting account: provider:account (zoom:me@example.com), or a provider that has one. |
| `--json` | print JSON; --json=id,title keeps only those fields. |
| `--limit <n>` | meetings per page, at most 500. Default: `50`. |
| `--page <n>` | which page, from 1. |

**Example:** `wcat projects meetings list HRB --source zoom:me@example.com`

#### `wcat projects meetings link`

link a stored meeting to a project, or confirm a proposed link

This command changes the local store or your files.

```sh
wcat projects meetings link <project> <meeting-id> [options]
```

| Argument | | What it is |
|---|---|---|
| `project` | required | project reference, key or explicit alias. |
| `meeting-id` | required | positive stored meeting id. |

| Option | What it does |
|---|---|
| `--account <account>` | the meeting account it acts as: provider:account, such as zoom:me@example.com. |
| `--json` | print JSON; --json=id,title keeps only those fields. |
| `--fingerprint <hash>` | required when confirming an existing proposal. |
| `--reason <text>` | why the reviewed meeting belongs to this project. |

**Example:** `wcat projects meetings link HRB 31 --account zoom:me@example.com`

### `wcat projects add`

add a project of yours, with a short key its tasks use

This command changes the local store or your files.

```sh
wcat projects add <name> [options]
```

| Argument | | What it is |
|---|---|---|
| `name` | required | the project's name. |

| Option | What it does |
|---|---|
| `--key <key>` | 3–4 letters and digits; made from the name when left out. |
| `--type <type>` | work, client, personal, oss, other. |
| `--organization <organization>` | the organization it belongs to: its id or organization:<id>. |
| `--scope <scope>` | personal, work. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat projects add 'Harbour' --key HRB --type client --organization 1`

### `wcat projects list`

your projects

```sh
wcat projects list [query] [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | optional | field:value terms that narrow the list — the fields are below. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Returns:** project — id, ref, key, name, kind, type, organization_id, scope, and 1 more; every field: wcat commands info projects list

**Example:** `wcat projects list`

### `wcat projects context`

one project by its id, project:<id>, key, exact name or alias: its key documents first, then its relationships, notes, tags, pending findings and open tasks. Review proposals together; nothing is confirmed. `review.waiting` counts what waits for you, by kind, and `next` names the command that lists them

```sh
wcat projects context <project> [options]
```

| Argument | | What it is |
|---|---|---|
| `project` | required | its id, project:<id>, key, exact name or alias. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat projects context HRB`, `wcat projects context project:2 --json`

### `wcat projects evidence`

cited references about a project in stored messages, mail, meeting transcripts and imported notes folders. The project's name, its key, each of its aliases and each --alias, each --context-query and each --contact name is its own search: every word of it must appear in one text, in any order, as whole words; their hits are joined. Every message of a chat confirmed as the project's (wcat relationships add chat:<provider>/<account>/<chat> project:<id>) is read too, when --source holds its account, and so is everything a confirmed person member of the project wrote (as --contact person:<id>, without aliases). New mail and documents are indexed for search first, unless --no-catch-up. Reads what the store holds; with --sync-first it first syncs the linked chats the store lacks for the window by running their messenger CLI (tg, max, wa) with the profile signed in to each chat's account, or the one --sync-profile names when several are; proposes and confirms nothing. A partial answer exits 0 with meta.complete false

This command changes the local store or your files.

```sh
wcat projects evidence <project> [options]
```

| Argument | | What it is |
|---|---|---|
| `project` | required | an existing project's id, key, exact name or alias, or a new project's name. |

| Option | What it does |
|---|---|
| `--source <accounts>` | where to look, or all: which accounts, separated by commas: provider:account (email:personal), a provider (email), a kind (mail, notes, documents) or group:<name>. |
| `--alias <name>` | another name of the project, searched on its own; repeat for more. Default: ``. |
| `--context-query <words>` | more words that all appear in one text; repeat for another search. Default: ``. |
| `--contact <person>` | a name to search, or person:<id> to read what that person's stored identities wrote and search the aliases you gave them; what only names them or comes from them is context, not the project. Default: ``. |
| `--since-time <time>` | how far back: days (90d, at most 730d) or a start date (2026-09-01). Default: `60d`. |
| `--before-time <time>` | fixed exclusive end: ISO 8601 timestamp with UTC offset; days back count from it. |
| `--limit <n>` | new references at most, up to 500. Default: `100`. |
| `--max-pages <pages>` | store pages read at most this run, up to 512. |
| `--cursor <cursor>` | continue a stopped search from its checkpoint, with the same options. |
| `--before-n <n>` | messages before each message hit, shown as its context, at most 5. Default: `2`. |
| `--after-n <n>` | messages after each message hit, shown as its context, at most 5. Default: `2`. |
| `--no-catch-up` | read the search index as it is, without indexing new mail and documents first. |
| `--sync-first` | first sync the linked chats the store does not hold back to --since-time, through their messenger CLI; off by default. |
| `--sync-time <duration>` | time for all of --sync-first's syncs together. Default: `3m`. |
| `--sync-profile <tool=profile>` | the messenger profile to sync as when several are signed in to a chat's account, such as max=default; repeat for another tool. It must be signed in to that account. |
| `--purposes <purposes>` | the linked chats' purposes to read, comma-separated: work, sales, support, other, or all; default work. |
| `--include-proposed` | also read chats and members proposed for the project, after the confirmed ones. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat projects evidence SYH --source telegram:1,email:personal --contact 'Alice Example'`, `wcat projects evidence SYH --source all --context-query 'crane tender' --since-time 180d --json`

### `wcat projects status`

where a project stands, from the stored messages of every chat confirmed as the project's or its child projects', in every account those links name (meta.accounts lists them): the last message, who replies next, open questions both ways, promises, amounts found by words with their direction (only when the project has no confirmed invoice or payment), payments recorded, billed, paid and owed per currency from confirmed invoices and payments (finance), up to five open deals (deals), how long each --context-query has been quiet on their side, and how much of each chat is held. Amounts, directions and promises found by words are marked pattern: read the cited message before trusting one. Others' questions in a group with no role, and others' word-found promises in a group, are counted on the chat's row as unlisted, not listed. next names at most two chats to read, with the messenger command that reads them. No model call; nothing leaves this machine

```sh
wcat projects status <project> [options]
```

| Argument | | What it is |
|---|---|---|
| `project` | required | an existing project's id, project:<id>, key, exact name or alias. |

| Option | What it does |
|---|---|
| `--since-time <time>` | how far back: days (60d, at most 730d) or a start date (2026-09-01). Default: `60d`. |
| `--before-time <time>` | fixed exclusive end: ISO 8601 timestamp with UTC offset; days back count from it. |
| `--context-query <words>` | words that all appear in one text; reports their last mention per side. Repeat for another. Default: ``. |
| `--sync-profile <tool=profile>` | the messenger profile the next steps name when several are signed in to a chat's account, such as max=default; repeat for another tool. |
| `--purposes <purposes>` | the linked chats' purposes to read, comma-separated: work, sales, support, other, or all; default work. |
| `--compact` | one line per signal, chat and next step, for an agent. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Returns:** project status — project, key, name, signals, money, chats, purposes, out_of_scope, and 7 more; every field: wcat commands info projects status

**Example:** `wcat projects status HRB --context-query 1C`, `wcat projects status HRB --compact`

### `wcat projects actions`

cited key documents and findings an agent proposed for a project, with the evidence to decide them

#### `wcat projects actions add`

stage an agent's cited facts and follow-ups about one project for review

This command changes the local store or your files.

```sh
wcat projects actions add <file> [options]
```

| Argument | | What it is |
|---|---|---|
| `file` | required | the findings JSON itself (starts with {), a JSON file, or - for stdin; at most 65536 UTF-8 bytes. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=id,status keeps only those fields. |

**Example:** `wcat projects actions add findings.json`

#### `wcat projects actions list`

a project's proposed key documents and findings, newest first, with source state, cited text and nearby messages or document paragraphs; key-document text is untracked because no fingerprint was saved

```sh
wcat projects actions list <project> [query] [options]
```

| Argument | | What it is |
|---|---|---|
| `project` | required | the project's id, project:<id>, key, exact name or alias. |
| `query` | optional | field:value terms that narrow the list — the fields are below. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=id,status keeps only those fields. |
| `--limit <n>` | findings batches per page, at most 50. Default: `10`. |
| `--page <n>` | which page, from 1; key documents come on the first. Default: `1`. |
| `--brief` | only references and source state, without excerpts or nearby text. |
| `--before-n <n>` | messages or document paragraphs before the citation, at most 5. Default: `2`. |
| `--after-n <n>` | messages or document paragraphs after the citation, at most 5. Default: `2`. |

**Returns:** project action — kind, id, status, reason, provenance, evidence, fingerprint, author, and 5 more; every field: wcat commands info projects actions list

**Example:** `wcat projects actions list SYH`, `wcat projects actions list SYH status:reviewed --brief --json`

#### `wcat projects actions confirm`

confirm a suggested key document, or create the named findings of a batch and reject its other new ones; an agent decides for you only when agent_decisions is true, and with --reason

This command changes the local store or your files.

```sh
wcat projects actions confirm <project> <id> [findings] [options]
```

| Argument | | What it is |
|---|---|---|
| `project` | required | the project's id, project:<id>, key, exact name or alias. |
| `id` | required | key:<id> for a key document, or a findings batch number, as projects actions list gives them. |
| `findings` | optional | the finding IDs of a batch to create. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=id,status keeps only those fields. |
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--fingerprint <hash>` | a findings batch's fingerprint, as projects actions list gives it. |
| `--reason <text>` | why, in a few words; required when an agent decides for you. |

**Example:** `wcat projects actions confirm SYH 12 budget accountant --fingerprint 3f9a0c --reason 'both are stated plainly'`, `wcat projects actions confirm SYH key:4`

#### `wcat projects actions reject`

reject a suggested key document, or every new finding of a batch

This command changes the local store or your files.

```sh
wcat projects actions reject <project> <id> [options]
```

| Argument | | What it is |
|---|---|---|
| `project` | required | the project's id, project:<id>, key, exact name or alias. |
| `id` | required | key:<id> for a key document, or a findings batch number, as projects actions list gives them. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=id,status keeps only those fields. |
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--fingerprint <hash>` | a findings batch's fingerprint, as projects actions list gives it. |
| `--reason <text>` | why, in a few words; required when an agent decides for you. |

**Example:** `wcat projects actions reject SYH 12 --fingerprint 3f9a0c --reason 'not about this project'`

### `wcat projects annotations`

selected project aliases, facts and generic links; not a full backup

#### `wcat projects annotations show`

read selected project annotations without creating a file; not a full backup

```sh
wcat projects annotations show <project> [options]
```

| Argument | | What it is |
|---|---|---|
| `project` | required | the project's id, key, exact name or alias. |

| Option | What it does |
|---|---|
| `--max-read-bytes <bytes>` | source input byte budget, at most 4194304. |
| `--json` | print the standard JSON answer. |

**Example:** `wcat projects annotations show HRB --max-read-bytes 1048576 --json`

#### `wcat projects annotations export`

write selected annotations to a new private file, omitting source bodies

This command changes the local store or your files.

```sh
wcat projects annotations export <project> [options]
```

| Argument | | What it is |
|---|---|---|
| `project` | required | the project's id, key, exact name or alias. |

| Option | What it does |
|---|---|
| `--output <file>` | new snapshot file; parent folder must exist and existing paths are refused. |
| `--max-read-bytes <bytes>` | source input byte budget, at most 4194304. |
| `--json` | print JSON; --json=project,counts keeps only those fields. |

**Example:** `wcat projects annotations export HRB --output harbour-annotations.json --json`

#### `wcat projects annotations check`

check bindings and conflicts in an existing target without restoring

```sh
wcat projects annotations check <file> [options]
```

| Argument | | What it is |
|---|---|---|
| `file` | required | version2 snapshot JSON file, at most 4194304 UTF-8 bytes. |

| Option | What it does |
|---|---|
| `--target-store <file>` | explicit existing destination store; never created by preview. |
| `--project <project>` | explicit destination project:<id>; its key and name must match the snapshot. |
| `--bindings <file>` | JSON object mapping every external source reference and the project to explicit target references. |
| `--max-read-bytes <bytes>` | destination input byte budget, at most 4194304. |
| `--json` | print JSON; --json=ready,fingerprint keeps only those fields. |

**Example:** `wcat projects annotations check harbour-annotations.json --target-store ./trial/wirecat.db --project project:2 --bindings bindings.json --json`

#### `wcat projects annotations restore`

owner: restore selected annotations with the exact successful check fingerprint

This command changes the local store or your files.

```sh
wcat projects annotations restore <file> [options]
```

| Argument | | What it is |
|---|---|---|
| `file` | required | version2 snapshot JSON file, at most 4194304 UTF-8 bytes. |

| Option | What it does |
|---|---|
| `--target-store <file>` | explicit existing destination store; never created by preview. |
| `--project <project>` | explicit destination project:<id>; its key and name must match the snapshot. |
| `--bindings <file>` | JSON object mapping every external source reference and the project to explicit target references. |
| `--max-read-bytes <bytes>` | destination input byte budget, at most 4194304. |
| `--json` | print JSON; --json=project,counts keeps only those fields. |
| `--fingerprint <hash>` | exact fingerprint returned by the successful target preview. |

**Example:** `wcat projects annotations restore harbour-annotations.json --target-store ./trial/wirecat.db --project project:2 --bindings bindings.json --fingerprint aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa --json`

### `wcat projects key-documents`

the notes, files and messages to read first about a project, each with why

#### `wcat projects key-documents add`

mark a note:, document: or msg: reference as a key document of the project

This command changes the local store or your files.

```sh
wcat projects key-documents add <project> <reference> [options]
```

| Argument | | What it is |
|---|---|---|
| `project` | required | id, project:<id>, key, exact name or alias. |
| `reference` | required | note:, document: or msg: reference. |

| Option | What it does |
|---|---|
| `--reason <text>` | why it is key, in a few words. |
| `--json` | print JSON; --json=id,title keeps only those fields. |
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |

**Example:** `wcat projects key-documents add HRB note:12 --reason 'the brief'`

#### `wcat projects key-documents remove`

unmark a key document; the note, file or message stays. Only you remove one

This command changes the local store or your files.

```sh
wcat projects key-documents remove <project> <reference> [options]
```

| Argument | | What it is |
|---|---|---|
| `project` | required | id, project:<id>, key, exact name or alias. |
| `reference` | required | the key document's note:, document: or msg: reference. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=id,title keeps only those fields. |
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |

**Example:** `wcat projects key-documents remove HRB note:12`

#### `wcat projects key-documents list`

a project's key documents: why, who marked each and whether it is still there

```sh
wcat projects key-documents list <project> [query] [options]
```

| Argument | | What it is |
|---|---|---|
| `project` | required | id, project:<id>, key, exact name or alias. |
| `query` | optional | field:value terms that narrow the list — the fields are below. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Returns:** memo key document — id, ref, title, path, reason, available, confirmed, origin, and 2 more; every field: wcat commands info projects key-documents list

**Example:** `wcat projects key-documents list HRB`

## `wcat relationships`

relations between people, organizations and projects; never between identities

### `wcat relationships add`

state that a person, organization or project belongs to, reports to, is a customer or partner of, or relates to another, or that a chat is a project's (member-of only); an agent's waits for you to confirm it

This command changes the local store or your files.

```sh
wcat relationships add <from> <to> [options]
```

| Argument | | What it is |
|---|---|---|
| `from` | required | the person:, organization: or project: that belongs or relates, or chat:<provider>/<account>/<chat> of a project. |
| `to` | required | the person:, organization: or project: it belongs or relates to. |

| Option | What it does |
|---|---|
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--json` | print JSON; --json=id,title keeps only those fields. |
| `--kind <kind>` | member-of, reports-to, customer-of, partner-of, related-to. Default: `member-of`. |
| `--role <role>` | its role: in an organization employee, contractor, founder, owner, manager, adviser, contact; in a project owner, manager, contributor, client-contact, approver; on a deal or lead owner, contact, decision-maker, influencer. A job title is not a role. |
| `--role-note <text>` | what the role means here, in your words, beside a role from its list. |
| `--engagement <level>` | a person on a project: how much you deal with them yourself, not how active they are: none, low, medium or high. |
| `--position <title>` | the job title, such as 'Procurement manager'; kept apart from the role. |
| `--start-date <date>` | the first day it held, such as 2026-01-01. |
| `--end-date <date>` | the last day it held, included; it ends at the start of the day after. |
| `--reason <text>` | why you think so, in a sentence. |

**Example:** `wcat relationships add person:3 organization:1 --role employee --position CTO --start-date 2026-01-01`, `wcat relationships add person:3 person:5 --kind reports-to`, `wcat relationships add organization:1 organization:2 --kind customer-of --reason 'signed in October'`

### `wcat relationships list`

relationships (who works where, who reports to whom, who is on a deal), all or those of one reference, with titles; confirmed:false lists the proposals waiting for you, as wcat review kind:relationship does

```sh
wcat relationships list [query] [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | optional | field:value terms that narrow the list — the fields are below. |

| Option | What it does |
|---|---|
| `--limit <n>` | most relationships, up to 500. Default: `100`. |
| `--page <n>` | which page, from 1. Default: `1`. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Returns:** relationship — id, from, to, kind, role, purpose, evidence, confirmed, and 9 more; every field: wcat commands info relationships list

**Example:** `wcat relationships list about:"person:3"`, `wcat relationships list kind:reports-to to:"person:5"`, `wcat relationships list standing:reported include:ended --limit 50`

### `wcat relationships update`

set what a relationship is: its role and a note beside it, how much you deal with a person on a project, or what a chat is for in a project (work, sales, support, other); an agent's change waits for you in wcat review

This command changes the local store or your files.

```sh
wcat relationships update <id> [options]
```

| Argument | | What it is |
|---|---|---|
| `id` | required | the relationship's id, as relationships list gives it. |

| Option | What it does |
|---|---|
| `--role <role>` | its role: in an organization employee, contractor, founder, owner, manager, adviser, contact; in a project owner, manager, contributor, client-contact, approver; on a deal or lead owner, contact, decision-maker, influencer. A job title is not a role; an empty value clears it. |
| `--role-note <text>` | what the role means here, in your words; an empty value clears it. |
| `--engagement <level>` | a person on a project: how much you deal with them yourself, not how active they are: none, low, medium or high; an empty value clears it. |
| `--position <title>` | the job title; an empty value clears it. |
| `--start-date <date>` | the first day it held, such as 2026-01-01. |
| `--purpose <purpose>` | what the chat is for in the project: work, sales, support or other. |
| `--reason <text>` | why, in a sentence. |
| `--json` | print JSON; --json=id,title keeps only those fields. |
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |

**Example:** `wcat relationships update 12 --purpose sales`, `wcat relationships update 12 --engagement low`, `wcat relationships update 12 --role approver --role-note 'signs the acts'`

### `wcat relationships remove`

remove a relationship; removing a suggested one rejects it

This command changes the local store or your files.

```sh
wcat relationships remove <id> [options]
```

| Argument | | What it is |
|---|---|---|
| `id` | required | the relationship's id, as relationships list gives it. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=id,title keeps only those fields. |
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--reason <text>` | why, in a few words; required when an agent decides for you. |

**Example:** `wcat relationships remove 4`

### `wcat relationships confirm`

confirm a suggested relationship

This command changes the local store or your files.

```sh
wcat relationships confirm <id> [options]
```

| Argument | | What it is |
|---|---|---|
| `id` | required | the relationship's id, as relationships list gives it. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=id,title keeps only those fields. |
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--reason <text>` | why, in a few words; required when an agent decides for you. |

**Example:** `wcat relationships confirm 4`

### `wcat relationships end`

say that a relationship no longer holds, from a day on; it stays, as ended, and relationships list include:ended shows it. An agent's waits for you in wcat review

This command changes the local store or your files.

```sh
wcat relationships end <id> [options]
```

| Argument | | What it is |
|---|---|---|
| `id` | required | the relationship's id, as relationships list gives it. |

| Option | What it does |
|---|---|
| `--end-date <date>` | the last day it held, included; it ends at the start of the day after. Today when left out. |
| `--json` | print JSON; --json=id,title keeps only those fields. |
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |

**Example:** `wcat relationships end 4 --end-date 2026-09-30`

### `wcat relationships roles`

the roles a relationship may take: built in and your own

#### `wcat relationships roles list`

the roles of every list, or of one with list:<name>; each built in (with labels in English, Russian and Spanish) or yours

```sh
wcat relationships roles list [query] [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | optional | field:value terms that narrow the list — the fields are below. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat relationships roles list`, `wcat relationships roles list list:deal --json`

#### `wcat relationships roles add`

add a role of your own to a list; relationships may then take it. Only you change the lists

This command changes the local store or your files.

```sh
wcat relationships roles add <list> <role> [options]
```

| Argument | | What it is |
|---|---|---|
| `list` | required | organization (roles in an organization), project, deal (a deal's or a lead's), contract (a party's) or related (what a person or an organization is to another). |
| `role` | required | the role's id: lowercase letters, digits and -, such as board-member. |

| Option | What it does |
|---|---|
| `--label <label>` | how it reads, such as 'Board member'. |
| `--json` | print JSON; --json=id,title keeps only those fields. |
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |

**Example:** `wcat relationships roles add organization board-member --label 'Board member'`

#### `wcat relationships roles remove`

remove a role of your own; a built-in one stays, and one a relationship still holds is refused

This command changes the local store or your files.

```sh
wcat relationships roles remove <list> <role> [options]
```

| Argument | | What it is |
|---|---|---|
| `list` | required | organization (roles in an organization), project, deal (a deal's or a lead's), contract (a party's) or related (what a person or an organization is to another). |
| `role` | required | the role's id. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=id,title keeps only those fields. |
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |

**Example:** `wcat relationships roles remove organization board-member`

### `wcat relationships scan`

chats, mail threads and people that look like a project's, scored from the store: its name and aliases in titles and messages, the chats and threads of its members in every messenger, spreading from what it finds. With no project, people who share a company mail domain. Lists them and writes nothing; --yes writes them as proposals by wcat-scan for you to decide in wcat review. Never confirms, and never proposes again what you rejected

This command changes the local store or your files.

```sh
wcat relationships scan [project] [options]
```

| Argument | | What it is |
|---|---|---|
| `project` | optional | a project's id, key, exact name or alias, or all; left out, people by mail domain. |

| Option | What it does |
|---|---|
| `--source <accounts>` | where to look, or all: which accounts, separated by commas: provider:account (email:personal), a provider (email), a kind (mail, notes, documents) or group:<name>. |
| `--since-time <time>` | how far back messages count: days (90d, at most 730d) or a date. Default: `90d`. |
| `--limit <n>` | new proposals per project at most, up to 50. Default: `20`. |
| `--yes` | write the proposals; without it nothing is written. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat relationships scan HRB --source all`, `wcat relationships scan HRB --source telegram:1,email:personal --yes`, `wcat relationships scan --source email:me@example.com`

## `wcat reminders`

durable local reminders; poll hands one out and ack confirms it was shown

### `wcat reminders add`

add a reminder for an open task

This command changes the local store or your files.

```sh
wcat reminders add <task> [options]
```

| Argument | | What it is |
|---|---|---|
| `task` | required | the task's id. |

| Option | What it does |
|---|---|
| `--account <account>` | the account it acts as: provider:account, such as telegram:1 or email:personal. |
| `--json` | print JSON; --json=id,title keeps only those fields. |
| `--at-time <time>` | when to remind: an ISO 8601 time with its UTC offset. |
| `--timezone <zone>` | IANA timezone; the computer's when not given. |

**Example:** `wcat reminders add 7 --at-time 2026-10-20T09:00:00+02:00 --timezone Europe/Madrid --account telegram:1`

### `wcat reminders list`

pending reminders of the accounts --source names (default all), soonest first

```sh
wcat reminders list [query] [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | optional | field:value terms that narrow the list — the fields are below. |

| Option | What it does |
|---|---|
| `--source <accounts>` | which accounts, separated by commas: provider:account (email:personal), a provider (email), a kind (mail, notes, documents) or group:<name>. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Returns:** reminder — id, task, due_at, timezone, state, revision, receipt; every field: wcat commands info reminders list

**Example:** `wcat reminders list --source telegram:1`

### `wcat reminders claim`

hand out due reminders, each with a receipt to acknowledge

This command changes the local store or your files.

```sh
wcat reminders claim [options]
```

| Option | What it does |
|---|---|
| `--account <account>` | the account it acts as: provider:account, such as telegram:1 or email:personal. |
| `--json` | print JSON; --json=id,title keeps only those fields. |
| `--limit <n>` | most due reminders, at most 500. Default: `100`. |

**Example:** `wcat reminders claim --account telegram:1 --json`

### `wcat reminders acknowledge`

confirm that a handed-out reminder was shown

This command changes the local store or your files.

```sh
wcat reminders acknowledge <id> <receipt> [options]
```

| Argument | | What it is |
|---|---|---|
| `id` | required | the reminder's id. |
| `receipt` | required | the receipt reminders claim handed out with it. |

| Option | What it does |
|---|---|
| `--account <account>` | the account it acts as: provider:account, such as telegram:1 or email:personal. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat reminders acknowledge 3 3:1 --account telegram:1`

### `wcat reminders cancel`

cancel a reminder

This command changes the local store or your files.

```sh
wcat reminders cancel <id> [options]
```

| Argument | | What it is |
|---|---|---|
| `id` | required | the reminder's id. |

| Option | What it does |
|---|---|
| `--account <account>` | the account it acts as: provider:account, such as telegram:1 or email:personal. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat reminders cancel 3 --account telegram:1`

### `wcat reminders update`

move a reminder to another time

This command changes the local store or your files.

```sh
wcat reminders update <id> [options]
```

| Argument | | What it is |
|---|---|---|
| `id` | required | the reminder's id. |

| Option | What it does |
|---|---|
| `--account <account>` | the account it acts as: provider:account, such as telegram:1 or email:personal. |
| `--json` | print JSON; --json=id,title keeps only those fields. |
| `--at-time <time>` | the new time: an ISO 8601 time with its UTC offset. |
| `--revision <n>` | the reminder's current revision, as reminders list gives it. |

**Example:** `wcat reminders update 3 --revision 1 --at-time 2026-10-21T09:00:00+02:00 --account telegram:1`

## `wcat vocabulary`

canonical projects, tags and topics with explicit aliases

### `wcat vocabulary inspect`

preview two tags' assignments, aliases, automatic claims and links before consolidation; writes and merges nothing

```sh
wcat vocabulary inspect <source> <survivor> [options]
```

| Argument | | What it is |
|---|---|---|
| `source` | required | the duplicate tag:<id> to inspect, from vocabulary list. |
| `survivor` | required | the canonical tag:<id> you would keep; nothing is merged. |

| Option | What it does |
|---|---|
| `--fingerprint <hash>` | the current fingerprint from unfiltered vocabulary list. |
| `--max-rows <n>` | dependency row budget, 1–20000 (default 5000). |
| `--max-read-bytes <bytes>` | dependency byte budget, 1–16777216 (default 1048576). |
| `--limit <n>` | samples per table, 1–100 (default 10); counts remain complete. |
| `--json` | print the standard JSON answer. |

**Example:** `wcat vocabulary inspect tag:1 tag:2 --fingerprint v1:all:all:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa --limit 5 --json`

### `wcat vocabulary list`

list canonical IDs, aliases, usage counts and a preview fingerprint

```sh
wcat vocabulary list [query] [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | optional | field:value terms that narrow the list — the fields are below. |

| Option | What it does |
|---|---|
| `--max-entries <n>` | catalog input budget, not a page size. |
| `--max-read-bytes <bytes>` | catalog input byte budget. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat vocabulary list kind:tag`

### `wcat vocabulary show`

the project, tag or topic an exact name or alias names; ambiguity is reported

```sh
wcat vocabulary show <name> [options]
```

| Argument | | What it is |
|---|---|---|
| `name` | required | the name or alias to look up, exactly. |

| Option | What it does |
|---|---|
| `--kind <kind>` | project, tag or topic. |
| `--scope <scope>` | personal or work projects. |
| `--max-entries <n>` | catalog input budget, not a page size. |
| `--max-read-bytes <bytes>` | catalog input byte budget. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat vocabulary show Harbour --kind project`

### `wcat vocabulary check`

check a new name for an existing label or likely duplicates before vocabulary create, or without a name the whole vocabulary for likely synonyms. It merges and creates nothing

```sh
wcat vocabulary check [name] [options]
```

| Argument | | What it is |
|---|---|---|
| `name` | optional | a tag or topic you mean to create; without it, the whole vocabulary. |

| Option | What it does |
|---|---|
| `--kind <kind>` | project, tag or topic. |
| `--scope <scope>` | personal or work projects. |
| `--max-entries <n>` | catalog input budget, not a page size. |
| `--max-read-bytes <bytes>` | catalog input byte budget. |
| `--json` | print JSON; --json=id,title keeps only those fields. |
| `--min-similarity <n>` | without a name: minimum lexical similarity, 0.65–1. |
| `--max-comparisons <n>` | without a name: most name comparisons. |
| `--limit <n>` | without a name: most candidate pairs. |

**Example:** `wcat vocabulary check on-boarding --kind tag`, `wcat vocabulary check --limit 20 --json`

### `wcat vocabulary create`

owner: create a distinct tag or topic after vocabulary check <name>

This command changes the local store or your files.

```sh
wcat vocabulary create <name> [options]
```

| Argument | | What it is |
|---|---|---|
| `name` | required | the new tag or topic. |

| Option | What it does |
|---|---|
| `--kind <kind>` | tag or topic. |
| `--fingerprint <hash>` | the creation_fingerprint vocabulary check <name> gave. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat vocabulary create onboarding --kind tag --fingerprint 3f9a`

### `wcat vocabulary aliases`

owner-reviewed aliases on stable canonical IDs

#### `wcat vocabulary aliases add`

owner: add another name for a project, tag or topic

This command changes the local store or your files.

```sh
wcat vocabulary aliases add <reference> <name> [options]
```

| Argument | | What it is |
|---|---|---|
| `reference` | required | project:<id>, tag:<id> or topic:<id>, from vocabulary list. |
| `name` | required | the other name. |

| Option | What it does |
|---|---|
| `--fingerprint <hash>` | the current vocabulary preview fingerprint. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat vocabulary aliases add project:2 Harbor --fingerprint 3f9a`

#### `wcat vocabulary aliases remove`

owner: remove another name from a project, tag or topic

This command changes the local store or your files.

```sh
wcat vocabulary aliases remove <reference> <alias-id> [options]
```

| Argument | | What it is |
|---|---|---|
| `reference` | required | project:<id>, tag:<id> or topic:<id>, from vocabulary list. |
| `alias-id` | required | the alias's id, from vocabulary list. |

| Option | What it does |
|---|---|
| `--fingerprint <hash>` | the current vocabulary preview fingerprint. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat vocabulary aliases remove project:2 5 --fingerprint 3f9a`

## `wcat memories`

what agents and you concluded, with evidence; you confirm an agent's

### `wcat memories add`

write a memory; an agent's waits as proposed until you confirm it

This command changes the local store or your files.

```sh
wcat memories add <text> [options]
```

| Argument | | What it is |
|---|---|---|
| `text` | required | what is true, in a sentence or two. |

| Option | What it does |
|---|---|
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--quote <ref=words...>` | the words an --evidence reference says that this rests on, as <ref>=<words>, one per reference. A later check raises nothing while the source still says them. |
| `--kind <kind>` | summary, digest, preference. |
| `--scope <scope>` | personal or work. |
| `--evidence <ref...>` | what shows it: msg:, note:, meeting:, person: or another reference. |
| `--subject <ref>` | what it is about, as a reference. |
| `--project <project>` | the project it belongs to: its key or project:<id>. |
| `--supersedes <ref>` | the memory this one corrects, superseded once this one is confirmed; an agent's waits until you confirm it. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Returns:** memory — ref, id, kind, text, subject, author, model, confidence, and 13 more; every field: wcat commands info memories add

**Example:** `wcat memories add 'Kai prefers Friday meetings' --kind preference --scope work --evidence note:12`

### `wcat memories list`

memories, newest first

```sh
wcat memories list [query] [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | optional | field:value terms that narrow the list — the fields are below. |

| Option | What it does |
|---|---|
| `--limit <n>` | most memories on a page, up to 500. Default: `100`. |
| `--page <n>` | which page, from 1. Default: `1`. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Returns:** memory — ref, id, kind, text, subject, author, model, confidence, and 13 more; every field: wcat commands info memories list

**Example:** `wcat memories list status:proposed kind:preference`

### `wcat memories show`

one memory with its evidence

```sh
wcat memories show <ref> [options]
```

| Argument | | What it is |
|---|---|---|
| `ref` | required | memory:<id>. |

| Option | What it does |
|---|---|
| `--sources` | read each piece of evidence back: who, when, a short excerpt, and whether it is gone. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Returns:** memory — ref, id, kind, text, subject, author, model, confidence, and 13 more; every field: wcat commands info memories show

**Example:** `wcat memories show memory:4 --sources`

### `wcat memories update`

move a memory to another project, or to none

This command changes the local store or your files.

```sh
wcat memories update <ref> [options]
```

| Argument | | What it is |
|---|---|---|
| `ref` | required | memory:<id>. |

| Option | What it does |
|---|---|
| `--project <project>` | the project's key or project:<id>; none takes it out of its project. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Returns:** memory — ref, id, kind, text, subject, author, model, confidence, and 13 more; every field: wcat commands info memories update

**Example:** `wcat memories update memory:4 --project SYH`, `wcat memories update memory:4 --project none`

### `wcat memories confirm`

stand behind a memory: its evidence was checked now

This command changes the local store or your files.

```sh
wcat memories confirm <ref> [options]
```

| Argument | | What it is |
|---|---|---|
| `ref` | required | memory:<id>. |

| Option | What it does |
|---|---|
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--json` | print JSON; --json=id,title keeps only those fields. |
| `--reason <text>` | why, in a few words; required when an agent decides for you. |

**Returns:** memory — ref, id, kind, text, subject, author, model, confidence, and 13 more; every field: wcat commands info memories confirm

**Example:** `wcat memories confirm memory:4`

### `wcat memories invalidate`

mark a memory whose evidence no longer holds

This command changes the local store or your files.

```sh
wcat memories invalidate <ref> [options]
```

| Argument | | What it is |
|---|---|---|
| `ref` | required | memory:<id>. |

| Option | What it does |
|---|---|
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--json` | print JSON; --json=id,title keeps only those fields. |
| `--reason <text>` | why, in a few words; required when an agent decides for you. |

**Returns:** memory — ref, id, kind, text, subject, author, model, confidence, and 13 more; every field: wcat commands info memories invalidate

**Example:** `wcat memories invalidate memory:4`

### `wcat memories remove`

forget a memory: erase its text, its links to sources and its search entry

This command changes the local store or your files.

```sh
wcat memories remove <ref> [options]
```

| Argument | | What it is |
|---|---|---|
| `ref` | required | memory:<id>. |

| Option | What it does |
|---|---|
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--json` | print JSON; --json=id,title keeps only those fields. |
| `--reason <text>` | why, in a few words; required when an agent decides for you. |

**Example:** `wcat memories remove memory:4`

### `wcat memories check`

compare what memories and facts cite with the sources now, least recently checked first: a changed source that still says the quoted words is signed again; one that changed, went or was replaced raises a memory_source_review for you to decide. Status never changes here. changed_refs lists changed sources no findings batch reads yet, for an agent to read again with projects actions add; a run names a change once, so --since-time also lists those an earlier run, such as wcat sync's, already found. wcat sync runs it too

This command changes the local store or your files.

```sh
wcat memories check [options]
```

| Option | What it does |
|---|---|
| `--limit <n>` | most evidence links this run, up to 10000. Default: `500`. |
| `--since-time <time>` | changed_refs also lists sources earlier runs found changed since then: 12h, 7d or a date (2026-11-01). |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Returns:** source check — checked, baselined, raised, refreshed, closed, changed_refs; every field: wcat commands info memories check

**Example:** `wcat memories check`, `wcat memories check --limit 2000 --json`

### `wcat memories challenge`

say a memory is contradicted, citing what shows it: this opens its memory_source_review, or adds to the open one, and changes nothing else. Only you decide it (wcat review show <id>). An agent may run it

This command changes the local store or your files.

```sh
wcat memories challenge <ref> [options]
```

| Argument | | What it is |
|---|---|---|
| `ref` | required | memory:<id>. |

| Option | What it does |
|---|---|
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--evidence <ref...>` | what contradicts it: msg:, note:, meeting:, fact: or another reference. |
| `--reason <text>` | why it no longer holds, in a sentence. |
| `--suggest <text>` | what the memory should say instead, for you to take or leave. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat memories challenge memory:4 --evidence note:15 --reason 'the later note moves delivery to the 30th'`, `wcat memories challenge memory:4 --evidence note:15 --reason 'moved' --suggest 'Delivery is on the 30th' --json`

## `wcat mentions`

phones, e-mail, links, names and addresses in documents, notes and mail

### `wcat mentions list`

the mentions in the texts --source names matching the query, newest text first

```sh
wcat mentions list [query] [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | optional | fields below; a bare word is a value. |

| Option | What it does |
|---|---|
| `--source <accounts>` | which texts, separated by commas: provider:account (email:personal), a provider (email), a kind (mail, notes, documents) or group:<name>. |
| `--limit <n>` | most mentions. Default: `100`. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat mentions list kind:phone --source notes`, `wcat mentions list domain:example.com --source email:personal,email:work --json`, `wcat mentions list kind:place --source mail`

### `wcat mentions show`

one mention, the text around it, how many other places hold its value, and who it may be

```sh
wcat mentions show <id> [options]
```

| Argument | | What it is |
|---|---|---|
| `id` | required | the mention's id, from wcat mentions list. |

| Option | What it does |
|---|---|
| `--source <accounts>` | the mailboxes a mail mention may be in: email:<account>, email or group:<name>. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat mentions show 12`, `wcat mentions show 40 --source email:personal --json`

### `wcat mentions confirm`

say what a mention is: a phone's owner everywhere it is written, the stored document, who a name means

This command changes the local store or your files.

```sh
wcat mentions confirm <id> [person] [options]
```

| Argument | | What it is |
|---|---|---|
| `id` | required | the mention's id, from wcat mentions list. |
| `person` | optional | person:<uid> or organization:<id> that owns the phone or address, or a name means. |

| Option | What it does |
|---|---|
| `--source <accounts>` | the mailboxes a mail mention may be in: email:<account>, email or group:<name>. |
| `--json` | print JSON; --json=id,title keeps only those fields. |
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |

**Example:** `wcat mentions confirm 12 person:7`, `wcat mentions confirm 40 --source email:personal`

### `wcat mentions reject`

not a real mention: dismiss its value everywhere and on later imports; a name only where it is

This command changes the local store or your files.

```sh
wcat mentions reject <id> [options]
```

| Argument | | What it is |
|---|---|---|
| `id` | required | the mention's id, from wcat mentions list. |

| Option | What it does |
|---|---|
| `--source <accounts>` | the mailboxes a mail mention may be in: email:<account>, email or group:<name>. |
| `--json` | print JSON; --json=id,title keeps only those fields. |
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |

**Example:** `wcat mentions reject 12`, `wcat mentions reject 40 --source email:personal`

## `wcat facts`

what happened — said, asked, decided, promised — with evidence

### `wcat facts add`

record a fact; an agent's waits as proposed until you confirm it

This command changes the local store or your files.

```sh
wcat facts add <statement> [options]
```

| Argument | | What it is |
|---|---|---|
| `statement` | required | what happened, in one sentence. |

| Option | What it does |
|---|---|
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--quote <ref=words...>` | the words an --evidence reference says that this rests on, as <ref>=<words>, one per reference. A later check raises nothing while the source still says them. |
| `--kind <kind>` | fact, statement, question, decision, promise. |
| `--evidence <ref...>` | what shows it: msg:, note:, meeting:, person: or another reference. |
| `--project <project>` | the project it belongs to: its key or project:<id>. |
| `--subject <ref>` | what it is about, as a reference. |
| `--occurred-time <time>` | when it happened, as the evidence shows, ISO 8601. |
| `--scope <scope>` | personal or work. |
| `--supersedes <ref>` | the proposed or accepted fact this one corrects; it stays, marked superseded once this one is accepted. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Returns:** fact — ref, id, kind, text, status, project, subject, occurred_at, and 14 more; every field: wcat commands info facts add

**Example:** `wcat facts add 'We moved the launch to spring' --kind decision --evidence 'msg:telegram/1/77/42' --project HRB`

### `wcat facts list`

facts, latest first

```sh
wcat facts list [query] [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | optional | field:value terms that narrow the list — the fields are below. |

| Option | What it does |
|---|---|
| `--limit <n>` | most facts on a page, up to 500. Default: `100`. |
| `--page <n>` | which page, from 1. Default: `1`. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Returns:** fact — ref, id, kind, text, status, project, subject, occurred_at, and 14 more; every field: wcat commands info facts list

**Example:** `wcat facts list kind:decision project:HRB`

### `wcat facts show`

one fact with its evidence

```sh
wcat facts show <ref> [options]
```

| Argument | | What it is |
|---|---|---|
| `ref` | required | fact:<id>. |

| Option | What it does |
|---|---|
| `--sources` | read each piece of evidence back: who, when, a short excerpt, and whether it is gone. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Returns:** fact — ref, id, kind, text, status, project, subject, occurred_at, and 14 more; every field: wcat commands info facts show

**Example:** `wcat facts show fact:4 --sources`

### `wcat facts confirm`

stand behind a fact an agent proposed; a fact it supersedes stops holding. wcat review confirm decides many

This command changes the local store or your files.

```sh
wcat facts confirm <ref> [options]
```

| Argument | | What it is |
|---|---|---|
| `ref` | required | fact:<id>. |

| Option | What it does |
|---|---|
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--json` | print JSON; --json=id,title keeps only those fields. |
| `--reason <text>` | why, in a few words; required when an agent decides for you. |

**Returns:** fact — ref, id, kind, text, status, project, subject, occurred_at, and 14 more; every field: wcat commands info facts confirm

**Example:** `wcat facts confirm fact:4`

### `wcat facts revoke`

take back your approval of an agent's fact; it waits as proposed again. Not for a correction or your own fact

This command changes the local store or your files.

```sh
wcat facts revoke <ref> [options]
```

| Argument | | What it is |
|---|---|---|
| `ref` | required | fact:<id>. |

| Option | What it does |
|---|---|
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--json` | print JSON; --json=id,title keeps only those fields. |
| `--reason <text>` | why, in a few words; required when an agent decides for you. |

**Returns:** fact — ref, id, kind, text, status, project, subject, occurred_at, and 14 more; every field: wcat commands info facts revoke

**Example:** `wcat facts revoke fact:4`

### `wcat facts reverse`

an accepted decision no longer holds, and nothing replaced it

This command changes the local store or your files.

```sh
wcat facts reverse <ref> [options]
```

| Argument | | What it is |
|---|---|---|
| `ref` | required | fact:<id>. |

| Option | What it does |
|---|---|
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--json` | print JSON; --json=id,title keeps only those fields. |
| `--reason <text>` | why, in a few words; required when an agent decides for you. |

**Returns:** fact — ref, id, kind, text, status, project, subject, occurred_at, and 14 more; every field: wcat commands info facts reverse

**Example:** `wcat facts reverse fact:4`

### `wcat facts reject`

turn down a fact an agent proposed; it stays, marked rejected

This command changes the local store or your files.

```sh
wcat facts reject <ref> [options]
```

| Argument | | What it is |
|---|---|---|
| `ref` | required | fact:<id>. |

| Option | What it does |
|---|---|
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--json` | print JSON; --json=id,title keeps only those fields. |
| `--reason <text>` | why, in a few words; required when an agent decides for you. |

**Returns:** fact — ref, id, kind, text, status, project, subject, occurred_at, and 14 more; every field: wcat commands info facts reject

**Example:** `wcat facts reject fact:4`

### `wcat facts remove`

forget a fact: erase its text, its links to sources and its tags. wcat facts history keeps who removed it, when and why, never what it said

This command changes the local store or your files.

```sh
wcat facts remove <ref> [options]
```

| Argument | | What it is |
|---|---|---|
| `ref` | required | fact:<id>. |

| Option | What it does |
|---|---|
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--json` | print JSON; --json=id,title keeps only those fields. |
| `--reason <text>` | why, in a few words; required when an agent decides for you. |

**Example:** `wcat facts remove fact:4 --reason 'recorded twice'`

### `wcat facts history`

the facts removed, newest first: who removed each, when and why, never what it said

```sh
wcat facts history [options]
```

| Option | What it does |
|---|---|
| `--limit <n>` | most removals on a page, up to 500. Default: `100`. |
| `--page <n>` | which page, from 1. Default: `1`. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat facts history --limit 20`

### `wcat facts challenge`

say a fact is contradicted, citing what shows it: this opens its memory_source_review, or adds to the open one, and changes nothing else. Only you decide it (wcat review show <id>). An agent may run it

This command changes the local store or your files.

```sh
wcat facts challenge <ref> [options]
```

| Argument | | What it is |
|---|---|---|
| `ref` | required | fact:<id>. |

| Option | What it does |
|---|---|
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--evidence <ref...>` | what contradicts it: msg:, note:, meeting:, fact: or another reference. |
| `--reason <text>` | why it no longer holds, in a sentence. |
| `--suggest <text>` | what the fact should say instead, for you to take or leave. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat facts challenge fact:4 --evidence 'msg:telegram/1/77/50' --reason 'reversed in chat'`

## `wcat invoices`

invoices you issued or received, with their lines and what paid them; amounts per currency

### `wcat invoices list`

invoices, newest first; review:proposed lists what waits for you

```sh
wcat invoices list [query] [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | optional | field:value terms that narrow the list — the fields are below. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=ref,title keeps only those fields. |
| `--limit <n>` | most invoices, up to 500. Default: `100`. |

**Example:** `wcat invoices list project:HRB open:true`, `wcat invoices list review:proposed --json`

### `wcat invoices show`

one invoice with its lines and the payments allocated to it

```sh
wcat invoices show <ref> [options]
```

| Argument | | What it is |
|---|---|---|
| `ref` | required | invoice:<id>. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Example:** `wcat invoices show invoice:4`

### `wcat invoices add`

record an invoice of one line, and add more with invoices lines add; yours is confirmed at once; an agent's waits as proposed for you in wcat review

This command changes the local store or your files.

```sh
wcat invoices add <amount> <currency> <description> [options]
```

| Argument | | What it is |
|---|---|---|
| `amount` | required | a decimal, such as 50000.00. |
| `currency` | required | ISO 4217, such as RUB. |
| `description` | required | what it bills, in a few words. |

| Option | What it does |
|---|---|
| `--person <uid>` | the person billed or billing: person:<id>. |
| `--organization <organization>` | the organization billed or billing: organization:<id>. |
| `--kind <kind>` | receivable (you bill them) or payable (they bill you). |
| `--title <title>` | the invoice's number, as printed on it. |
| `--occurred-time <time>` | the day it was issued, such as 2026-11-01. |
| `--due <time>` | the day it is due, such as 2026-11-15. |
| `--project <project>` | the project it belongs to: its key or project:<id>. |
| `--reason <text>` | why an agent proposes it, for the owner who decides. |
| `--evidence <ref...>` | what shows it, up to 8: msg:, note:, document: or another reference. |
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Example:** `wcat invoices add 50000.00 RUB Bed rental, November --kind receivable --organization organization:3 --project HRB`, `wcat invoices add 1200.50 EUR Hosting --kind payable --person person:7 --title 2026-118 --due 2026-11-15`

### `wcat invoices lines`

the lines of an invoice, each a quantity at a price; its total is their sum. you change any invoice's lines; an agent only those of an invoice it proposed that is still proposed

#### `wcat invoices lines add`

add a line at the end of an invoice that is not void; the total never falls below what confirmed payments settled: quantity × price, and the total becomes the sum of the lines. With --product its name and price are copied, so a later price change leaves the line as it is, and --amount sets another price; without --product, --amount is needed. you change any invoice's lines; an agent only those of an invoice it proposed that is still proposed

This command changes the local store or your files.

```sh
wcat invoices lines add <invoice> <quantity> [description] [options]
```

| Argument | | What it is |
|---|---|---|
| `invoice` | required | invoice:<id>. |
| `quantity` | required | how many, a decimal such as 12 or 1.5. |
| `description` | optional | what the line is, in a few words; the product's name when left out. |

| Option | What it does |
|---|---|
| `--product <product>` | the product or service it is: its name and price are copied onto the line. |
| `--amount <decimal>` | the price of one, such as 10000.00; the product's when left out with --product. |
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Example:** `wcat invoices lines add invoice:4 1 --product product:4`, `wcat invoices lines add invoice:4 2 Delivery --amount 1500.00`

#### `wcat invoices lines remove`

take a line off an invoice; the others keep their positions, and the last line stays. you change any invoice's lines; an agent only those of an invoice it proposed that is still proposed

This command changes the local store or your files.

```sh
wcat invoices lines remove <invoice> <position> [options]
```

| Argument | | What it is |
|---|---|---|
| `invoice` | required | invoice:<id>. |
| `position` | required | the line's position, from 1, as invoices show lists it. |

| Option | What it does |
|---|---|
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Example:** `wcat invoices lines remove invoice:4 2`

## `wcat payments`

money paid to you or by you, and the invoices each payment settles; amounts per currency

### `wcat payments list`

payments, newest first; review:proposed lists what waits for you

```sh
wcat payments list [query] [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | optional | field:value terms that narrow the list — the fields are below. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=ref,title keeps only those fields. |
| `--limit <n>` | most payments, up to 500. Default: `100`. |

**Example:** `wcat payments list project:HRB direction:in`, `wcat payments list review:proposed --json`

### `wcat payments show`

one payment with the invoices it is allocated to

```sh
wcat payments show <ref> [options]
```

| Argument | | What it is |
|---|---|---|
| `ref` | required | payment:<id>. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Example:** `wcat payments show payment:9`

### `wcat payments add`

record a payment, or with --refund-of a refund of one; yours is confirmed at once; an agent's waits as proposed for you in wcat review. payments allocate matches it to an invoice

This command changes the local store or your files.

```sh
wcat payments add <amount> <currency> [options]
```

| Argument | | What it is |
|---|---|---|
| `amount` | required | a decimal, such as 50000.00. |
| `currency` | required | ISO 4217, such as RUB. |

| Option | What it does |
|---|---|
| `--person <uid>` | the person who paid or was paid: person:<id>. |
| `--organization <organization>` | the organization who paid or was paid: organization:<id>. |
| `--kind <kind>` | in (paid to you) or out (paid by you). |
| `--title <title>` | the payment's reference, such as the bank's purpose line. |
| `--occurred-time <time>` | the day it was paid, such as 2026-11-01; today when left out. |
| `--refund-of <payment>` | the payment this one gives money back for, going the other way: payment:<id>. |
| `--project <project>` | the project it belongs to: its key or project:<id>. |
| `--reason <text>` | why an agent proposes it, for the owner who decides. |
| `--evidence <ref...>` | what shows it, up to 8: msg:, note:, document: or another reference. |
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Example:** `wcat payments add 25000.00 RUB --kind in --organization organization:3 --occurred-time 2026-11-01 --project HRB`, `wcat payments add 5000.00 RUB --kind out --organization organization:3 --refund-of payment:9`

### `wcat payments allocate`

settle part of an invoice with part of a payment, in their one currency, never beyond either; an agent allocates only a payment it proposed

This command changes the local store or your files.

```sh
wcat payments allocate <payment> <invoice> <amount> [options]
```

| Argument | | What it is |
|---|---|---|
| `payment` | required | payment:<id>. |
| `invoice` | required | invoice:<id>. |
| `amount` | required | a decimal, such as 25000.00. |

| Option | What it does |
|---|---|
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Example:** `wcat payments allocate payment:9 invoice:4 25000.00`

### `wcat payments unlink`

take back what a payment settles of an invoice, to allocate it again; you set right a confirmed payment's wrong split, and an agent unlinks only a still-proposed payment it proposed

This command changes the local store or your files.

```sh
wcat payments unlink <payment> <invoice> [options]
```

| Argument | | What it is |
|---|---|---|
| `payment` | required | payment:<id>. |
| `invoice` | required | invoice:<id>. |

| Option | What it does |
|---|---|
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Example:** `wcat payments unlink payment:9 invoice:4`

## `wcat orders`

orders you placed or took, for whom, from which shop, and how far delivery got

### `wcat orders list`

orders, newest first; review:proposed is what waits for you

```sh
wcat orders list [query] [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | optional | field:value terms that narrow the list — the fields are below. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=ref,title keeps only those fields. |
| `--limit <n>` | most orders, up to 500. Default: `100`. |

**Example:** `wcat orders list status:shipped`, `wcat orders list number:A-1042 'supplier:"Shop One"' --json`

### `wcat orders show`

one order with its customer, shop, amount, status and the mail it was read from

```sh
wcat orders show <ref> [options]
```

| Argument | | What it is |
|---|---|---|
| `ref` | required | order:<id>. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Example:** `wcat orders show order:3`

### `wcat orders add`

record a placed order; yours is confirmed at once, an agent's waits as proposed for you in wcat review

This command changes the local store or your files.

```sh
wcat orders add <shop> [amount] [currency] [options]
```

| Argument | | What it is |
|---|---|---|
| `shop` | required | the shop or supplier, as its mail names it. |
| `amount` | optional | the order's amount, a decimal such as 2499.00. |
| `currency` | optional | ISO 4217, such as RUB; given with the amount. |

| Option | What it does |
|---|---|
| `--kind <kind>` | why it was ordered: personal, business, client, other. |
| `--person <uid>` | whom it is for, when not you: person:<id>. |
| `--organization <organization>` | whom it is for, when not you: organization:<id>. |
| `--title <title>` | the shop's order number. |
| `--occurred-time <time>` | the day it was ordered, such as 2026-11-01. |
| `--project <project>` | the project it belongs to: its key or project:<id>. |
| `--reason <text>` | why an agent proposes it, for the owner who decides. |
| `--evidence <ref...>` | what shows it, up to 8: msg:, note:, document: or another reference. |
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Example:** `wcat orders add 'Shop One' 2499.00 RUB --kind personal --title A-1042`, `wcat orders add 'Office Supply' --kind client --organization organization:3`

### `wcat orders lines`

the lines of an order, each a quantity at a price; its total is their sum. you change any order's lines; an agent only those of an order it proposed that is still proposed

#### `wcat orders lines add`

add a line at the end of an order that has a currency (orders add with an amount): quantity × price, and the total becomes the sum of the lines. With --product its name and price are copied, so a later price change leaves the line as it is, and --amount sets another price; without --product, --amount is needed. you change any order's lines; an agent only those of an order it proposed that is still proposed

This command changes the local store or your files.

```sh
wcat orders lines add <order> <quantity> [description] [options]
```

| Argument | | What it is |
|---|---|---|
| `order` | required | order:<id>. |
| `quantity` | required | how many, a decimal such as 12 or 1.5. |
| `description` | optional | what the line is, in a few words; the product's name when left out. |

| Option | What it does |
|---|---|
| `--product <product>` | the product or service it is: its name and price are copied onto the line. |
| `--amount <decimal>` | the price of one, such as 10000.00; the product's when left out with --product. |
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Example:** `wcat orders lines add order:3 12 --product product:4`, `wcat orders lines add order:3 1 Rental, first week --product product:4 --amount 2000.00`, `wcat orders lines add order:3 2 Helmet --amount 2500.00`

#### `wcat orders lines remove`

take a line off an order; the others keep their positions, and the last line stays. you change any order's lines; an agent only those of an order it proposed that is still proposed

This command changes the local store or your files.

```sh
wcat orders lines remove <order> <position> [options]
```

| Argument | | What it is |
|---|---|---|
| `order` | required | order:<id>. |
| `position` | required | the line's position, from 1, as orders show lists it. |

| Option | What it does |
|---|---|
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Example:** `wcat orders lines remove order:3 2`

## `wcat pipelines`

sales pipelines: the stages a deal or a lead goes through, in order, and how many get through each

### `wcat pipelines list`

every pipeline with its stages in order and how many open deals or leads stand in each

```sh
wcat pipelines list [query] [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | optional | field:value terms that narrow the list — the fields are below. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Returns:** pipeline — id, ref, name, kind, account, external_id, stages, created_at, and 9 more; every field: wcat commands info pipelines list

**Example:** `wcat pipelines list`, `wcat pipelines list kind:lead --json`

### `wcat pipelines show`

one pipeline's funnel: per stage the open deals or leads in it, how many reached it, and the share that went on to the next stage; then won, lost and the win rate

```sh
wcat pipelines show <pipeline> [options]
```

| Argument | | What it is |
|---|---|---|
| `pipeline` | required | pipeline:<id>, or a name only one pipeline has. |

| Option | What it does |
|---|---|
| `--since-time <time>` | count only deals or leads made since this day, such as 2026-09-01. |
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Returns:** pipeline — id, ref, name, kind, account, external_id, stages, created_at, and 9 more; every field: wcat commands info pipelines show

**Example:** `wcat pipelines show pipeline:2`, `wcat pipelines show Sales --since-time 2026-09-01`

### `wcat pipelines add`

make a pipeline with its stages in order; a stage named won or lost (any letter case) ends a deal or lead as that

This command changes the local store or your files.

```sh
wcat pipelines add <name> <stage> [options]
```

| Argument | | What it is |
|---|---|---|
| `name` | required | the pipeline's name, such as Sales. |
| `stage` | required | its stages in order, such as Call Quote Contract won lost. |

| Option | What it does |
|---|---|
| `--kind <kind>` | what it holds: deal or lead; deal by default. |
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Example:** `wcat pipelines add Sales Call Quote Contract won lost`, `wcat pipelines add Inbound new called --kind lead`

## `wcat deals`

deals you hope to win: the client, the expected amount, the stage and whether it was won or lost

### `wcat deals list`

deals, newest first; status:open is what is still in play

```sh
wcat deals list [query] [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | optional | field:value terms that narrow the list — the fields are below. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=ref,title keeps only those fields. |
| `--limit <n>` | most deals, up to 500. Default: `100`. |

**Returns:** deal — id, ref, kind, title, summary, pipeline, pipeline_name, stage, and 30 more; every field: wcat commands info deals list

**Example:** `wcat deals list status:open project:HRB`, `wcat deals list stage:Quote --json`

### `wcat deals show`

one deal with its pipeline, stage, status, amount, the people on it and what it was read from

```sh
wcat deals show <ref> [options]
```

| Argument | | What it is |
|---|---|---|
| `ref` | required | deal:<id>. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Returns:** deal — id, ref, kind, title, summary, pipeline, pipeline_name, stage, and 30 more; every field: wcat commands info deals show

**Example:** `wcat deals show deal:5`

### `wcat deals context`

one deal whole: its stages, client, people with their roles and standing, owner, project, invoices and payments as stored, its people's messages, mail and meetings in its lifetime (`proposed`: they share people, nothing links them), open tasks and `coverage`. A stage named Won is not a payment

```sh
wcat deals context <ref> [options]
```

| Argument | | What it is |
|---|---|---|
| `ref` | required | deal:<id>. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=ref,title keeps only those fields. |
| `--brief` | the compact form for a model's context: names, roles, totals and counts. |
| `--limit <n>` | most items in each section. Default: `20`. |

**Returns:** deal context — deal, stages, organization, participants, owner, project, money, window, and 3 more; every field: wcat commands info deals context

**Example:** `wcat deals context deal:5`, `wcat deals context deal:5 --brief --json`

### `wcat deals update`

set the project a deal belongs to; a CRM's copy takes it too, and the next sync keeps it. An empty value clears it

This command changes the local store or your files.

```sh
wcat deals update <ref> [options]
```

| Argument | | What it is |
|---|---|---|
| `ref` | required | deal:<id>. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=ref,title keeps only those fields. |
| `--project <project>` | the project: its key or project:<id>. |

**Returns:** deal — id, ref, kind, title, summary, pipeline, pipeline_name, stage, and 30 more; every field: wcat commands info deals update

**Example:** `wcat deals update deal:5 --project HRB`

### `wcat deals add`

record a deal in a stage; it is written at once, whoever runs it

This command changes the local store or your files.

```sh
wcat deals add <title> <stage> [amount] [currency] [options]
```

| Argument | | What it is |
|---|---|---|
| `title` | required | what you hope to sell, such as 'Site for the clinic'. |
| `stage` | required | the stage it is in; Sales/Quote or pipeline:3/Quote names the pipeline when two have that stage. |
| `amount` | optional | the expected amount, a decimal such as 500000.00. |
| `currency` | optional | ISO 4217, such as RUB; given with the amount. |

| Option | What it does |
|---|---|
| `--organization <organization>` | the client: organization:<id>. |
| `--person <uid>` | a person on the deal: person:<id>; repeat for another, up to 20. |
| `--role <role>` | what those people are on it: owner, contact, decision-maker, influencer; contact by default. |
| `--due <time>` | the day you expect it to close, such as 2026-12-01. |
| `--project <project>` | the project it belongs to: its key or project:<id>. |
| `--reason <text>` | why an agent records it, kept with it. |
| `--evidence <ref...>` | what shows it, up to 8: msg:, note:, document: or another reference. |
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Returns:** deal — id, ref, kind, title, summary, pipeline, pipeline_name, stage, and 30 more; every field: wcat commands info deals add

**Example:** `wcat deals add 'Site for the clinic' Call 500000.00 RUB --organization organization:3 --project HRB`, `wcat deals add 'Support contract' Sales/Quote --person person:7 --role decision-maker --due 2026-12-01`

### `wcat deals move`

move a deal to another stage of its pipeline; a won or lost stage closes it, an open one reopens it

This command changes the local store or your files.

```sh
wcat deals move <ref> <stage> [options]
```

| Argument | | What it is |
|---|---|---|
| `ref` | required | deal:<id>. |
| `stage` | required | a stage of the deal's pipeline by its name or stage:<id>; or a base stage's stage:<id>, which moves it to the one stage of its pipeline mapped there, and refuses several (with the candidates) or none. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Returns:** deal — id, ref, kind, title, summary, pipeline, pipeline_name, stage, and 30 more; every field: wcat commands info deals move

**Example:** `wcat deals move deal:5 Quote`, `wcat deals move deal:5 stage:5`

### `wcat deals close`

close a deal as won or lost; it moves to its pipeline's won or lost stage when there is one

This command changes the local store or your files.

```sh
wcat deals close <ref> <outcome> [options]
```

| Argument | | What it is |
|---|---|---|
| `ref` | required | deal:<id>. |
| `outcome` | required | won or lost. |

| Option | What it does |
|---|---|
| `--occurred-time <time>` | the day it closed, such as 2026-11-20; today when left out. |
| `--reason <text>` | why it was won or lost, kept with it. |
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Returns:** deal — id, ref, kind, title, summary, pipeline, pipeline_name, stage, and 30 more; every field: wcat commands info deals close

**Example:** `wcat deals close deal:5 won`, `wcat deals close deal:6 lost --reason 'chose a cheaper studio'`

## `wcat leads`

leads: first contacts in a lead pipeline, before they are deals

### `wcat leads list`

leads, newest first; status:open is what is still in play

```sh
wcat leads list [query] [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | optional | field:value terms that narrow the list — the fields are below. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=ref,title keeps only those fields. |
| `--limit <n>` | most leads, up to 500. Default: `100`. |

**Returns:** lead — id, ref, kind, title, summary, pipeline, pipeline_name, stage, and 30 more; every field: wcat commands info leads list

**Example:** `wcat leads list status:open`

### `wcat leads show`

one lead with its pipeline, stage, status, amount, the people on it and what it was read from

```sh
wcat leads show <ref> [options]
```

| Argument | | What it is |
|---|---|---|
| `ref` | required | lead:<id>. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Returns:** lead — id, ref, kind, title, summary, pipeline, pipeline_name, stage, and 30 more; every field: wcat commands info leads show

**Example:** `wcat leads show lead:3`

### `wcat leads context`

one lead whole: its stages, client, people with their roles and standing, owner, project, invoices and payments as stored, its people's messages, mail and meetings in its lifetime (`proposed`: they share people, nothing links them), open tasks and `coverage`. A stage named Won is not a payment

```sh
wcat leads context <ref> [options]
```

| Argument | | What it is |
|---|---|---|
| `ref` | required | lead:<id>. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=ref,title keeps only those fields. |
| `--brief` | the compact form for a model's context: names, roles, totals and counts. |
| `--limit <n>` | most items in each section. Default: `20`. |

**Returns:** deal context — deal, stages, organization, participants, owner, project, money, window, and 3 more; every field: wcat commands info leads context

**Example:** `wcat leads context lead:3 --brief`

### `wcat leads update`

set the project a lead belongs to; a CRM's copy takes it too, and the next sync keeps it. An empty value clears it

This command changes the local store or your files.

```sh
wcat leads update <ref> [options]
```

| Argument | | What it is |
|---|---|---|
| `ref` | required | lead:<id>. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=ref,title keeps only those fields. |
| `--project <project>` | the project: its key or project:<id>. |

**Returns:** lead — id, ref, kind, title, summary, pipeline, pipeline_name, stage, and 30 more; every field: wcat commands info leads update

**Example:** `wcat leads update lead:3 --project HRB`

### `wcat leads add`

record a lead in a stage; it is written at once, whoever runs it

This command changes the local store or your files.

```sh
wcat leads add <title> [stage] [amount] [currency] [options]
```

| Argument | | What it is |
|---|---|---|
| `title` | required | who or what came in, such as 'Call from the site'. |
| `stage` | optional | the stage it is in; the first stage of the only lead pipeline when left out. |
| `amount` | optional | the expected amount, a decimal such as 500000.00. |
| `currency` | optional | ISO 4217, such as RUB; given with the amount. |

| Option | What it does |
|---|---|
| `--organization <organization>` | the client: organization:<id>. |
| `--person <uid>` | a person on the lead: person:<id>; repeat for another, up to 20. |
| `--role <role>` | what those people are on it: owner, contact, decision-maker, influencer; contact by default. |
| `--due <time>` | the day you expect it to close, such as 2026-12-01. |
| `--project <project>` | the project it belongs to: its key or project:<id>. |
| `--reason <text>` | why an agent records it, kept with it. |
| `--evidence <ref...>` | what shows it, up to 8: msg:, note:, document: or another reference. |
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Returns:** lead — id, ref, kind, title, summary, pipeline, pipeline_name, stage, and 30 more; every field: wcat commands info leads add

**Example:** `wcat leads add 'Call from the site'`, `wcat leads add 'Clinic in Kazan' contacted --person person:9`

### `wcat leads move`

move a lead to another stage of its pipeline; a won or lost stage closes it, an open one reopens it

This command changes the local store or your files.

```sh
wcat leads move <ref> <stage> [options]
```

| Argument | | What it is |
|---|---|---|
| `ref` | required | lead:<id>. |
| `stage` | required | a stage of the lead's pipeline by its name or stage:<id>; or a base stage's stage:<id>, which moves it to the one stage of its pipeline mapped there, and refuses several (with the candidates) or none. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Returns:** lead — id, ref, kind, title, summary, pipeline, pipeline_name, stage, and 30 more; every field: wcat commands info leads move

**Example:** `wcat leads move lead:3 qualified`, `wcat leads move lead:3 stage:5`

### `wcat leads close`

close a lead as won or lost; it moves to its pipeline's won or lost stage when there is one

This command changes the local store or your files.

```sh
wcat leads close <ref> <outcome> [options]
```

| Argument | | What it is |
|---|---|---|
| `ref` | required | lead:<id>. |
| `outcome` | required | won or lost. |

| Option | What it does |
|---|---|
| `--occurred-time <time>` | the day it closed, such as 2026-11-20; today when left out. |
| `--reason <text>` | why it was won or lost, kept with it. |
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Returns:** lead — id, ref, kind, title, summary, pipeline, pipeline_name, stage, and 30 more; every field: wcat commands info leads close

**Example:** `wcat leads close lead:3 lost --reason 'no budget'`

## `wcat stages`

the owner's base stages of deals and of leads, the columns of a board across every pipeline and CRM, and how each other pipeline's stage maps onto them

### `wcat stages show`

the base set in order, with the open rows and mapped stages each column holds, and what is unsorted (unmapped or only suggested); the first use takes the owner's only own pipeline of the kind, or makes the default set in the owner's language; a read-only store shows that set without making it

```sh
wcat stages show <kind> [options]
```

| Argument | | What it is |
|---|---|---|
| `kind` | required | deal or lead: which base set. One of: `deal`, `lead`. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Returns:** base stage set — kind, pipeline, stages, unsorted; every field: wcat commands info stages show

**Example:** `wcat stages show deal`, `wcat stages show lead --json`

### `wcat stages create`

add a stage to the base set: an open one goes before the first won or lost stage, a won or lost one last; move puts it elsewhere

This command changes the local store or your files.

```sh
wcat stages create <kind> <name> [outcome] [options]
```

| Argument | | What it is |
|---|---|---|
| `kind` | required | deal or lead: which base set. One of: `deal`, `lead`. |
| `name` | required | the stage's name, once in its set. |
| `outcome` | optional | open, won or lost; open by default. One of: `open`, `won`, `lost`. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Returns:** base stage set — kind, pipeline, stages, unsorted; every field: wcat commands info stages create

**Example:** `wcat stages create deal Demo`, `wcat stages create lead Spam lost`

### `wcat stages rename`

rename a base stage; what maps to it stays mapped

This command changes the local store or your files.

```sh
wcat stages rename <kind> <stage> <name> [options]
```

| Argument | | What it is |
|---|---|---|
| `kind` | required | deal or lead: which base set. One of: `deal`, `lead`. |
| `stage` | required | the base stage, by its stage:<id> or its name. |
| `name` | required | its new name. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Returns:** base stage set — kind, pipeline, stages, unsorted; every field: wcat commands info stages rename

**Example:** `wcat stages rename deal Proposal 'Quote sent'`

### `wcat stages move`

put a base stage at another place in its set; unconfirmed suggestions follow the new order

This command changes the local store or your files.

```sh
wcat stages move <kind> <stage> <position> [options]
```

| Argument | | What it is |
|---|---|---|
| `kind` | required | deal or lead: which base set. One of: `deal`, `lead`. |
| `stage` | required | the base stage, by its stage:<id> or its name. |
| `position` | required | its new place, from 1. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Returns:** base stage set — kind, pipeline, stages, unsorted; every field: wcat commands info stages move

**Example:** `wcat stages move deal Negotiation 2`

### `wcat stages remove`

take a stage out of the base set: refused for the last of its outcome and for one the owner's own rows stood in; what was mapped to it waits for a new confirm

This command changes the local store or your files.

```sh
wcat stages remove <kind> <stage> [options]
```

| Argument | | What it is |
|---|---|---|
| `kind` | required | deal or lead: which base set. One of: `deal`, `lead`. |
| `stage` | required | the base stage, by its stage:<id> or its name. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Returns:** base stage set — kind, pipeline, stages, unsorted; every field: wcat commands info stages remove

**Example:** `wcat stages remove deal Negotiation`

### `wcat stages list`

every stage outside the base sets in scope, a CRM's or an own pipeline's, with the base stage it maps to, and whether the owner confirmed that or it is the store's suggestion

```sh
wcat stages list [query] [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | optional | field:value terms that narrow the list — the fields are below. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Returns:** stage mapping — ref, name, position, outcome, external_id, kind, pipeline, pipeline_name, and 5 more; every field: wcat commands info stages list

**Example:** `wcat stages list confirmed:false`, `wcat stages list kind:deal pipeline:pipeline:3 --json`

### `wcat stages set`

map one stage of a CRM or own pipeline onto a base stage of its kind, confirmed, so a later sync keeps it; an agent's run records it as a suggestion the owner confirms

This command changes the local store or your files.

```sh
wcat stages set <stage> <base-stage> [options]
```

| Argument | | What it is |
|---|---|---|
| `stage` | required | the stage, by its stage:<id> as stages list shows it. |
| `base-stage` | required | the base stage, by its stage:<id> or its name. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Returns:** stage mapping — ref, name, position, outcome, external_id, kind, pipeline, pipeline_name, and 5 more; every field: wcat commands info stages set

**Example:** `wcat stages set stage:41 Proposal`

### `wcat stages confirm`

confirm every suggestion of one pipeline, or of all of them in scope, as it stands

This command changes the local store or your files.

```sh
wcat stages confirm [options]
```

| Option | What it does |
|---|---|
| `--pipeline <pipeline>` | pipeline:<id>, or a name only one pipeline has. |
| `--all` | every pipeline in scope. |
| `--kind <kind>` | with --all: only deal or only lead stages. One of: `deal`, `lead`. |
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Returns:** stage mapping confirm — confirmed; every field: wcat commands info stages confirm

**Example:** `wcat stages confirm --pipeline pipeline:3`, `wcat stages confirm --all`

### `wcat stages suggest`

send every unconfirmed stage that has more than one base stage of its outcome to go to, with the base stages, to the AI model chosen with `wcat models ai set`, and record its answers as suggestions the owner confirms with `wcat stages confirm --all`. --dry-run sends nothing and prints the same task as JSON for an agent; --text-file records the agent's answer instead of asking the model

This command changes the local store or your files.

```sh
wcat stages suggest [options]
```

| Option | What it does |
|---|---|
| `--kind <kind>` | only deal or only lead stages. One of: `deal`, `lead`. |
| `--dry-run` | print the task for an agent: the stages, the base stages to choose from, the answer's shape. |
| `--text-file <path>` | record an agent's answer, {"map": [{"stage": "stage:<id>", "base": "stage:<id>"}]}, from this file; - reads stdin. |
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Returns:** stage suggestion — by, suggested, left, skipped, task, answer, submit, base_stages, and 2 more; every field: wcat commands info stages suggest

**Example:** `wcat stages suggest`, `wcat stages suggest --kind deal --dry-run --json`, `wcat stages suggest --text-file answer.json`

## `wcat products`

goods and services you sell or buy, with their prices; a line that names one copies its price, so a later price change leaves the line as it was

### `wcat products list`

products and services, by name; archived:true lists those no longer sold

```sh
wcat products list [query] [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | optional | field:value terms that narrow the list — the fields are below. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=ref,title keeps only those fields. |
| `--limit <n>` | most products, up to 500. Default: `100`. |

**Example:** `wcat products list kind:service`, `wcat products list archived:true --json`

### `wcat products show`

one product or service with its price, unit, supplier and stock code

```sh
wcat products show <product> [options]
```

| Argument | | What it is |
|---|---|---|
| `product` | required | product:<id>. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Example:** `wcat products show product:4`

### `wcat products add`

add a product or service you sell or buy; anyone adds one directly, as a price feeds no total

This command changes the local store or your files.

```sh
wcat products add <name> [amount] [currency] [options]
```

| Argument | | What it is |
|---|---|---|
| `name` | required | its name, as an invoice or order line prints it. |
| `amount` | optional | the price of one unit, a decimal such as 10000.00. |
| `currency` | optional | ISO 4217, such as RUB; given with the amount. |

| Option | What it does |
|---|---|
| `--kind <kind>` | product or service; product when left out. |
| `--unit <text>` | what one of it is counted in, such as hour or month. |
| `--sku <code>` | the stock code the seller gives it. |
| `--supplier <party>` | who supplies it, when not you: person:<uid> or organization:<id>. |
| `--description <text>` | what it is, in a sentence. |
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Example:** `wcat products add 'Bike rental, month' 10000.00 RUB --kind service --unit month`, `wcat products add 'Helmet' 2500.00 RUB --sku H-12 --supplier organization:3`

### `wcat products update`

change a product's price, name, unit or description, or archive it; lines already written keep theirs

This command changes the local store or your files.

```sh
wcat products update <product> [options]
```

| Argument | | What it is |
|---|---|---|
| `product` | required | product:<id>. |

| Option | What it does |
|---|---|
| `--amount <decimal>` | the new price of one unit, such as 12000.00; give --currency with it. |
| `--currency <code>` | an ISO 4217 code, such as RUB. |
| `--title <title>` | its new name. |
| `--unit <text>` | what one of it is counted in, such as hour or month. |
| `--description <text>` | what it is, in a sentence. |
| `--archived <on\|off>` | on: no longer sold, and lines and subscriptions keep pointing at it; off: sold again. |
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Example:** `wcat products update product:4 --amount 12000.00 --currency RUB`, `wcat products update product:4 --archived on`

## `wcat contracts`

contracts you work under: their kind, dates, renewal, notice and what they are worth

### `wcat contracts list`

contracts, newest first; expires:2026-12-31 lists those that end by then

```sh
wcat contracts list [query] [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | optional | field:value terms that narrow the list — the fields are below. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=ref,title keeps only those fields. |
| `--limit <n>` | most contracts, up to 500. Default: `100`. |

**Example:** `wcat contracts list status:active`, `wcat contracts list expires:2026-12-31 --json`

### `wcat contracts show`

one contract with its dates, renewal and the last day to give notice

```sh
wcat contracts show <contract> [options]
```

| Argument | | What it is |
|---|---|---|
| `contract` | required | contract:<id>. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Example:** `wcat contracts show contract:2`

### `wcat contracts add`

record a contract; one with no amount is written as it is, by anyone; with an amount yours is confirmed at once and an agent's waits as proposed for you in wcat review

This command changes the local store or your files.

```sh
wcat contracts add <name> [options]
```

| Argument | | What it is |
|---|---|---|
| `name` | required | what it is called, such as 'Rental agreement'. |

| Option | What it does |
|---|---|
| `--kind <kind>` | what it is: sale, purchase, service, lease, employment, nda, license, other. |
| `--status <state>` | draft, active, ended, terminated; active when left out. |
| `--start-date <date>` | the first day it is in force, YYYY-MM-DD. |
| `--end-date <date>` | the last day it is in force, YYYY-MM-DD; left out, it runs until ended. |
| `--auto-renew <on\|off>` | it renews by itself at its end, or it does not. |
| `--notice-days <days>` | how many days before its end a party must say it will not go on. |
| `--amount <decimal>` | what it is worth, such as 120000.00, in --currency; with it, an agent's waits for you. |
| `--currency <code>` | an ISO 4217 code, such as RUB. |
| `--project <project>` | the project it belongs to: its key or project:<id>. |
| `--reason <text>` | why an agent proposes it, for the owner who decides. |
| `--evidence <ref...>` | what shows it, up to 8: msg:, note:, document: or another reference. |
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Example:** `wcat contracts add 'Rental agreement' --kind service --start-date 2026-11-01 --end-date 2027-10-31 --auto-renew on --notice-days 30 --amount 120000.00 --currency RUB`, `wcat contracts add 'NDA with the studio' --kind nda --project HRB`

### `wcat contracts update`

change a contract's dates, status, terms or worth; you change any, an agent only one it proposed that is still proposed, and a confirmed contract's worth only you

This command changes the local store or your files.

```sh
wcat contracts update <contract> [options]
```

| Argument | | What it is |
|---|---|---|
| `contract` | required | contract:<id>. |

| Option | What it does |
|---|---|
| `--kind <kind>` | what it is: sale, purchase, service, lease, employment, nda, license, other. |
| `--status <state>` | draft, active, ended, terminated; active when left out. |
| `--start-date <date>` | the first day it is in force, YYYY-MM-DD. |
| `--end-date <date>` | the last day it is in force, YYYY-MM-DD; left out, it runs until ended. |
| `--auto-renew <on\|off>` | it renews by itself at its end, or it does not. |
| `--notice-days <days>` | how many days before its end a party must say it will not go on. |
| `--amount <decimal>` | what it is worth, such as 120000.00, in --currency; with it, an agent's waits for you. |
| `--currency <code>` | an ISO 4217 code, such as RUB. |
| `--title <title>` | its new name. |
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Example:** `wcat contracts update contract:2 --status terminated`, `wcat contracts update contract:2 --end-date 2027-12-31`

## `wcat subscriptions`

subscriptions you bill or pay: who supplies it, who pays, how often, and every price it had; a price is never changed, a new one is added

### `wcat subscriptions list`

subscriptions, newest first; renews:2026-12-01 lists those that renew by then

```sh
wcat subscriptions list [query] [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | optional | field:value terms that narrow the list — the fields are below. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=ref,title keeps only those fields. |
| `--limit <n>` | most subscriptions, up to 500. Default: `100`. |

**Example:** `wcat subscriptions list status:active direction:payable`, `wcat subscriptions list renews:2026-12-01 --json`

### `wcat subscriptions show`

one subscription with its parties, dates, current price and every price it had

```sh
wcat subscriptions show <subscription> [options]
```

| Argument | | What it is |
|---|---|---|
| `subscription` | required | subscription:<id>. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Example:** `wcat subscriptions show subscription:5`

### `wcat subscriptions add`

record a subscription and its first price; yours is confirmed at once; an agent's waits as proposed for you in wcat review

This command changes the local store or your files.

```sh
wcat subscriptions add <name> <amount> <currency> [options]
```

| Argument | | What it is |
|---|---|---|
| `name` | required | what it is, such as Hosting. |
| `amount` | required | its price for one period, a decimal such as 990.00. |
| `currency` | required | ISO 4217, such as RUB. |

| Option | What it does |
|---|---|
| `--status <state>` | trial, active, paused, cancelled, ended; trial needs --trial-end-date. |
| `--supplier <party>` | who supplies it: person:<uid> or organization:<id>; you, when you bill it. |
| `--customer <party>` | who receives it and pays for it: person:<uid> or organization:<id>; you, when you pay. |
| `--product <product>` | the product or service it is for: product:<id>. |
| `--contract <contract>` | the contract it runs under: contract:<id>. |
| `--period <count-unit>` | how often it is charged: a count and a unit, such as 1-month or 1-year. |
| `--start-date <date>` | the first day it runs, YYYY-MM-DD. |
| `--trial-end-date <date>` | the day its free trial ends, YYYY-MM-DD. |
| `--kind <kind>` | receivable (you bill it) or payable (you pay it). |
| `--project <project>` | the project it belongs to: its key or project:<id>. |
| `--reason <text>` | why an agent proposes it, for the owner who decides. |
| `--evidence <ref...>` | what shows it, up to 8: msg:, note:, document: or another reference. |
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Example:** `wcat subscriptions add Hosting 990.00 RUB --kind payable --supplier organization:3 --period 1-month --start-date 2026-11-01`, `wcat subscriptions add 'Bike rental' 10000.00 RUB --kind receivable --customer organization:3 --period 1-month --trial-end-date 2026-11-14 --status trial`

### `wcat subscriptions update`

change a subscription's status, schedule, dates or parties; pause it with --status paused. You change any, an agent only one it proposed that is still proposed. A new price is subscriptions prices add

This command changes the local store or your files.

```sh
wcat subscriptions update <subscription> [options]
```

| Argument | | What it is |
|---|---|---|
| `subscription` | required | subscription:<id>. |

| Option | What it does |
|---|---|
| `--status <state>` | trial, active, paused, cancelled, ended; trial needs --trial-end-date. |
| `--supplier <party>` | who supplies it: person:<uid> or organization:<id>; you, when you bill it. |
| `--customer <party>` | who receives it and pays for it: person:<uid> or organization:<id>; you, when you pay. |
| `--product <product>` | the product or service it is for: product:<id>. |
| `--contract <contract>` | the contract it runs under: contract:<id>. |
| `--period <count-unit>` | how often it is charged: a count and a unit, such as 1-month or 1-year. |
| `--start-date <date>` | the first day it runs, YYYY-MM-DD. |
| `--trial-end-date <date>` | the day its free trial ends, YYYY-MM-DD. |
| `--title <title>` | its new name. |
| `--end-date <date>` | the last day it runs, YYYY-MM-DD. |
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Example:** `wcat subscriptions update subscription:5 --status paused`, `wcat subscriptions update subscription:5 --period 1-year`

### `wcat subscriptions cancel`

mark a subscription cancelled on a day; it stays, with its prices

This command changes the local store or your files.

```sh
wcat subscriptions cancel <subscription> [options]
```

| Argument | | What it is |
|---|---|---|
| `subscription` | required | subscription:<id>. |

| Option | What it does |
|---|---|
| `--occurred-time <time>` | the day it was cancelled, such as 2026-11-01; today when left out. |
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Example:** `wcat subscriptions cancel subscription:5 --occurred-time 2026-11-30`

### `wcat subscriptions prices`

the prices a subscription had, each from a day on; one is never changed, a new one is added

#### `wcat subscriptions prices add`

add a price from a day on; the earlier ones stay as they were. yours is confirmed at once; an agent's waits as proposed for you in wcat review, and the subscription stays as it is

This command changes the local store or your files.

```sh
wcat subscriptions prices add <subscription> <amount> <currency> [options]
```

| Argument | | What it is |
|---|---|---|
| `subscription` | required | subscription:<id>. |
| `amount` | required | the price for one period, a decimal such as 1190.00. |
| `currency` | required | ISO 4217, such as RUB. |

| Option | What it does |
|---|---|
| `--start-date <date>` | the first day the price holds, YYYY-MM-DD; the subscription's start when left out. |
| `--reason <text>` | why an agent proposes it, for the owner who decides. |
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Example:** `wcat subscriptions prices add subscription:5 1190.00 RUB --start-date 2027-01-01`

## `wcat wallets`

bank accounts, cards and cash you keep money in, one currency each; a balance is the opening balance plus confirmed, booked transactions, computed each time

### `wcat wallets list`

wallets with their balances today; kind:card lists the cards

```sh
wcat wallets list [query] [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | optional | field:value terms that narrow the list — the fields are below. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=ref,title keeps only those fields. |
| `--limit <n>` | most wallets, up to 500. Default: `100`. |

**Example:** `wcat wallets list`, `wcat wallets list kind:card --json`

### `wcat wallets show`

one wallet with its balance, and beside it what is pending or proposed and not counted yet; for an imported wallet whose opening balance you have not set, source_says gives the one its source sent

```sh
wcat wallets show <wallet> [options]
```

| Argument | | What it is |
|---|---|---|
| `wallet` | required | wallet:<id>. |

| Option | What it does |
|---|---|
| `--until-time <time>` | the balance up to and including this day, such as 2026-10-31; today when left out. |
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Example:** `wcat wallets show wallet:2`, `wcat wallets show wallet:2 --until-time 2026-10-31`

### `wcat wallets add`

add a wallet in one currency; anyone adds one directly, and only you set its opening balance, with wallets update

This command changes the local store or your files.

```sh
wcat wallets add <name> <currency> [options]
```

| Argument | | What it is |
|---|---|---|
| `name` | required | what you call it, such as 'Main card'. |
| `currency` | required | ISO 4217, such as RUB; a bank account in two currencies is two wallets. |

| Option | What it does |
|---|---|
| `--kind <kind>` | bank, card, cash, wallet, other; bank when left out. |
| `--institution <text>` | the bank or other company that holds it, by name. |
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Example:** `wcat wallets add 'Main card' RUB --kind card --institution 'Bank One'`

### `wcat wallets update`

rename a wallet, or set the opening balance its balance counts from; the opening balance is yours alone, an agent is refused

This command changes the local store or your files.

```sh
wcat wallets update <wallet> [options]
```

| Argument | | What it is |
|---|---|---|
| `wallet` | required | wallet:<id>. |

| Option | What it does |
|---|---|
| `--title <title>` | its new name. |
| `--institution <text>` | the bank or other company that holds it, by name. |
| `--opening-balance <decimal>` | what it held on --opening-date, such as 1500.50; only you set it. |
| `--opening-date <date>` | the day of the opening balance, YYYY-MM-DD. |
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Example:** `wcat wallets update wallet:2 --opening-balance 15000.00 --opening-date 2026-01-01`

## `wcat transactions`

money a wallet's statement shows moving in or out, the payment it settles, and the categories it is split into

### `wcat transactions list`

transactions, newest first; uncategorized:true lists those not fully split into categories

```sh
wcat transactions list [query] [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | optional | field:value terms that narrow the list — the fields are below. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=ref,title keeps only those fields. |
| `--limit <n>` | most transactions, up to 500. Default: `100`. |

**Example:** `wcat transactions list 'wallet:"wallet:2"' status:pending`, `wcat transactions list uncategorized:true --json`

### `wcat transactions show`

one transaction with its wallet, payment, splits and what is not categorized

```sh
wcat transactions show <transaction> [options]
```

| Argument | | What it is |
|---|---|---|
| `transaction` | required | transaction:<id>. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Example:** `wcat transactions show transaction:12`

### `wcat transactions add`

record what a wallet's statement shows moved, in the wallet's currency; yours is confirmed at once; an agent's waits as proposed for you in wcat review

This command changes the local store or your files.

```sh
wcat transactions add <wallet> <amount> [options]
```

| Argument | | What it is |
|---|---|---|
| `wallet` | required | wallet:<id>. |
| `amount` | required | a decimal above 0, such as 500.00. |

| Option | What it does |
|---|---|
| `--kind <kind>` | in (money came in) or out (money went out). |
| `--occurred-time <time>` | the day the statement shows, such as 2026-11-01; today when left out. |
| `--description <text>` | what the statement says, as it says it. |
| `--status <state>` | pending or booked; only a booked one counts in a balance; booked when left out. |
| `--payment <payment>` | the payment it settles, same amount, currency and direction: payment:<id>. |
| `--project <project>` | the project it belongs to: its key or project:<id>. |
| `--reason <text>` | why an agent proposes it, for the owner who decides. |
| `--evidence <ref...>` | what shows it, up to 8: msg:, note:, document: or another reference. |
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Example:** `wcat transactions add wallet:2 500.00 --kind out --occurred-time 2026-11-14 --description 'Coffee shop'`, `wcat transactions add wallet:2 10000.00 --kind in --payment payment:9`

### `wcat transactions update`

book a pending transaction, link it to the payment it settles, or fix its text; you change any, an agent only one it proposed that is still proposed

This command changes the local store or your files.

```sh
wcat transactions update <transaction> [options]
```

| Argument | | What it is |
|---|---|---|
| `transaction` | required | transaction:<id>. |

| Option | What it does |
|---|---|
| `--status <state>` | pending or booked; only a booked one counts in a balance. |
| `--payment <payment>` | the payment it settles, same amount, currency and direction: payment:<id>. |
| `--description <text>` | what the statement says, as it says it. |
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Example:** `wcat transactions update transaction:12 --status booked`, `wcat transactions update transaction:12 --payment payment:9`

### `wcat transactions splits`

the categories a transaction's amount is split into; together never more than the amount, the rest is uncategorized

#### `wcat transactions splits add`

put part of a transaction's amount under a category; you split any transaction; an agent only one it proposed that is still proposed

This command changes the local store or your files.

```sh
wcat transactions splits add <transaction> <amount> <category> [options]
```

| Argument | | What it is |
|---|---|---|
| `transaction` | required | transaction:<id>. |
| `amount` | required | a decimal above 0, such as 120.00. |
| `category` | required | the category, in a word or a few, such as Rent. |

| Option | What it does |
|---|---|
| `--project <project>` | the project this part belongs to: its key or project:<id>. |
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Example:** `wcat transactions splits add transaction:12 300.00 Rent --project HRB`

#### `wcat transactions splits remove`

take a split off a transaction; its amount is uncategorized again. you split any transaction; an agent only one it proposed that is still proposed

This command changes the local store or your files.

```sh
wcat transactions splits remove <transaction> <position> [options]
```

| Argument | | What it is |
|---|---|---|
| `transaction` | required | transaction:<id>. |
| `position` | required | the split's position, from 1, as transactions show lists it. |

| Option | What it does |
|---|---|
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Example:** `wcat transactions splits remove transaction:12 1`

## `wcat records`

what a source said, kept per account; what it says about money waits for your review

### `wcat records import`

bring a source's records into the store, once: the same file twice changes nothing, a lower revision is refused, and anything that feeds money totals becomes a proposal for you, never confirmed money. Each refusal is also printed on stderr as it happens, one line each, past the receipt's 1000

This command changes the local store or your files.

```sh
wcat records import <file> [options]
```

| Argument | | What it is |
|---|---|---|
| `file` | required | a records envelope as JSON, JSONL (a header line, then a record per line, read as it streams), a CSV sheet of one --type, or a vCard address book (.vcf, into phone:<device>); - for stdin. |

| Option | What it does |
|---|---|
| `--dry-run` | check and plan the import; write nothing. a dry run holds the store's write lock and grows the write-ahead log for its length. |
| `--type <type>` | the one type a CSV sheet holds: invoice, payment, person, organization, project, order, product, contract, subscription, wallet, transaction, deal, lead, document, pipeline. |
| `--account <account>` | the source the envelope is for: <provider>:<account> (sheet:rentals) or its source.account alone; phone:<device> for a vCard file. |
| `--region <country>` | a vCard file's country for phone numbers without +, such as ru or gb; without it they are kept, not matched. |
| `--json` | print JSON; --json=created,errors keeps only those fields. |

**Example:** `wcat records import payments.jsonl --account rentals --dry-run`, `wcat records import envelope.json --account rentals --json`, `wcat records import contacts.vcf --account phone:pixel --region gb`

### `wcat records check`

what records import would do with the file, as its receipt, writing nothing; a dry run holds the store's write lock and grows the write-ahead log for its length

This command changes the local store or your files.

```sh
wcat records check <file> [options]
```

| Argument | | What it is |
|---|---|---|
| `file` | required | a records envelope as JSON, JSONL (a header line, then a record per line, read as it streams), a CSV sheet of one --type, or a vCard address book (.vcf, into phone:<device>); - for stdin. |

| Option | What it does |
|---|---|
| `--type <type>` | the one type a CSV sheet holds: invoice, payment, person, organization, project, order, product, contract, subscription, wallet, transaction, deal, lead, document, pipeline. |
| `--account <account>` | the source the envelope is for: <provider>:<account> (sheet:rentals) or its source.account alone; phone:<device> for a vCard file. |
| `--region <country>` | a vCard file's country for phone numbers without +, such as ru or gb; without it they are kept, not matched. |
| `--json` | print JSON; --json=created,errors keeps only those fields. |

**Example:** `wcat records check - --account rentals`, `wcat records check invoices.csv --type invoice --account sheet:rentals`

### `wcat records templates`

files to fill for records import: a CSV header row or a JSON envelope, one type each

#### `wcat records templates list`

the types a sheet can hold, and their columns: whether each is required, its shape and its values

```sh
wcat records templates list [query] [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | optional | field:value terms that narrow the list — the fields are below. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=types keeps only those fields. |

**Example:** `wcat records templates list --json`, `wcat records templates list type:invoice`

#### `wcat records templates show`

the file to fill for one type: the CSV header row (with a byte-order mark, so Excel reads it as UTF-8) or a JSON envelope of one example record

```sh
wcat records templates show <type> [options]
```

| Argument | | What it is |
|---|---|---|
| `type` | required | one of invoice, payment, person, organization, project, order, product, contract, subscription, wallet, transaction, deal, lead, document, pipeline. |

| Option | What it does |
|---|---|
| `--format <format>` | csv or json. Default: `csv`. |
| `--locale <code>` | the language of the Excel that opens it: en takes , and ru or es take ;. Default: `en`. |
| `--account <account>` | the source a JSON template names: <provider>:<account>, such as sheet:rentals. |
| `--json` | print JSON; --json=text keeps only those fields. |

**Example:** `wcat records templates show invoice --locale ru`, `wcat records templates show invoice --format json --account sheet:rentals`

### `wcat records list`

a source's records, newest first; waiting:true lists those that wait for a record they name, unmatched:true the people, organizations and projects whose identifiers fit more than one of yours, entity: those mapped to one of your entries

```sh
wcat records list [query] [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | optional | field:value terms that narrow the list — the fields are below. |

| Option | What it does |
|---|---|
| `--account <account>` | the source, <provider>:<account> as the envelope's source names it, such as sheet:rentals. |
| `--limit <n>` | most records, up to 500. Default: `100`. |
| `--json` | print JSON; --json=type,external_id,entity keeps only those fields. |

**Example:** `wcat records list waiting:true --account sheet:rentals`, `wcat records list type:organization --account sheet:rentals --json`, `wcat records list 'entity:"organization:3"' deleted:false --account sheet:rentals`

### `wcat records link`

say which of your entries a source's record is (organization:client is organization:3); never done by name. Records that waited for it become proposals in wcat review. Only you link; an agent is refused

This command changes the local store or your files.

```sh
wcat records link <record> <ref> [options]
```

| Argument | | What it is |
|---|---|---|
| `record` | required | <type>:<external_id> as the source names it, such as organization:client or custom:quote:Q-7. |
| `ref` | required | your entry of the same type: person:<id>, organization:<id> or project:<id>. |

| Option | What it does |
|---|---|
| `--account <account>` | the source, <provider>:<account> as the envelope's source names it, such as sheet:rentals. |
| `--json` | print JSON; --json=type,external_id,entity keeps only those fields. |
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |

**Example:** `wcat records link organization:client organization:3 --account sheet:rentals`

### `wcat records show`

one record as its source said it: its fields, the records it names, the records that name it (incoming, the first 100) and the entry made from it

```sh
wcat records show <record> [options]
```

| Argument | | What it is |
|---|---|---|
| `record` | required | <type>:<external_id> as the source names it, such as organization:client or custom:quote:Q-7. |

| Option | What it does |
|---|---|
| `--account <account>` | the source, <provider>:<account> as the envelope's source names it, such as sheet:rentals. |
| `--json` | print JSON; --json=fields,relations,incoming,entity keeps only those fields. |

**Example:** `wcat records show custom:quote:Q-7 --account example-erp:demo`, `wcat records show organization:client --account sheet:rentals --json`

### `wcat records delete`

say a source no longer has a record, as an import's delete does: the record is kept as deleted, and the entry made from it stays, flagged for you to reject or keep

This command changes the local store or your files.

```sh
wcat records delete <record> [options]
```

| Argument | | What it is |
|---|---|---|
| `record` | required | <type>:<external_id> as the source names it, such as organization:client or custom:quote:Q-7. |

| Option | What it does |
|---|---|
| `--account <account>` | the source, <provider>:<account> as the envelope's source names it, such as sheet:rentals. |
| `--json` | print JSON; --json=deleted,flagged,errors keeps only those fields. |

**Example:** `wcat records delete payment:sheet-12 --account sheet:rentals`

### `wcat records clear`

delete everything one source said: its records, the leads, deals and pipelines made from them, and the people only it made. Anyone you tagged or gave a task to, or another source knows, stays; people delete removes them. For a test or a wrong import; a WireCat tool's account, such as tg or a CRM, is removed by that tool. Without --yes nothing changes

This command changes the local store or your files.

```sh
wcat records clear [options]
```

| Option | What it does |
|---|---|
| `--account <account>` | the source, <provider>:<account> as the envelope's source names it, such as sheet:rentals. |
| `--yes` | confirm: nothing of the source can be brought back but by importing it again. |
| `--json` | print JSON; --json=account,records keeps only those fields. |

**Example:** `wcat records clear --account n8n:test`, `wcat records clear --account n8n:test --yes`

### `wcat records match`

link every waiting person, organization and project of a source to the one entry its e-mail, phone or other identifier names, or make one, as an import does; never by name. Two or more fits wait for records link

This command changes the local store or your files.

```sh
wcat records match [options]
```

| Option | What it does |
|---|---|
| `--account <account>` | the source, <provider>:<account> as the envelope's source names it, such as sheet:rentals. |
| `--json` | print JSON; --json=linked,created,unmatched keeps only those fields. |

**Example:** `wcat records match --account sheet:rentals`

## `wcat meetings`

stored meeting evidence and reviewed findings

### `wcat meetings actions`

cited meeting facts and project tasks waiting for owner review

#### `wcat meetings actions add`

stage cited findings; facts and tasks wait for owner confirmation

This command changes the local store or your files.

```sh
wcat meetings actions add <file> [options]
```

| Argument | | What it is |
|---|---|---|
| `file` | required | the findings JSON itself (starts with {), a JSON file, or - for stdin; at most 65536 UTF-8 bytes. |

| Option | What it does |
|---|---|
| `--account <account>` | the meeting account it acts as: provider:account, such as zoom:me@example.com. |
| `--json` | print JSON; --json=id,status keeps only those fields. |

**Returns:** meeting findings — id, account, input, fingerprint, status, author, decided_by, decided_at, and 2 more; every field: wcat commands info meetings actions add

**Example:** `wcat meetings actions add findings.json --account zoom:me@example.com`

#### `wcat meetings actions show`

one findings preview, prior decisions and its review receipt

```sh
wcat meetings actions show <id> [options]
```

| Argument | | What it is |
|---|---|---|
| `id` | required | stored findings batch ID. |

| Option | What it does |
|---|---|
| `--source <accounts>` | the meeting account: provider:account (zoom:me@example.com), or a provider that has one. |
| `--json` | print JSON; --json=id,status keeps only those fields. |

**Returns:** meeting findings — id, account, input, fingerprint, status, author, decided_by, decided_at, and 2 more; every field: wcat commands info meetings actions show

**Example:** `wcat meetings actions show 5 --source zoom:me@example.com`

#### `wcat meetings actions list`

findings batches in one meeting account, newest first

```sh
wcat meetings actions list [query] [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | optional | field:value terms that narrow the list — the fields are below. |

| Option | What it does |
|---|---|
| `--source <accounts>` | the meeting account: provider:account (zoom:me@example.com), or a provider that has one. |
| `--json` | print JSON; --json=id,status keeps only those fields. |
| `--limit <n>` | batches per page, at most 50. Default: `20`. |
| `--page <n>` | which page, from 1. Default: `1`. |

**Returns:** meeting findings — id, account, input, fingerprint, status, author, decided_by, decided_at, and 2 more; every field: wcat commands info meetings actions list

**Example:** `wcat meetings actions list status:proposed --source zoom:me@example.com`

#### `wcat meetings actions confirm`

owner only: create selected findings and reject the other new candidates

This command changes the local store or your files.

```sh
wcat meetings actions confirm <id> <ids> [options]
```

| Argument | | What it is |
|---|---|---|
| `id` | required | stored findings batch ID. |
| `ids` | required | candidate IDs to accept; other new candidates are rejected. |

| Option | What it does |
|---|---|
| `--account <account>` | the meeting account it acts as: provider:account, such as zoom:me@example.com. |
| `--json` | print JSON; --json=id,status keeps only those fields. |
| `--fingerprint <hash>` | the exact fingerprint shown in the preview. |
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |

**Returns:** meeting findings — id, account, input, fingerprint, status, author, decided_by, decided_at, and 2 more; every field: wcat commands info meetings actions confirm

**Example:** `wcat meetings actions confirm 5 decision --fingerprint aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa --account zoom:me@example.com`

#### `wcat meetings actions reject`

owner only: reject every new candidate in this batch

This command changes the local store or your files.

```sh
wcat meetings actions reject <id> [options]
```

| Argument | | What it is |
|---|---|---|
| `id` | required | stored findings batch ID. |

| Option | What it does |
|---|---|
| `--account <account>` | the meeting account it acts as: provider:account, such as zoom:me@example.com. |
| `--json` | print JSON; --json=id,status keeps only those fields. |
| `--fingerprint <hash>` | the exact fingerprint shown in the preview. |
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |

**Returns:** meeting findings — id, account, input, fingerprint, status, author, decided_by, decided_at, and 2 more; every field: wcat commands info meetings actions reject

**Example:** `wcat meetings actions reject 5 --fingerprint aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa --account zoom:me@example.com`

### `wcat meetings list`

meetings, calls and calendar events of every account as one row per real meeting, latest start first

```sh
wcat meetings list [query] [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | optional | field:value terms that narrow the list — the fields are below. |

| Option | What it does |
|---|---|
| `--limit <n>` | rows per page, 1–1000; a month for a calendar fits in 1000. Default: `50`. |
| `--page <n>` | which page, from 1. Default: `1`. |
| `--order <recent\|start>` | recent: latest start first; start: oldest first, for a calendar window. Default: `recent`. |
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Example:** `wcat meetings list kind:call has_transcript:true`, `wcat meetings list 'started_at:[2026-11-01T00:00:00+01:00 TO 2026-12-01T00:00:00+01:00}' --order start --json`

### `wcat meetings show`

one meeting row: its people, transcript lines with times, summaries, findings, calendar text and documents

```sh
wcat meetings show <meeting> [options]
```

| Argument | | What it is |
|---|---|---|
| `meeting` | required | event:<id> or meeting:<account>/<id>, from meetings list. |

| Option | What it does |
|---|---|
| `--cursor <cursor>` | the transcript line to start at: where the last read ended. Default: `0`. |
| `--limit <n>` | transcript lines at most, 1–2000. Default: `200`. |
| `--json` | print JSON; --json=ref,transcript keeps only those fields. |

**Example:** `wcat meetings show event:42 --limit 500 --json`, `wcat meetings show meeting:3/7`

### `wcat meetings passage`

read a cited cue with bounded context before and after it

```sh
wcat meetings passage <reference> [options]
```

| Argument | | What it is |
|---|---|---|
| `reference` | required | retained transcript cue reference from a search hit. |

| Option | What it does |
|---|---|
| `--before-n <n>` | preceding cues (default 3). |
| `--after-n <n>` | following cues (default 3); at most 999 surrounding cues in total. |
| `--bytes <bytes>` | cue JSON byte budget (default 65536); the anchor must fit. |
| `--max-read-bytes <bytes>` | stored text byte budget (default 4194304); boundary probes read metadata only. |
| `--expected-fingerprint <hash>` | reject a changed anchor using its previously read cue fingerprint. |
| `--format <format>` | compact text, Markdown or structured JSON. One of: `text`, `markdown`, `json`. Default: `text`. |
| `--source <accounts>` | the meeting account: provider:account (zoom:me@example.com), or a provider that has one. |
| `--json` | print the standard JSON answer. |

**Returns:** meeting passage — schema_version, kind, source, target_ref, target_fingerprint, fingerprint, revision, limits, and 3 more; every field: wcat commands info meetings passage

**Example:** `wcat meetings passage meeting:1/1/1/0 --source zoom:me@example.com --before-n 1 --after-n 1 --json`

### `wcat meetings prepare`

prepare cited stored context for a series; does not verify its next meeting time

```sh
wcat meetings prepare <series-id> [options]
```

| Argument | | What it is |
|---|---|---|
| `series-id` | required | exact provider series ID. |

| Option | What it does |
|---|---|
| `--context-source <id=cursor>` | one stored app.profile or email.mailbox, optionally =cursor; repeat (tg.personal). Default: ``. |
| `--context-query <words>` | literal words to find within the selected communications. |
| `--context-since-time <time>` | communications window start, an ISO date or time or 7d ago (default fourteen days before end). |
| `--context-before-time <time>` | exclusive communications end, an ISO date or time (default preparation start). |
| `--project <project>` | include unconfirmed word evidence for one existing project name, key or alias. |
| `--since-time <time>` | window start, an ISO date or time, local without a zone (default now). |
| `--before-time <time>` | exclusive window end, an ISO date or time; a date alone covers that day (default seven days after start). |
| `--history-since-time <time>` | history start, an ISO date or time or 30d ago (default thirty days before start). |
| `--meetings <n>` | prior occurrences and separate related-meeting limit, 1–20 (default 5). |
| `--cues <n>` | cues per occurrence, 1–100 (default 10). |
| `--context-limit <n>` | entries per context category, 1–100 (default 20). |
| `--max-read-bytes <bytes>` | stored/normalized bytes per read, at most 4194304 (default 262144). |
| `--bytes <bytes>` | preparation item JSON bytes, 4096–4194304 (default 65536). |
| `--source <accounts>` | the meeting account: provider:account (zoom:me@example.com), or a provider that has one. |
| `--json` | print the standard JSON answer. |

**Returns:** meeting preparation — schema_version, kind, account_id, upcoming, series, history_window, meetings, related, and 6 more; every field: wcat commands info meetings prepare

**Example:** `wcat meetings prepare example-series --source zoom:me@example.com --json`, `wcat meetings prepare example-series --source zoom:me@example.com --context-source tg.personal --context-query Harbour --json`

## `wcat actions`

what an agent proposes to do; confirming one makes it your task, nothing is sent

### `wcat actions add`

propose an action, such as a reply or a ban, in the account that would act

This command changes the local store or your files.

```sh
wcat actions add <kind> [options]
```

| Argument | | What it is |
|---|---|---|
| `kind` | required | a lower-case word: reply, send, ban, mute, pin, invite, create_task, …. |

| Option | What it does |
|---|---|
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--reason <text>` | why it should be done. |
| `--account <account>` | the account that would act: provider:account, such as telegram:1. |
| `--target <ref>` | what it acts on: msg:, chat:, contact:, person:, task:, …. |
| `--payload <json>` | what to do, as JSON, such as the reply's text. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat actions add reply --reason 'Kai asked twice' --account telegram:1 --target 'msg:telegram/1/77/42' --payload '{"text":"Friday works"}'`

### `wcat actions list`

proposed actions, newest first

```sh
wcat actions list [query] [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | optional | field:value terms that narrow the list — the fields are below. |

| Option | What it does |
|---|---|
| `--limit <n>` | most actions on a page, up to 500. Default: `100`. |
| `--page <n>` | which page, from 1. Default: `1`. |
| `--brief` | without each findings batch's cited sources. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat actions list status:proposed`

### `wcat actions show`

one proposed action; a findings batch with its fingerprint and sources

```sh
wcat actions show <id> [options]
```

| Argument | | What it is |
|---|---|---|
| `id` | required | the action's id, as actions list gives it. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat actions show 5`

### `wcat actions confirm`

confirm it: it becomes a task in the account that would act, nothing is sent; for a findings batch, create the named findings and leave the others waiting, or create every waiting one when none is named

This command changes the local store or your files.

```sh
wcat actions confirm <id> [findings] [options]
```

| Argument | | What it is |
|---|---|---|
| `id` | required | the action's id, as actions list gives it. |
| `findings` | optional | a findings batch: the finding IDs to create; the others keep waiting. |

| Option | What it does |
|---|---|
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--fingerprint <hash>` | a findings batch: the fingerprint actions show gives. |
| `--reason <text>` | why, in a few words; required when an agent decides for you. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat actions confirm 5`

### `wcat actions edit`

change one finding still waiting in a findings batch: its text and the fields its kind allows (a fact's statement, type and subject; a task's title, type, reason, commitment, dueAt and assignee; a mail finding's reason and its kind's fields). Its evidence never changes, nor a meeting finding's project. Answers the batch with its new fingerprint

This command changes the local store or your files.

```sh
wcat actions edit <id> <finding> [options]
```

| Argument | | What it is |
|---|---|---|
| `id` | required | the findings batch's id, as actions list gives it. |
| `finding` | required | the finding's id in the batch. |

| Option | What it does |
|---|---|
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--fingerprint <hash>` | the fingerprint actions show gives. |
| `--set <field=value...>` | a field and its new value: JSON for a list, null empties it. Default: ``. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat actions edit 5 f2 --fingerprint 3f9a --set title="Send the signed contract" dueAt=null`

### `wcat actions reject`

reject it; nothing is done. For a findings batch, every finding still waiting

This command changes the local store or your files.

```sh
wcat actions reject <id> [options]
```

| Argument | | What it is |
|---|---|---|
| `id` | required | the action's id, as actions list gives it. |

| Option | What it does |
|---|---|
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--fingerprint <hash>` | a findings batch: the fingerprint actions show gives. |
| `--reason <text>` | why, in a few words; required when an agent decides for you. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat actions reject 5`

## `wcat review`

every proposal waiting for your decision, across projects: links, key documents, facts, invoices, payments and more

### `wcat review list`

what waits for the owner's decision, newest first, with titles, who proposed it, why and the evidence

```sh
wcat review list [query] [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | optional | field:value terms that narrow the list — the fields are below. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=id,title keeps only those fields. |
| `--limit <n>` | proposals per page, at most 50. Default: `20`. |
| `--page <n>` | which page, from 1. Default: `1`. |
| `--compact` | one line per proposal. |

**Returns:** memo proposal — id, kind, status, title, project, project_title, source, owner_only, and 11 more; every field: wcat commands info review list

**Example:** `wcat review list project:HRB`, `wcat review list kind:relationship,fact by:agent`, `wcat review list via:chat:max/1/-100`

### `wcat review show`

one proposal with its titles, signals and the text around each piece of evidence; a memory_source_review also shows each source as it was cited and as it is now, and the command for each decision

```sh
wcat review show <id> [options]
```

| Argument | | What it is |
|---|---|---|
| `id` | required | the proposal's id, as review lists it: 17070, fact:512, memory:88, link:17, payment:4, close:Q-15. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=id,title keeps only those fields. |
| `--brief` | only references and their titles, without excerpts or nearby text. |
| `--before-n <n>` | messages or document paragraphs before the evidence, at most 5. Default: `2`. |
| `--after-n <n>` | messages or document paragraphs after the evidence, at most 5. Default: `2`. |
| `--compact` | one line, as review prints it. |

**Example:** `wcat review show 17079`, `wcat review show 17080 --brief --json`

### `wcat review confirm`

confirm proposals by id or range (17070-17079,fact:500-502,17080/f1); each is decided on its own, so a refusal leaves the others decided. An agent decides only with --reason, never its own or a scan's

This command changes the local store or your files.

```sh
wcat review confirm <ids> [options]
```

| Argument | | What it is |
|---|---|---|
| `ids` | required | ids or ranges as review lists them; 17080/f1 accepts that finding and rejects the batch's others. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=id,title keeps only those fields. |
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--reason <text>` | why, in a few words; required when an agent decides. |
| `--compact` | one line per decision. |

**Example:** `wcat review confirm 17078-17081`, `wcat review confirm 17080/f1,17080/f3`, `wcat review confirm close:Q-15`

### `wcat review reject`

turn proposals down by id or range, with why; each is decided on its own

This command changes the local store or your files.

```sh
wcat review reject <ids> [options]
```

| Argument | | What it is |
|---|---|---|
| `ids` | required | ids or ranges as review lists them; a batch is turned down whole. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=id,title keeps only those fields. |
| `--as-owner` | act as you although an agent's terminal runs wcat (AI_AGENT or CLAUDECODE set); asks y/N at the terminal. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--reason <text>` | why it is turned down, in a few words. |
| `--compact` | one line per decision. |

**Example:** `wcat review reject 17081 --reason "not this project"`, `wcat review reject close:Q-15 --reason 'still open'`

### `wcat review agenda`

the morning digest, from the store alone with no model call: everything new in what you tagged watch (chats, mail threads, people, projects, a meeting's series), replies you owe to people in messengers and personal mail (not bots or service chats), new personal mail, meetings that ended, calendar events added, moved or cancelled and those starting within a day, Drive documents edited, CRM deals and leads the CRM changed (with a stage they moved to), tasks, projects that moved, memories and facts whose sources changed (source reviews raised since), proposals waiting. Tasks are the open ones created since the last morning-digest run (a day back when none ran) and those overdue, due today or due tomorrow, each with who asked and who does it. Replies owed reach back 7 days, and a dialog whose newest message the sync has not stored yet is listed there too, marked so; owed mail lists only senders you know (linked to a person with other identities, or written to before), and owed mail from new senders is listed under mail, marked so. Each item has its reference, who, when, one line of text and why it is there; a section cut by --limit or --max-output-bytes says how many it left out and the command that reads them. `scope` says what was read (the window, sources, counts), `tasks` counts each task group and, as `undated`, every open task with no due date, and `health` names each account whose sync failed, that nothing syncs, or that is quiet for longer than usual, or whose timer has not synced it for a day and a half (no reason, only how long), so an unsynced account does not read as a quiet day; an account stored or synced within a day is never named. A digest's scheduled run first runs again the syncs you put on a timer in tg, max, wa and mail that are more than an hour behind, as each schedule says, for up to 4 minutes

```sh
wcat review agenda [options]
```

| Option | What it does |
|---|---|
| `--since-time <time>` | how far back: hours or days (12h, 7d) or a start date (2026-11-01). Default: `1d`. |
| `--before-time <time>` | build it as of this past ISO time or date, for a past day's digest: --since-time counts back from it, and what came later is left out; a chat or thread answered since reads as answered. |
| `--source <accounts>` | only these, comma-separated or repeated: telegram, max, whatsapp, mail, meetings, tasks, drive, calendar, crm; watched items, projects and proposals stay. A digest's run reads the digest's own sources without it. |
| `--limit <n>` | items per section before the size budget. Default: `25`. |
| `--max-output-bytes <bytes>` | the text answer's size budget in bytes; 40000 with --compact, else 80000. |
| `--compact` | one line per item, shorter excerpts, the smaller budget: for an agent. |
| `--json` | print JSON. |

**Example:** `wcat review agenda --compact`, `wcat review agenda --since-time 3d --json`

### `wcat review status`

the owner's daily look, with no model call: per mail account the threads with new mail, what you owe and wait for, and how far each agent's processing mark has read; then what was proposed and what waits

```sh
wcat review status [options]
```

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=id,title keeps only those fields. |
| `--since-time <time>` | how far back: hours or days (12h, 7d) or a start date (2026-11-01). Default: `1d`. |

**Returns:** review status — since, at, mail, proposed, waiting, quiet; every field: wcat commands info review status

**Example:** `wcat review status`, `wcat review status --since-time 7d --json`

### `wcat review findings`

cited tasks, task updates, facts, memories, links, contacts, invoices, payments and orders an agent read in new mail

#### `wcat review findings add`

stage one mailbox's findings for the owner; nothing is created until the owner confirms

This command changes the local store or your files.

```sh
wcat review findings add <file> [options]
```

| Argument | | What it is |
|---|---|---|
| `file` | required | the findings JSON itself (starts with {), a JSON file, or - for stdin; at most 65536 UTF-8 bytes. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=id,status keeps only those fields. |
| `--source <accounts>` | the one mailbox: email:<address>, email or group:<name>; may be left out when the store holds one mailbox. |
| `--key <key>` | the findings key `review mail --holder` gave in its mail-findings.add step. |
| `--dry-run` | check the batch as staging would, invoices, payments and orders tried and rolled back, and stage nothing; answers valid and every finding's problem at once. |

**Returns:** mail findings — id, account, input, fingerprint, status, author, decided_by, decided_at, and 2 more; every field: wcat commands info review findings add

**Example:** `wcat review findings add findings.json --source email:work`, `wcat review findings add findings.json --source email:work --key mail-triage:9123 --dry-run --json`, `wcat review findings add '{"schema_version":1,"key":"mail-triage:9123","extractor":"mail-triage/1","findings":[…]}' --source email:me@example.com --json`

#### `wcat review findings show`

one findings batch: its findings with their evidence, earlier decisions and the review receipt

```sh
wcat review findings show <id> [options]
```

| Argument | | What it is |
|---|---|---|
| `id` | required | the batch id `review findings add` or `list` gave. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=id,status keeps only those fields. |

**Returns:** mail findings — id, account, input, fingerprint, status, author, decided_by, decided_at, and 2 more; every field: wcat commands info review findings show

**Example:** `wcat review findings show 41`, `wcat review findings show 41 --json`, `wcat review findings show 41 --json=id,input.findings`

#### `wcat review findings list`

review findings batches, newest first; status:proposed is what waits for the owner

```sh
wcat review findings list [query] [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | optional | field:value terms that narrow the list — the fields are below. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=id,status keeps only those fields. |
| `--source <accounts>` | only this mailbox's batches: email:<address>. |
| `--limit <n>` | batches per page, at most 50. Default: `20`. |
| `--page <n>` | which page, from 1. Default: `1`. |

**Returns:** mail findings — id, account, input, fingerprint, status, author, decided_by, decided_at, and 2 more; every field: wcat commands info review findings list

**Example:** `wcat review findings list status:proposed`, `wcat review findings list --source email:work --json`, `wcat review findings list status:reviewed --limit 50 --page 2`

### `wcat review mail`

every stored email, yours too, in threads that changed since a point — for reviewing who owes what. It reads what sync stored, so it asks the mail server nothing

```sh
wcat review mail [query] [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | optional | where the last review ended: date>2h; 3 days ago if no date. |

| Option | What it does |
|---|---|
| `--unanswered [duration]` | only threads whose newest email came to you, in To or Cc, with no answer for this long — 4h, 1d; 24h if not given. |
| `--waiting [duration]` | only threads where you wrote last and nobody answered for this long — 3d; 7d if not given. |
| `--holder <name>` | read for this holder — an agent or a pipeline — what is stored past its processing mark, by store order; newsletters, envelopes, drafts, suspicious senders and partial mail left out; other bulk mail after the rest, as its subject and first lines (excerpt_only); each text without quoted earlier mail or the signature; `messages acknowledge` moves the mark. |
| `--new` | what changed since the last `review --new` of this mailbox, a point per thread — for scheduled runs. |
| `--source <accounts>` | the one mailbox: email:<address>, email or group:<name>; may be left out when the store holds one mailbox. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Returns:** message summary — ref, chat_id, timestamp, sender_name, sender_is_me, outgoing, text, attachments, and 4 more; every field: wcat commands info review mail

**Next usually:** `wcat messages show <message>`

**Example:** `wcat review mail --holder mail-triage --source email:work --json`, `wcat review mail --unanswered 1d --source email:personal`, `wcat review mail 'date>2h' --source email:me@example.com`

### `wcat review subscriptions`

what is sent to you and you may leave: broadcast mail grouped by its list (List-Id), else by its sender. Not the subscriptions you bill or pay (subscriptions list)

#### `wcat review subscriptions list`

broadcast mail grouped by List-Id, else by its sender, newest first: each with its mail count, its newest email and where to unsubscribe (an https or mailto target its sender's DKIM signature vouches for, and whether one click does it). Nothing is unsubscribed. Open a row's mail with search mail list:<list_id> reach:broadcast, or from:<address> reach:broadcast for a row with no list

```sh
wcat review subscriptions list [query] [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | optional | field:value terms that narrow the list — the fields are below. |

| Option | What it does |
|---|---|
| `--source <accounts>` | the mailboxes to read (default: every one): email:<address>, email or group:<name>. |
| `--limit <n>` | most lists on a page, up to 500. Default: `100`. |
| `--page <n>` | which page, from 1. Default: `1`. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat review subscriptions list`, `wcat review subscriptions list type:promotion`, `wcat review subscriptions list --source email:work --page 2 --json`

## `wcat agents`

what agents did through the MCP servers that share the store

### `wcat agents list`

one row per tool call, newest first: agent, tool, tier, outcome and times, never its arguments

```sh
wcat agents list [query] [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | optional | field:value terms that narrow the list — the fields are below. |

| Option | What it does |
|---|---|
| `--limit <n>` | most rows on a page, up to 500. Default: `100`. |
| `--page <n>` | which page, from 1. Default: `1`. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat agents list agent:claude-code --limit 20`

## `wcat mcp`

serve wcat commands over MCP on stdio or authenticated HTTP, limited by saved permissions — `claude mcp add wcat -- wcat mcp serve`

### `wcat mcp serve`

serve wcat commands over MCP on stdio or authenticated HTTP, limited by saved permissions

This command changes the local store or your files.

```sh
wcat mcp serve [options]
```

| Option | What it does |
|---|---|
| `--permission <key=level>` | tighten one saved permission for this server; repeat for more keys. |
| `--http` | serve on 127.0.0.1 behind an HTTPS tunnel with an owner access-code login. |
| `--port <port>` | local HTTP port (default 8767); requires --http. |
| `--public-url <url>` | tunnel's HTTPS address without /mcp, or a path of it such as https://<name>.ts.net/memo; requires --http. |

**Example:** `wcat mcp serve`, `wcat mcp serve --http --public-url https://laptop.example.ts.net`

### `wcat mcp revoke`

forget every login `wcat mcp serve --http` gave a browser app; each app must log in again

This command changes the local store or your files.

```sh
wcat mcp revoke [options]
```

| Option | What it does |
|---|---|
| `--json` | print JSON. |

**Example:** `wcat mcp revoke --json`

### `wcat mcp server`

start, stop and check `mcp serve --http` in the background; status shows the login code for a browser app

#### `wcat mcp server start`

start `mcp serve --http` apart from this shell and answer once it listens, with its login code

This command changes the local store or your files.

```sh
wcat mcp server start [options]
```

| Option | What it does |
|---|---|
| `--port <port>` | the local port (default 8767). |
| `--public-url <url>` | the tunnel's https address the browser apps use, e.g. https://<name>.ts.net or https://<name>.ts.net/tg. |
| `--permission <key=level>` | make a permission stricter for this server only; repeat for more keys. |
| `--json` | print JSON. |

**Example:** `wcat mcp server start --public-url https://laptop.example.ts.net`

#### `wcat mcp server stop`

stop `mcp serve --http` — only one that `mcp server start` started

This command changes the local store or your files.

```sh
wcat mcp server stop [options]
```

| Option | What it does |
|---|---|
| `--json` | print JSON. |

**Example:** `wcat mcp server stop`

#### `wcat mcp server status`

whether `mcp serve --http` runs, on which port and address, the login code for a new browser app, and the apps logged in

```sh
wcat mcp server status [options]
```

| Option | What it does |
|---|---|
| `--json` | print JSON. |

**Example:** `wcat mcp server status --json`

## `wcat models`

models that run on this machine

### `wcat models list`

speech and embedding models, their download status and the default of each kind

```sh
wcat models list [query] [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | optional | field:value terms that narrow the list — the fields are below. |

| Option | What it does |
|---|---|
| `--json` | print JSON. |

**Returns:** model — id, kind, title, languages, size_bytes, downloaded, default, path, and 6 more; every field: wcat commands info models list

**Next usually:** `wcat models download <model>`, `wcat models set <model>`

**Example:** `wcat models list kind:text --json`

### `wcat models download`

download and verify one speech or embedding model

This command changes the local store or your files.

```sh
wcat models download <model> [options]
```

| Argument | | What it is |
|---|---|---|
| `model` | required | a model id from models list. |

| Option | What it does |
|---|---|
| `--offline` | refuse a download that needs the network. |
| `--accept-terms` | no longer needed; kept so older scripts still run. |
| `--json` | print JSON. |

**Returns:** model — id, kind, title, languages, size_bytes, downloaded, default, path, and 6 more; every field: wcat commands info models download

**Next usually:** `wcat models set <model>`

**Example:** `wcat models download embeddinggemma`, `wcat models download e5-small`

### `wcat models set`

make a downloaded text model the one every embed and every search by meaning uses, in every WireCat CLI. Each model keeps its own vectors: the next syncs embed what the new one lacks, and switching back is instant

This command changes the local store or your files.

```sh
wcat models set <model> [options]
```

| Argument | | What it is |
|---|---|---|
| `model` | required | a downloaded text model id from models list. |

| Option | What it does |
|---|---|
| `--json` | print JSON. |

**Returns:** model chosen — id, kind, title, languages, size_bytes, downloaded, default, path, and 9 more; every field: wcat commands info models set

**Next usually:** `wcat models download <model>`

**Example:** `wcat models set e5-large`

### `wcat models add`

add an ONNX embedding model from Hugging Face, pinned and checked by sha256

This command changes the local store or your files.

```sh
wcat models add <id> [options]
```

| Argument | | What it is |
|---|---|---|
| `id` | required | the id to give it: a-z, 0-9, . _ -. |

| Option | What it does |
|---|---|
| `--payload <json>` | where the model is and how to run it, as JSON (below). |
| `--offline` | refuse a call that needs the network. |
| `--json` | print JSON. |

**Returns:** model — id, kind, title, languages, size_bytes, downloaded, default, path, and 6 more; every field: wcat commands info models add

**Next usually:** `wcat models download <model>`, `wcat models set <model>`

**Example:** `wcat models add e5-base --payload '{"repository":"Xenova/multilingual-e5-base","onnx":"onnx/model_quantized.onnx","dims":768,"pooling":"mean","prefix":{"query":"query: ","passage":"passage: "}}'`

### `wcat models consents`

consent to send stored notes, documents and mail to a hosted model that rewrites them for search; off by default

#### `wcat models consents show`

whether enrichment is on, with which provider and model, how many records it covers and the cost

```sh
wcat models consents show [options]
```

| Option | What it does |
|---|---|
| `--json` | print JSON. |

**Example:** `wcat models consents show --json`

#### `wcat models consents set`

turn enrichment on for one provider and model; without --yes, say what would be sent and change nothing

This command changes the local store or your files.

```sh
wcat models consents set <provider> [options]
```

| Argument | | What it is |
|---|---|---|
| `provider` | required | the provider that receives the records: openai or anthropic. |

| Option | What it does |
|---|---|
| `--model <model>` | the provider's model name, such as gpt-4o-mini or claude-haiku-5-5. |
| `--base-url <url>` | the address of an OpenAI-compatible model API, or the Anthropic API root. |
| `--yes` | agree that the records go to this provider, and turn enrichment on. |
| `--json` | print JSON. |

**Example:** `wcat models consents set openai --model gpt-4o-mini`, `wcat models consents set openai --model gpt-4o-mini --yes`

#### `wcat models consents revoke`

turn enrichment off and delete what the model wrote; search reads only the records' own text again

This command changes the local store or your files.

```sh
wcat models consents revoke [options]
```

| Option | What it does |
|---|---|
| `--json` | print JSON. |

**Example:** `wcat models consents revoke`

### `wcat models search-consents`

consent that search all --harder sends the question and its first hits to a hosted model; off by default

#### `wcat models search-consents show`

whether search all --harder may call the model, which one, and whether its key is found

```sh
wcat models search-consents show [options]
```

| Option | What it does |
|---|---|
| `--json` | print JSON. |

**Example:** `wcat models search-consents show --json`

#### `wcat models search-consents set`

allow search all --harder to call the model; without --yes, say what it sends and change nothing

This command changes the local store or your files.

```sh
wcat models search-consents set <provider> [options]
```

| Argument | | What it is |
|---|---|---|
| `provider` | required | the provider that receives the question and hits: openai or anthropic. |

| Option | What it does |
|---|---|
| `--model <model>` | the provider's model; claude-haiku-5-5 or gpt-4o-mini if left out. |
| `--base-url <url>` | the address of an OpenAI-compatible model API (OpenRouter…); needs --model. |
| `--timeout <duration>` | how long a --harder search waits for the model, 1s to 10m (30s, 2m); 5 s for a hosted model, 60 s for one on this computer until one is set; kept until set again. |
| `--yes` | agree that a --harder search sends its question and hits, and allow it. |
| `--json` | print JSON. |

**Example:** `wcat models search-consents set anthropic`, `wcat models search-consents set anthropic --yes`

#### `wcat models search-consents revoke`

stop search all --harder from calling the model; it gives the plain order again

This command changes the local store or your files.

```sh
wcat models search-consents revoke [options]
```

| Option | What it does |
|---|---|
| `--json` | print JSON. |

**Example:** `wcat models search-consents revoke`

### `wcat models keys`

the API key write-time enrichment and search all --harder send with each request

#### `wcat models keys set`

store a key, typed at a hidden prompt or piped on stdin — never as an argument

This command changes the local store or your files.

```sh
wcat models keys set <provider> [options]
```

| Argument | | What it is |
|---|---|---|
| `provider` | required | openai, anthropic, or the host of a --base-url server that wants a key. |

| Option | What it does |
|---|---|
| `--json` | print JSON. |

**Returns:** model key stored — provider, stored; every field: wcat commands info models keys set

**Example:** `wcat models keys set openai`, `wcat models keys set anthropic`

#### `wcat models keys remove`

forget the stored key; a key in the environment stays

This command changes the local store or your files.

```sh
wcat models keys remove <provider> [options]
```

| Argument | | What it is |
|---|---|---|
| `provider` | required | openai, anthropic, or a server's host. |

| Option | What it does |
|---|---|
| `--json` | print JSON. |

**Returns:** model key removed — provider, removed; every field: wcat commands info models keys remove

**Example:** `wcat models keys remove openai`

### `wcat models ai`

the AI model WireCat may use instead of your agent: provider, model and its key

#### `wcat models ai show`

the chosen model, whether a key is stored for its address, and whether images may go to it

```sh
wcat models ai show [options]
```

| Option | What it does |
|---|---|
| `--json` | print JSON. |

**Example:** `wcat models ai show`

#### `wcat models ai set`

choose the model: anthropic, openai (or any service that works like it, with --base-url) or ollama (beta)

This command changes the local store or your files.

```sh
wcat models ai set <provider> [options]
```

| Argument | | What it is |
|---|---|---|
| `provider` | required | anthropic, openai, ollama. |

| Option | What it does |
|---|---|
| `--model <model>` | the model's name as the provider writes it. |
| `--base-url <url>` | the service's address; https, or http only on this computer. |
| `--secret-stdin` | read the API key from stdin, or ask for it; kept for this address only. |
| `--allow-remote` | let images you add to memory go to this model to be read; they leave this computer. Without it, a set takes back an earlier yes. |
| `--from-app` | you did this in WireCat Desktop. |
| `--json` | print JSON. |

**Example:** `wcat models ai set anthropic --model claude-haiku-4-5 --secret-stdin --allow-remote`, `wcat models ai set openai --model openai/gpt-4o-mini --base-url https://openrouter.ai/api/v1 --secret-stdin`, `wcat models ai set ollama --model llama3.2-vision`

#### `wcat models ai unset`

stop using a model; its key stays until models ai remove

This command changes the local store or your files.

```sh
wcat models ai unset [options]
```

| Option | What it does |
|---|---|
| `--from-app` | you did this in WireCat Desktop. |
| `--json` | print JSON. |

**Example:** `wcat models ai unset`

#### `wcat models ai remove`

remove the key stored for an address

This command changes the local store or your files.

```sh
wcat models ai remove [origin] [options]
```

| Argument | | What it is |
|---|---|---|
| `origin` | optional | the address, for example https://openrouter.ai; the chosen model's when absent. |

| Option | What it does |
|---|---|
| `--from-app` | you did this in WireCat Desktop. |
| `--json` | print JSON. |

**Example:** `wcat models ai remove https://api.anthropic.com`

#### `wcat models ai revoke`

stop sending images to the AI model; the model itself stays chosen

This command changes the local store or your files.

```sh
wcat models ai revoke [options]
```

| Option | What it does |
|---|---|
| `--from-app` | you did this in WireCat Desktop. |
| `--json` | print JSON. |

**Example:** `wcat models ai revoke`

#### `wcat models ai check`

send one short request (billed by the provider, usually under a cent) and say what is wrong

**Reads from an outside service.**

```sh
wcat models ai check [options]
```

| Option | What it does |
|---|---|
| `--from-app` | you did this in WireCat Desktop. |
| `--json` | print JSON. |

**Example:** `wcat models ai check`

### `wcat models local-only`

keep every model call on this computer: refuse any address that is not, in every WireCat tool

#### `wcat models local-only show`

whether local only is on, and for each feature whether its data stays on this computer

```sh
wcat models local-only show [options]
```

| Option | What it does |
|---|---|
| `--json` | print JSON. |

**Example:** `wcat models local-only show`

#### `wcat models local-only set`

turn local only on or off; only you turn it off

This command changes the local store or your files.

```sh
wcat models local-only set <state> [options]
```

| Argument | | What it is |
|---|---|---|
| `state` | required | on or off. |

| Option | What it does |
|---|---|
| `--from-app` | you did this in WireCat Desktop. |
| `--json` | print JSON. |

**Example:** `wcat models local-only set on`, `wcat models local-only set off`

### `wcat models chats`

whether chat text may go to a model off this computer: allowed, ask or denied

#### `wcat models chats show`

whether chat text may go to a model outside this computer, and since when

```sh
wcat models chats show [options]
```

| Option | What it does |
|---|---|
| `--json` | print JSON. |

**Returns:** chat sending — mode, meaning, since, changed; every field: wcat commands info models chats show

**Example:** `wcat models chats show`

#### `wcat models chats set`

allowed: no yes needed; ask: --yes needed, an agent may pass it; denied: refused even with --yes. Only you make it less strict

This command changes the local store or your files.

```sh
wcat models chats set <mode> [options]
```

| Argument | | What it is |
|---|---|---|
| `mode` | required | allowed, ask or denied. |

| Option | What it does |
|---|---|
| `--from-app` | you did this in WireCat Desktop. |
| `--json` | print JSON. |

**Returns:** chat sending — mode, meaning, since, changed; every field: wcat commands info models chats set

**Example:** `wcat models chats set allowed`, `wcat models chats set ask`, `wcat models chats set denied`

### `wcat models picture-reading`

let your coding agent read the text of a picture you choose: never (the default) or on request

#### `wcat models picture-reading show`

whether `images read` may give a picture to your coding agent, which one and with which model

```sh
wcat models picture-reading show [options]
```

| Option | What it does |
|---|---|
| `--json` | print JSON. |

**Example:** `wcat models picture-reading show`

#### `wcat models picture-reading set`

never, or on request with `images read`; only you turn it on

This command changes the local store or your files.

```sh
wcat models picture-reading set <mode> [options]
```

| Argument | | What it is |
|---|---|---|
| `mode` | required | never or request. |

| Option | What it does |
|---|---|
| `--agent <agent>` | the coding agent that reads: claude or codex. One of: `claude`, `codex`. |
| `--model <model>` | the agent's model; its own default if not given. |
| `--from-app` | you did this in WireCat Desktop. |
| `--json` | print JSON. |

**Example:** `wcat models picture-reading set request --agent claude`, `wcat models picture-reading set request --agent codex --model gpt-5`, `wcat models picture-reading set never`

## `wcat domain-lists`

lists of bank, shop, news and spam domains that give organizations their sector, matched on this computer

### `wcat domain-lists list`

the lists downloaded here, with their licence, licence class and size

```sh
wcat domain-lists list [options]
```

| Option | What it does |
|---|---|
| `--json` | print JSON. |

**Returns:** domain list — id, title, signal, class, licence, licence_url, attribution, homepage, and 7 more; every field: wcat commands info domain-lists list

**Example:** `wcat domain-lists list`, `wcat domain-lists list --json`

### `wcat domain-lists update`

download the newest pack from WireCat's GitHub release, each file checked by sha256; lists that may not be redistributed come whole from their own source. No sender is ever sent anywhere

This command changes the local store or your files.

```sh
wcat domain-lists update [options]
```

| Option | What it does |
|---|---|
| `--commercial-only` | leave out lists whose terms forbid commercial use, and remove those already here. |
| `--offline` | refuse a download that needs the network. |
| `--json` | print JSON. |

**Returns:** domain list — id, title, signal, class, licence, licence_url, attribution, homepage, and 7 more; every field: wcat commands info domain-lists update

**Example:** `wcat domain-lists update`, `wcat domain-lists update --commercial-only`

## `wcat templates`

the templates of the digest and the other messages sent to you, per channel and language; edit, preview, reset

### `wcat templates list`

every template key, channel and language, and whether yours or the shipped one applies

```sh
wcat templates list [query] [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | optional | field:value terms that narrow the list — the fields are below. |

| Option | What it does |
|---|---|
| `--json` | print JSON. |

**Returns:** template — key, channel, language, about, renders, source, updated_at, updated_by; every field: wcat commands info templates list

**Example:** `wcat templates list`, `wcat templates list channel:telegram source:stored --json`

### `wcat templates show`

the template that applies, yours or the shipped one, and the bodies your changes replaced

```sh
wcat templates show <key> [options]
```

| Argument | | What it is |
|---|---|---|
| `key` | required | the template, such as report/morning-digest. |

| Option | What it does |
|---|---|
| `--channel <channel>` | telegram (Bot API HTML), email (HTML with inline styles) or text. One of: `telegram`, `email`, `text`. |
| `--locale <code>` | the template's language, ISO 639-1; the owner's first language if not given. |
| `--json` | print JSON. |

**Example:** `wcat templates show report/morning-digest --channel telegram`, `wcat templates show report/weekly-gaps --channel email --locale en --json`

### `wcat templates edit`

change a template in $EDITOR or from --file; it is checked first, and a failed check saves nothing and says why

This command changes the local store or your files.

```sh
wcat templates edit <key> [options]
```

| Argument | | What it is |
|---|---|---|
| `key` | required | the template, such as report/morning-digest. |

| Option | What it does |
|---|---|
| `--channel <channel>` | telegram (Bot API HTML), email (HTML with inline styles) or text. One of: `telegram`, `email`, `text`. |
| `--locale <code>` | the template's language, ISO 639-1; the owner's first language if not given. |
| `--file <file>` | take the new template from this file instead of opening an editor; - reads stdin. |
| `--undo` | put back the body your last change replaced; twice is back where you were. |
| `--json` | print JSON. |

**Example:** `wcat templates edit report/morning-digest --channel telegram`, `wcat templates edit report/morning-digest --channel text --file digest.text.liquid`, `wcat templates edit report/morning-digest --channel telegram --undo`

### `wcat templates preview`

what would be sent on that channel, from the last real report or a synthetic one when there is none; saves nothing

```sh
wcat templates preview <key> [options]
```

| Argument | | What it is |
|---|---|---|
| `key` | required | the template, such as report/morning-digest. |

| Option | What it does |
|---|---|
| `--channel <channel>` | telegram (Bot API HTML), email (HTML with inline styles) or text. One of: `telegram`, `email`, `text`. |
| `--locale <code>` | the template's language, ISO 639-1; the owner's first language if not given. |
| `--file <file>` | preview this draft instead of the template that applies; - reads stdin. |
| `--json` | print JSON. |

**Example:** `wcat templates preview report/morning-digest --channel telegram`, `wcat templates preview report/morning-digest --channel email --locale en --file draft.liquid`

### `wcat templates reset`

go back to the shipped template; yours is kept in the history, and edit --undo brings it back

This command changes the local store or your files.

```sh
wcat templates reset <key> [options]
```

| Argument | | What it is |
|---|---|---|
| `key` | required | the template, such as report/morning-digest. |

| Option | What it does |
|---|---|
| `--channel <channel>` | telegram (Bot API HTML), email (HTML with inline styles) or text. One of: `telegram`, `email`, `text`. |
| `--locale <code>` | the template's language, ISO 639-1; the owner's first language if not given. |
| `--json` | print JSON. |

**Example:** `wcat templates reset report/morning-digest --channel telegram`

## `wcat search`

search messages, mail, notes, memories and people; search all when unsure where

### `wcat search all`

messages, mail, notes, calendar events, deals, leads, business data, meeting passages from every meeting account and tracker issues and projects, ranked together; not people, memories, wcat's projects or decisions. A kind you know reads better with its own search, with all its fields

```sh
wcat search all <query> [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | required | words, phrases, Boolean operators and field queries. |

| Option | What it does |
|---|---|
| `--limit <n>` | most results, at most 100. Default: `20`. |
| `--exact` | words as written; skip meaning search. |
| `--timezone <zone>` | IANA timezone for calendar date boundaries. |
| `--json` | print JSON; --json=id,title keeps only those fields. |
| `--only <resources>` | messages,mail,notes,events,crm,business,meetings,tracker, separated by commas. |
| `--source <accounts>` | only these accounts, separated by commas: provider:account as a hit shows it, a provider, a kind or group:<name>; each resource reads the ones of its kind, and one it names none of is left out. |
| `--plain-order` | best first by the words alone, without moving mail from suspicious senders down. |
| `--harder` | a hosted model reorders the first 30 hits; sends the question and those hits to the provider you chose with wcat models search-consents set <provider> --yes, only after that. |
| `--project <project>` | rank the key documents of this project (id, project:<id>, key, exact name or alias) first; nothing is left out. |

**Returns:** hit — kind, ref, provider, account, title, timestamp, excerpt, url, and 19 more; every field: wcat commands info search all

**Example:** `wcat search all 'budget harbour'`, `wcat search all 'Rental agreement' --only business`, `wcat search all 'release date' --source zoom:work,notes --json`

### `wcat search messages`

stored messenger messages only

```sh
wcat search messages <query> [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | required | words, phrases, Boolean operators and field queries. |

| Option | What it does |
|---|---|
| `--limit <n>` | most results, at most 100. Default: `20`. |
| `--exact` | words as written; skip meaning search. |
| `--timezone <zone>` | IANA timezone for calendar date boundaries. |
| `--json` | print JSON; --json=id,title keeps only those fields. |
| `--brief` | each message as reference, time, sender and excerpt only. |
| `--full` | each message with its whole text; --json still gives the excerpt. |

**Returns:** message hit — ref, timestamp, sender_name, sender_is_me, chat_title, excerpt, matched_in, score, and 9 more; every field: wcat commands info search messages

**Next usually:** `wcat messages show <message>`

**Example:** `wcat search messages 'friday meeting has:voice'`

### `wcat search mail`

imported emails only

```sh
wcat search mail <query> [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | required | words, phrases, Boolean operators and field queries. |

| Option | What it does |
|---|---|
| `--limit <n>` | most results, at most 100. Default: `20`. |
| `--exact` | words as written; skip meaning search. |
| `--timezone <zone>` | IANA timezone for calendar date boundaries. |
| `--json` | print JSON; --json=id,title keeps only those fields. |
| `--brief` | each email as reference, time, sender and excerpt only. |
| `--full` | each email with its whole text; --json still gives the excerpt. |
| `--source <accounts>` | the mailboxes to search (default: every one): email:<address>, email or group:<name>. |
| `--plain-order` | best first by the words alone, without moving mail from suspicious senders down. |

**Returns:** message hit — ref, timestamp, sender_name, sender_is_me, chat_title, excerpt, matched_in, score, and 9 more; every field: wcat commands info search mail

**Next usually:** `wcat messages show <message>`

**Example:** `wcat search mail 'mailbox:important budget' --source email:me@example.com`

### `wcat search notes`

native notes by words and, with the local model, meaning

```sh
wcat search notes <query> [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | required | words, phrases, Boolean operators and field queries. |

| Option | What it does |
|---|---|
| `--limit <n>` | most results, at most 100. Default: `20`. |
| `--exact` | words as written; skip meaning search. |
| `--timezone <zone>` | IANA timezone for calendar date boundaries. |
| `--json` | print JSON; --json=id,title keeps only those fields. |
| `--filter <query>` | another query every note must match. |
| `--source <accounts>` | only these notes accounts, separated by commas: notes:internal for notes written in wcat, notes:<folder id> as a hit shows it, notes or group:<name>. |
| `--page <n>` | which page, from 1. Default: `1`. |
| `--project <project>` | rank the key documents of this project (id, project:<id>, key, exact name or alias) first, labelled key; nothing is left out. |

**Returns:** note hit — ref, source, folder_id, path, title, updated_at, kind, provider, and 6 more; every field: wcat commands info search notes

**Example:** `wcat search notes budget notes:2`, `wcat search notes kickoff --project HRB --json`

### `wcat search memories`

memories holding every word, best first

```sh
wcat search memories <query> [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | required | the words to find; scope:personal or scope:work narrows them. |

| Option | What it does |
|---|---|
| `--limit <n>` | most memories, up to 500. Default: `20`. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Returns:** memory — ref, id, kind, text, subject, author, model, confidence, and 13 more; every field: wcat commands info search memories

**Example:** `wcat search memories friday meetings scope:work`

### `wcat search people`

people whose name, username or alias holds every word, in every account unless --source narrows it; each with its person:<id> for --contact and its identities

```sh
wcat search people <name> [options]
```

| Argument | | What it is |
|---|---|---|
| `name` | required | parts of the name, username or alias; case and accents do not matter. |

| Option | What it does |
|---|---|
| `--source <accounts>` | which accounts, separated by commas: provider:account (email:personal), a provider (email), a kind (mail, notes, documents) or group:<name>. |
| `--limit <n>` | most people, at most 100. Default: `20`. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Returns:** person — ref, name, identities; every field: wcat commands info search people

**Next usually:** `wcat context <person>`, `wcat tasks assign <id> <person>`, `wcat mentions confirm <id> [person]`

**Example:** `wcat search people ana`, `wcat search people Ana Example --source telegram --json`

### `wcat search meetings`

find words in stored meetings, indexing new ones first

```sh
wcat search meetings <query> [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | required | words, OR, (groups), -word, "a phrase", "a b"\~N (within N lines), exact:word, from:"Name" (who said the line); date>=30d, project:, tag:, topic: choose meetings; a word also matches its other forms and spellings speech recognition garbled. |

| Option | What it does |
|---|---|
| `--meeting-id <id>` | only this stored meeting. |
| `--identity-id <id>` | meetings with this participant identity; does not say who spoke a hit. |
| `--person-id <id>` | meetings with a participant linked to this person. |
| `--event-id <id>` | only meetings linked to this stored event. |
| `--series-id <id>` | only meetings in this stored series. |
| `--project <project>` | meetings confirmed in this project, by name, key or alias. |
| `--topic-name <name>` | meetings with this topic, by name or alias. |
| `--since-time <time>` | meetings starting at or after this ISO 8601 date or time, or 30m, 2h, 7d ago. |
| `--until-time <time>` | meetings starting at or before this ISO 8601 date or time; a date alone covers that whole local day. |
| `--limit <n>` | how many hits, 1 through 1000; the profile's defaults.limit when absent. |
| `--cursor <cursor>` | continue from the previous page's page.next_cursor, with the same query and filters. |
| `--max-read-bytes <bytes>` | most stored bytes to read, 1 through 67108864 (default 4194304). |
| `--source <accounts>` | the meeting account: provider:account (zoom:me@example.com), or a provider that has one. |
| `--json` | print the standard JSON answer. |

**Returns:** meeting hit — ref, meeting, scope, id, excerpt, offset_ms, language, line, and 8 more; every field: wcat commands info search meetings

**Next usually:** `wcat meetings show <meeting>`

**Example:** `wcat search meetings budget --source zoom:me@example.com --project Harbour --since-time 2026-10-01 --limit 10 --json`

## `wcat events`

calendar events of every account in the store, phone calls included

### `wcat events list`

events of every calendar account in the store, latest start first: calendars and imported phone calls

```sh
wcat events list [query] [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | optional | field:value terms that narrow the list — the fields are below. |

| Option | What it does |
|---|---|
| `--limit <n>` | events at most, 1–1000. Default: `100`. |
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Returns:** event — id, event_series_id, title, description, location, starts_at, ends_at, timezone, and 13 more; every field: wcat commands info events list

**Example:** `wcat events list event_type:call`, `wcat events list account:phone:pixel 'starts_at:[2026-11-02 TO 2026-11-07}' --json`

### `wcat events show`

one event: its time, the accounts and calendars that hold it, and its attendees

```sh
wcat events show <ref> [options]
```

| Argument | | What it is |
|---|---|---|
| `ref` | required | event:<id>. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=ref,title keeps only those fields. |

**Returns:** event — id, event_series_id, title, description, location, starts_at, ends_at, timezone, and 13 more; every field: wcat commands info events show

**Example:** `wcat events show event:42`

## `wcat answers`

cited evidence and optional model answers

### `wcat answers create`

prepare cited evidence for your agent, or explicitly call a configured model

```sh
wcat answers create <question> [query] [options]
```

| Argument | | What it is |
|---|---|---|
| `question` | required | the question, in your own words. |
| `query` | optional | what to search for: words, phrases, Boolean operators and field queries; default the question. |

| Option | What it does |
|---|---|
| `--all` | look in every stored account and the notes. |
| `--source <accounts>` | look in these only: which accounts, separated by commas: provider:account (email:personal), a provider (email), a kind (mail, notes, documents) or group:<name>. |
| `--limit <n>` | most evidence items, at most 100. Default: `20`. |
| `--analyze` | call the AI model (wcat models ai set, or WCAT_MODELS_ANALYSIS_*) instead of returning evidence. |
| `--allow-remote` | explicitly consent to sending this evidence to the configured model. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat answers create 'what did Kai say about the budget?' --all`, `wcat answers create 'when is the launch?' --source telegram:1`

## `wcat sync`

embed the mail already stored for search by meaning, match people across sources (wcat people scan), and run files sync when the files CLI is installed, which brings notes folders up to date; the mail CLI syncs the mail itself (mail <profile> sync)

This command changes the local store or your files.

```sh
wcat sync [options]
```

| Option | What it does |
|---|---|
| `--only <resources>` | notes,mail,people, separated by commas; notes runs files sync, mail embeds stored mail only, people links who is who. |
| `--no-embed` | skip embedding notes and mail for search by meaning this run. |
| `--timeout <duration>` | stop after this long, e.g. 10m; progress so far is kept (default: no limit). |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat sync`, `wcat sync --only mail`, `wcat sync --only people --no-embed`

## `wcat store`

the shared local store every WireCat tool reads

### `wcat store info`

the store file: where it is, its size, its schema against the one wcat speaks, which tools used it and how many rows it holds; changes nothing

```sh
wcat store info [options]
```

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Returns:** store info — path, exists, schema, opens, error, bytes, journal_mode, pages, and 12 more; every field: wcat commands info store info

**Example:** `wcat store info`, `wcat store info --json`

### `wcat store recover`

check every page and search index of the store, say what is damaged, what it means and the commands that recover it; changes nothing

```sh
wcat store recover [options]
```

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat store recover`

#### `wcat store recover run`

copy every readable row into a new file with the sqlite3 program, rebuild the search indexes, mentions and vector index, check it, and put it in place of the store; the damaged file is kept beside it. Refuses while a WireCat timer or process has the store

This command changes the local store or your files.

```sh
wcat store recover run [options]
```

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat store recover run`

## `wcat groups`

account groups: wcat <group> … reads only the group's accounts

### `wcat groups list`

every saved group, then all, with its accounts, each with its profiles in every app and the other groups that hold it too; duplicates and profile-name suggestions last

```sh
wcat groups list [query] [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | optional | field:value terms; this list filters by none yet. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat groups list`, `wcat groups list --json`

### `wcat groups add`

put an account in a group, which is made when it does not exist; it may stay in others too

This command changes the local store or your files.

```sh
wcat groups add <group> <source> [options]
```

| Argument | | What it is |
|---|---|---|
| `group` | required | the group: letters, digits, - and _, not a wcat command word. |
| `source` | required | one account, as --source names it: telegram:102, tg:work, email:me@work.example, bitrix24:<portal>. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat groups add work bitrix24:acme`, `wcat groups add personal telegram:102`

### `wcat groups remove`

take an account out of a group; the account and its data stay, and `all` still reads it

This command changes the local store or your files.

```sh
wcat groups remove <group> <source> [options]
```

| Argument | | What it is |
|---|---|---|
| `group` | required | the group. |
| `source` | required | one account, as --source names it: telegram:102, tg:work, email:me@work.example, bitrix24:<portal>. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat groups remove work telegram:102`

### `wcat groups move`

move an account from one group to another in one write; the other group is made when it is new

This command changes the local store or your files.

```sh
wcat groups move <source> <from> <to> [options]
```

| Argument | | What it is |
|---|---|---|
| `source` | required | one account, as --source names it: telegram:102, tg:work, email:me@work.example, bitrix24:<portal>. |
| `from` | required | the group it leaves. |
| `to` | required | the group it joins. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat groups move telegram:102 personal work`

### `wcat groups rename`

give a group another name, with its members; a run, lock or agent that still names the old one is refused with the groups there are

This command changes the local store or your files.

```sh
wcat groups rename <group> <name> [options]
```

| Argument | | What it is |
|---|---|---|
| `group` | required | the group. |
| `name` | required | its new name: letters, digits, - and _, not a wcat command word. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat groups rename work office`

### `wcat groups delete`

delete a group and its memberships; its accounts and their data stay, in their other groups and in `all`

This command changes the local store or your files.

```sh
wcat groups delete <group> [options]
```

| Argument | | What it is |
|---|---|---|
| `group` | required | the group. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat groups delete clients`

### `wcat groups update`

set an account's scope, personal or work, which decides whether work views and meeting preparation read it; with --chat, pin one chat of it to a scope, or let it follow its account again

This command changes the local store or your files.

```sh
wcat groups update <source> [options]
```

| Argument | | What it is |
|---|---|---|
| `source` | required | one account, as --source names it: telegram:102, tg:work, email:me@work.example, bitrix24:<portal>. |

| Option | What it does |
|---|---|
| `--scope <scope>` | personal or work; with --chat also account, which takes the chat's own off. |
| `--chat <chat>` | one chat of the account, by its id there. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat groups update bitrix24:acme --scope work`, `wcat groups update telegram:102 --chat 7 --scope account`

## `wcat jobs`

run wcat sync on a systemd user timer, set in the config

### `wcat jobs start`

sync every --every (default auto.every, else 5m), starting a minute from now

This command changes the local store or your files.

```sh
wcat jobs start [options]
```

| Option | What it does |
|---|---|
| `--every <duration>` | how often: 5m, 90s, 1h — a minute or more. |

**Example:** `wcat jobs start --every 10m`

### `wcat jobs stop`

stop syncing on a timer and remove the timer

This command changes the local store or your files.

```sh
wcat jobs stop
```

**Example:** `wcat jobs stop`

### `wcat jobs status`

whether the timer is on, its interval, its next run and how the last one ended

```sh
wcat jobs status [options]
```

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat jobs status --json`

## `wcat config`

wcat's settings file

### `wcat config show`

every setting, its value, its default and whether the file sets it

```sh
wcat config show [options]
```

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat config show`, `wcat config show --json`

### `wcat config migrate`

write each setting the file lacks at its default, keeping yours

This command changes the local store or your files.

```sh
wcat config migrate [options]
```

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat config migrate`

### `wcat config unset`

remove one setting from the config file, even one wcat does not know

This command changes the local store or your files.

```sh
wcat config unset <key> [options]
```

| Argument | | What it is |
|---|---|---|
| `key` | required | the setting's dotted path, as wcat doctor names it, e.g. permissions.notes.edit. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat config unset permissions.facts.add`

## `wcat doctor`

the state this installation is in, without connecting unless --online

```sh
wcat doctor [options]
```

| Option | What it does |
|---|---|
| `--online` | also connect once and read the account; sends nothing. |
| `--deep` | also read every page of the store and check every search index (about 30 s for 6 GB); without it, only the file header and schema. |
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat doctor`, `wcat doctor --json`

### `wcat doctor reports`

problem reports

#### `wcat doctor reports show`

what a problem report holds; writes nothing

```sh
wcat doctor reports show
```

**Example:** `wcat doctor reports show`

#### `wcat doctor reports create`

write a problem report to a file, and say where to send it

This command changes the local store or your files.

```sh
wcat doctor reports create [options]
```

| Option | What it does |
|---|---|
| `--run <id>` | the run the report is about; the newest failed one if not given. |
| `--output <file>` | where to write it; a new file in this directory if not given. |

**Example:** `wcat doctor reports create --output ./problem-report.json`

## `wcat upgrade`

upgrade wcat with the package manager that installed it; --check only looks

This command changes the local store or your files.

```sh
wcat upgrade [options]
```

| Option | What it does |
|---|---|
| `--check` | say whether a newer version exists, and install nothing. |
| `--json` | print JSON. |

**Example:** `wcat upgrade --check`

## `wcat schedule`

run a wcat command or an agent later or on a timer (systemd, launchd, Task Scheduler); an agent cannot send

### `wcat schedule command`

run wcat <args…> on a timer — reads save what they read, so this is how the store stays current

This command changes the local store or your files.

```sh
wcat schedule command <name> <args> [options]
```

| Argument | | What it is |
|---|---|---|
| `name` | required | lowercase letters, digits and dashes. |
| `args` | required | the wcat command after its name, e.g. -- doctor. |

| Option | What it does |
|---|---|
| `--every <duration>` | repeat: 30m, 2h, 1d. |
| `--at <HH:MM>` | every day at this local time; 'mon 09:00' once a week, 'mon,fri 09:00' on several days (mon, tue, wed, thu, fri, sat, sun); repeat it for more times. |
| `--at-time <time>` | one run: 30m, 2d from now, or an ISO time; the schedule removes itself after it. |
| `--notify-on <when>` | desktop notice after a run (default failures for an agent that repeats with --every, else always). One of: `always`, `failures`, `never`. |
| `--deliver-to <route>` | also send the result, when --notify-on says so, by the owner's own tg or mail: telegram-bot:<profile>/<chat id or user:id>, or email:<profile>/<address>; repeat it for more. |
| `--json` | print JSON. |

**Example:** `wcat schedule command digest --at 08:30 -- review status`, `wcat schedule command mail-sync --every 1h -- sync --only mail`

### `wcat schedule agent`

start an agent (claude, codex, gemini, cursor, opencode, openclaw, hermes, grok, kimi) with a prompt on a timer; it runs with WCAT_READ_ONLY=1 and MAIL_READ_ONLY=1, so it reads and drafts and cannot send, and its own limits hold it to these CLIs' commands; an agent with no such limit is refused (`schedule agents list` says which) — its answer is kept and you are notified

This command changes the local store or your files.

```sh
wcat schedule agent <name> <harness> <prompt> [options]
```

| Argument | | What it is |
|---|---|---|
| `name` | required | lowercase letters, digits and dashes. |
| `harness` | required | the agent to start. One of: `claude`, `codex`, `gemini`, `cursor`, `opencode`, `openclaw`, `hermes`, `grok`, `kimi`. |
| `prompt` | required | what to do, e.g. "say what needs attention in this installation: wcat doctor". |

| Option | What it does |
|---|---|
| `--model <model>` | the model it runs on: an alias such as sonnet, or a model id; "" for the agent's own default (default sonnet for claude, the agent's own for the others, or the config file's). |
| `--max-cost <usd>` | claude only: stop a run that costs more than this, in US dollars. |
| `--allow-dangerous` | start an agent its own limits cannot hold to these CLIs' commands, where `schedule agents list` says allowed_with_ack: it may then run any program inside its sandbox. |
| `--max-cost-per-day <usd>` | claude only, as the others report no cost: start no run for the rest of the day once its runs cost this much, in US dollars; 0 for no cap (default 5, or the config file's). |
| `--every <duration>` | repeat: 30m, 2h, 1d. |
| `--at <HH:MM>` | every day at this local time; 'mon 09:00' once a week, 'mon,fri 09:00' on several days (mon, tue, wed, thu, fri, sat, sun); repeat it for more times. |
| `--at-time <time>` | one run: 30m, 2d from now, or an ISO time; the schedule removes itself after it. |
| `--notify-on <when>` | desktop notice after a run (default failures for an agent that repeats with --every, else always). One of: `always`, `failures`, `never`. |
| `--deliver-to <route>` | also send the result, when --notify-on says so, by the owner's own tg or mail: telegram-bot:<profile>/<chat id or user:id>, or email:<profile>/<address>; repeat it for more. |
| `--on-new-mail <holder>` | run only when mail is stored past this holder's mark — after a sync brought new mail; may check every 5m. |
| `--mail-wait <duration>` | with --on-new-mail: start once the oldest waiting email has waited this long (default 30m, or the config file's). |
| `--mail-batch <n>` | with --on-new-mail: or once this many emails wait (default 10, or the config file's). |
| `--json` | print JSON. |

**Example:** `wcat schedule agent triage claude 'read wcat review status and list what needs me today' --at 08:45 --max-cost 1`, `wcat schedule agent mail-triage claude 'Run wcat skill show mail-triage and follow it.' --every 5m --on-new-mail mail-triage --mail-wait 1h --mail-batch 20 --max-cost 1 --max-cost-per-day 5`, `wcat schedule agent weekly claude 'read wcat review status and sum up the week' --at 09:00 --model opus`

### `wcat schedule list`

the schedules, when they run and how their last run went

```sh
wcat schedule list [query] [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | optional | field:value terms that narrow the list — the fields are below. |

| Option | What it does |
|---|---|
| `--json` | print JSON. |

**Returns:** scheduled job — name, kind, when, last, paused, notify, deliver_to, harness, and 4 more; every field: wcat commands info schedule list

**Example:** `wcat schedule list`, `wcat schedule list kind:agent --json`

### `wcat schedule agents`

the coding agents an agent schedule may start

```sh
wcat schedule agents [options]
```

| Option | What it does |
|---|---|
| `--json` | print JSON. |

#### `wcat schedule agents list`

the agents a schedule may start, and which are on PATH here

```sh
wcat schedule agents list [query]
```

| Argument | | What it is |
|---|---|---|
| `query` | optional | field:value terms; this list filters by none yet. |

**Returns:** schedule harness — id, name, programs, reports_cost, restricted, restricted_reason, allowed_with_ack, installed, and 1 more; every field: wcat commands info schedule agents list

**Example:** `wcat schedule agents list`, `wcat schedule agents list --json`

### `wcat schedule run`

run a schedule now, as its timer would, and wait for it; a paused one runs too

This command changes the local store or your files.

```sh
wcat schedule run <name> [options]
```

| Argument | | What it is |
|---|---|---|
| `name` | required | the schedule's name, as `schedule list` shows it. |

| Option | What it does |
|---|---|
| `--no-notify` | keep the result here: send it along none of its routes. |
| `--deliver-to <route>` | send it along only this one of its own routes; repeat it for more. |
| `--json` | print JSON. |

**Example:** `wcat schedule run digest`

### `wcat schedule remove`

stop a schedule and remove its timer; its past output stays

This command changes the local store or your files.

```sh
wcat schedule remove <name> [options]
```

| Argument | | What it is |
|---|---|---|
| `name` | required | the schedule's name, as `schedule list` shows it. |

| Option | What it does |
|---|---|
| `--json` | print JSON. |

**Example:** `wcat schedule remove digest`

### `wcat schedule pause`

take a schedule off its timer and keep it; run runs it, resume puts it back

This command changes the local store or your files.

```sh
wcat schedule pause <name> [options]
```

| Argument | | What it is |
|---|---|---|
| `name` | required | the schedule's name, as `schedule list` shows it. |

| Option | What it does |
|---|---|
| `--json` | print JSON. |

**Example:** `wcat schedule pause digest`

### `wcat schedule resume`

put a paused schedule back on its timer

This command changes the local store or your files.

```sh
wcat schedule resume <name> [options]
```

| Argument | | What it is |
|---|---|---|
| `name` | required | the schedule's name, as `schedule list` shows it. |

| Option | What it does |
|---|---|
| `--json` | print JSON. |

**Example:** `wcat schedule resume digest`

### `wcat schedule exec`

what a timer runs, given the schedule's file; to run one by hand, use run

This command changes the local store or your files.

```sh
wcat schedule exec <file> [seal] [options]
```

| Argument | | What it is |
|---|---|---|
| `file` | required | the schedule's schedule.json in the state folder, as the timer passes it. |
| `seal` | optional | the file's SHA-256 as it was saved, which the timer passes; a file that differs does not run. |

| Option | What it does |
|---|---|
| `--json` | print JSON. |

**Example:** `wcat schedule exec ~/.local/state/wcat/schedules/digest/schedule.json`

## `wcat digest`

your digests: each a name, its times, what it reads, where it is sent and your brief; run one now, pause it, build past days, and read the last reports with what became of each item

### `wcat digest brief`

your own instructions on what the morning digest collects: projects, people, topics, what to skip, how many items. The morning-digest skill ends with them, and where they contradict its rules they win; the run stays read only, with wcat as its only tool and the schedule's cost cap. At most 4000 characters

#### `wcat digest brief show`

```sh
wcat digest brief show [digest] [options]
```

| Argument | | What it is |
|---|---|---|
| `digest` | optional | the digest's name, as `wcat digest list` shows it; morning-digest when left out. |

| Option | What it does |
|---|---|
| `--json` | print JSON. |

**Example:** `wcat digest brief show`, `wcat digest brief show --json`

#### `wcat digest brief edit`

write the brief in $EDITOR, or from --file; at most 4000 characters. The body it replaces is kept, and --undo puts it back. Only you change it, never an agent or a read-only run

This command changes the local store or your files.

```sh
wcat digest brief edit [digest] [options]
```

| Argument | | What it is |
|---|---|---|
| `digest` | optional | the digest's name, as `wcat digest list` shows it; morning-digest when left out. |

| Option | What it does |
|---|---|
| `--file <file>` | take the brief from this file instead of opening an editor; - reads stdin. |
| `--undo` | put back the body your last change replaced. |
| `--json` | print JSON. |

**Example:** `wcat digest brief edit`, `wcat digest brief edit --file brief.md`, `wcat digest brief edit --undo`

#### `wcat digest brief reset`

remove the brief, so the digest follows its skill alone; edit --undo brings it back

This command changes the local store or your files.

```sh
wcat digest brief reset [digest] [options]
```

| Argument | | What it is |
|---|---|---|
| `digest` | optional | the digest's name, as `wcat digest list` shows it; morning-digest when left out. |

| Option | What it does |
|---|---|
| `--json` | print JSON. |

**Example:** `wcat digest brief reset`

### `wcat digest list`

```sh
wcat digest list [query] [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | optional | field:value terms that narrow the list — the fields are below. |

| Option | What it does |
|---|---|
| `--json` | print JSON. |

**Example:** `wcat digest list`, `wcat digest list name:weekly --json`

### `wcat digest add`

make a digest: an agent that runs wcat's morning-digest skill at the given times, reading from its previous time (a weekly one reads the week) and only the sources given, and sends what it writes along the routes given. It runs read only. Each run is a paid model call; only you make one

This command changes the local store or your files.

```sh
wcat digest add <name> [options]
```

| Argument | | What it is |
|---|---|---|
| `name` | required | lowercase letters, digits and dashes. |

| Option | What it does |
|---|---|
| `--paused` | make it without putting it on its timer; `wcat digest resume` does. |
| `--title <title>` | the name the digest is shown under. |
| `--at <HH:MM>` | when it runs: HH:MM every day, or 'mon,fri 09:00' on those days; repeat it for more times, as 08:30 and 18:00. |
| `--source <accounts>` | what it reads, comma-separated or repeated: telegram, max, whatsapp, mail, meetings, tasks, drive, calendar, crm; all (the default) reads everything. |
| `--deliver-to <route>` | where each run is sent: telegram-bot:<profile>/<chat> or email:<profile>/<address>; repeat it for more, none for nowhere. |
| `--text <text>` | your brief: what to collect, what to skip, how much; at most 4000 characters. |
| `--agent <agent>` | the agent that writes it; a new digest takes the one agent installed, and asks when there are more. A local model needs an agent set up to run one. One of: `claude`, `codex`, `gemini`, `cursor`, `opencode`, `openclaw`, `hermes`, `grok`, `kimi`. |
| `--model <model>` | the model the agent runs on: an alias such as sonnet or a model id; "" for the agent's own default. |
| `--allow-dangerous` | let an agent whose own limits cannot hold it to wcat's commands write it, where `wcat schedule agents list` says allowed_with_ack (codex): it may then run any program inside its sandbox. Only you give this. |
| `--max-cost <usd>` | stop a run that costs more than this, in US dollars; only for an agent that reports its cost. |
| `--max-cost-per-day <usd>` | start no run for the rest of the day once its runs cost this much, in US dollars; 0 for no cap. |
| `--json` | print JSON. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |

**Example:** `wcat digest add evening --title 'Evening digest' --at 18:00 --deliver-to telegram-bot:personal/user:42`, `wcat digest add weekly --title 'The week' --at 'mon 09:00' --source telegram,mail,tasks`

### `wcat digest edit`

change a digest: each option given replaces what it set before (--at all its times, --source all its sources, --deliver-to all its routes), and the rest stays as it was. --source all reads everything again, --deliver-to none sends nowhere. A paused digest stays paused. Only you change one

This command changes the local store or your files.

```sh
wcat digest edit <name> [options]
```

| Argument | | What it is |
|---|---|---|
| `name` | required | the digest's name, as `wcat digest list` shows it. |

| Option | What it does |
|---|---|
| `--title <title>` | the name the digest is shown under. |
| `--at <HH:MM>` | when it runs: HH:MM every day, or 'mon,fri 09:00' on those days; repeat it for more times, as 08:30 and 18:00. |
| `--source <accounts>` | what it reads, comma-separated or repeated: telegram, max, whatsapp, mail, meetings, tasks, drive, calendar, crm; all (the default) reads everything. |
| `--deliver-to <route>` | where each run is sent: telegram-bot:<profile>/<chat> or email:<profile>/<address>; repeat it for more, none for nowhere. |
| `--text <text>` | your brief: what to collect, what to skip, how much; at most 4000 characters. |
| `--agent <agent>` | the agent that writes it; a new digest takes the one agent installed, and asks when there are more. A local model needs an agent set up to run one. One of: `claude`, `codex`, `gemini`, `cursor`, `opencode`, `openclaw`, `hermes`, `grok`, `kimi`. |
| `--model <model>` | the model the agent runs on: an alias such as sonnet or a model id; "" for the agent's own default. |
| `--allow-dangerous` | let an agent whose own limits cannot hold it to wcat's commands write it, where `wcat schedule agents list` says allowed_with_ack (codex): it may then run any program inside its sandbox. Only you give this. |
| `--max-cost <usd>` | stop a run that costs more than this, in US dollars; only for an agent that reports its cost. |
| `--max-cost-per-day <usd>` | start no run for the rest of the day once its runs cost this much, in US dollars; 0 for no cap. |
| `--json` | print JSON. |
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |

**Example:** `wcat digest edit evening --at 08:30 --at 18:00`, `wcat digest edit weekly --source all --deliver-to none`

### `wcat digest run`

build a digest now, as its timer would, paused or not, and keep the run with its others; it is sent along its routes, only along those --deliver-to names (each one of its own), or with --no-notify nowhere. A paid model call: the day's cost cap holds, and only you run it

This command changes the local store or your files.

```sh
wcat digest run <name> [options]
```

| Argument | | What it is |
|---|---|---|
| `name` | required | the digest's name, as `wcat digest list` shows it. |

| Option | What it does |
|---|---|
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--no-notify` | keep it here: send it nowhere. |
| `--deliver-to <route>` | send it only along this one of the digest's routes; repeat it for more. |
| `--json` | print JSON. |

**Example:** `wcat digest run evening`, `wcat digest run weekly --no-notify --json`

### `wcat digest pause`

This command changes the local store or your files.

```sh
wcat digest pause <name> [options]
```

| Argument | | What it is |
|---|---|---|
| `name` | required | the digest's name, as `wcat digest list` shows it. |

| Option | What it does |
|---|---|
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--json` | print JSON. |

**Example:** `wcat digest pause weekly`

### `wcat digest resume`

This command changes the local store or your files.

```sh
wcat digest resume <name> [options]
```

| Argument | | What it is |
|---|---|---|
| `name` | required | the digest's name, as `wcat digest list` shows it. |

| Option | What it does |
|---|---|
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--json` | print JSON. |

**Example:** `wcat digest resume weekly`

### `wcat digest remove`

This command changes the local store or your files.

```sh
wcat digest remove <name> [options]
```

| Argument | | What it is |
|---|---|---|
| `name` | required | the digest's name, as `wcat digest list` shows it. |

| Option | What it does |
|---|---|
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--json` | print JSON. |

**Example:** `wcat digest remove weekly`

### `wcat digest history`

the last reports a digest delivered, newest first, from its kept runs: each item with how many digests in a row had it (a reply owed two mornings running is in 2 digests in a row) and what became of it since, from the store as it is now: you answered, they wrote again, nothing new, or for a task done or still open. The digest's agent reads it to tell what is new, what is still open and what was done. A read: it runs under WCAT_READ_ONLY

```sh
wcat digest history [digest] [options]
```

| Argument | | What it is |
|---|---|---|
| `digest` | optional | the digest's name, as `wcat digest list` shows it; morning-digest when left out. |

| Option | What it does |
|---|---|
| `--last <n>` | how many reports. Default: `3`. |
| `--before-time <time>` | only reports made before this ISO time or date, as a past day's digest reads them. |
| `--json` | print JSON. |

**Example:** `wcat digest history --last 3 --compact`, `wcat digest history weekly --json`

### `wcat digest backfill`

build each past run a digest would have had: its schedule's agent runs as its timer does (the same skill, flags and cost caps), reading the agenda as of that run's time and from the digest's previous time, and the result is kept as that run, marked backfill, for WireCat Desktop's digests screen. It is never sent to Telegram or mail. A run that already has a digest is skipped. Without --yes it only prints what it would build and the estimate: the runs times the last run's cost. Each run is a paid model call: it stops once today's runs cost the schedule's daily cap or a run fails, and only you run it, never an agent. The store keeps what holds now, so a chat answered since reads as answered

This command changes the local store or your files.

```sh
wcat digest backfill [digest] [options]
```

| Argument | | What it is |
|---|---|---|
| `digest` | optional | the digest's name, as `wcat digest list` shows it; morning-digest when left out. |

| Option | What it does |
|---|---|
| `--from-app` | you did this in WireCat Desktop: record it as yours, with no terminal question. |
| `--since-time <time>` | the first day, YYYY-MM-DD. |
| `--until-time <time>` | the last day, YYYY-MM-DD; not a day whose run time is still ahead. |
| `--yes` | build them; without it, only the estimate is printed. |
| `--json` | print JSON. |

**Example:** `wcat digest backfill --since-time 2026-11-01 --until-time 2026-11-07`, `wcat digest backfill --since-time 2026-11-01 --until-time 2026-11-07 --yes --json`

## `wcat commands`

every command by section; --json prints its contract, one path per call

```sh
wcat commands [path] [options]
```

| Argument | | What it is |
|---|---|---|
| `path` | optional | one command, such as tags add. |

| Option | What it does |
|---|---|
| `--json` | print JSON; --json=id,title keeps only those fields. |

**Example:** `wcat commands`

### `wcat commands info`

one command contract, or all schemas, error reasons and explicit overrides

```sh
wcat commands info [path] [options]
```

| Argument | | What it is |
|---|---|---|
| `path` | optional | one command path; without one, schemas, error reasons and explicit overrides. |

| Option | What it does |
|---|---|
| `--json` | print JSON. |

**Example:** `wcat commands info --json`

## `wcat skill`

the instructions an agent is given for this tool

### `wcat skill show`

print SKILL.md — `wcat skill install` puts it where Claude Code, Codex, Gemini CLI and OpenClaw look for it, and where Hermes does on request; --for prints the copy already there; morning-digest ends with your brief from `wcat digest brief` when you wrote one

```sh
wcat skill show [name] [options]
```

| Argument | | What it is |
|---|---|---|
| `name` | optional | a part of this skill, or a skill shipped for a task: vocabulary, search, proposals, projects, money, meetings, mcp, mail, mail-triage, morning-digest, task-triage. |

| Option | What it does |
|---|---|
| `--for <agents>` | print the copy installed for these agents instead of this version's. One of: `claude`, `agents`. |
| `--json` | print JSON. |

**Example:** `wcat skill show`

### `wcat skill install`

write SKILL.md to \~/.claude/skills/wcat/ (Claude Code) and \~/.agents/skills/wcat/ (Codex, Gemini CLI, OpenClaw); --for hermes also has Hermes read \~/.agents/skills, which changes Hermes's own settings, so all leaves it out

This command changes the local store or your files.

```sh
wcat skill install [options]
```

| Option | What it does |
|---|---|
| `--for <agents>` | which agents to install for. One of: `claude`, `agents`, `hermes`, `all`. Default: `all`. |
| `--json` | print JSON. |

**Example:** `wcat skill install --for all`

### `wcat skill status`

for each place `wcat skill install` writes to, and for the copy Hermes reads: the path, the version installed there, and whether it is current, stale, missing or unversioned

```sh
wcat skill status [options]
```

| Option | What it does |
|---|---|
| `--json` | print JSON. |

**Example:** `wcat skill status`, `wcat skill status --json`

## `wcat guide`

scenarios: the commands for a common task, in order, and why each

```sh
wcat guide [name] [options]
```

| Argument | | What it is |
|---|---|---|
| `name` | optional | one scenario; without it, the list. |

| Option | What it does |
|---|---|
| `--json` | print JSON. |

**Example:** `wcat guide`, `wcat guide person-brief --json`

## `wcat runs`

recorded runs — what this tool did, and when

### `wcat runs list`

recorded runs, newest first

```sh
wcat runs list [query] [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | optional | field:value terms that narrow the list — the fields are below. |

| Option | What it does |
|---|---|
| `--limit <n>` | how many to show. |
| `--page <n>` | which page, starting at 1. |
| `--json` | print JSON. |

**Returns:** run — run_id, command, started_at, status, cli_version, profile, completed_at, requests, and 23 more; every field: wcat commands info runs list

**Example:** `wcat runs list status:failed --limit 10`, `wcat runs list --page 2 --json`

### `wcat runs show`

one run: what it was, how it ended, and every event it logged

```sh
wcat runs show <run-id> [options]
```

| Argument | | What it is |
|---|---|---|
| `run-id` | required | an id from `wcat runs list`. |

| Option | What it does |
|---|---|
| `--problems` | only failed responses, warnings and crashes. |
| `--json` | print JSON. |

**Returns:** run details — run_id, command, started_at, status, cli_version, directory, event_count, events, and 22 more; every field: wcat commands info runs show

**Example:** `wcat runs show 20261025T090000Z-mail-sync-a81f2c --json`

### `wcat runs path`

the directory holding one run

```sh
wcat runs path <run-id> [options]
```

| Argument | | What it is |
|---|---|---|
| `run-id` | required | an id from `wcat runs list`. |

| Option | What it does |
|---|---|
| `--json` | print JSON. |

**Returns:** run location — path; every field: wcat commands info runs path

**Example:** `wcat runs path 20261025T090000Z-mail-sync-a81f2c`

## Exit codes

Failures use the shared WireCat error contract.

| Code | When |
|---|---|
| `0` | it worked |
| `2` | `validation_error` |
| `3` | `configuration_error` |
| `4` | `authentication_error` |
| `5` | `permission_error` |
| `6` | `not_found` |
| `7` | `confirmation_required` |
| `8` | `rate_limited` |
| `9` | `timeout` |
| `10` | `network_error` |
| `11` | `provider_error` |
| `12` | `provider_unavailable` |
| `13` | `invalid_response` |
| `14` | `outcome_unknown` |
| `15` | `conflict` |
| `130` | `cancelled` |
| `1` | anything else |
