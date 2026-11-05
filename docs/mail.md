# Mail

This page helps you bring your email into Memo, so mail sits beside your notes and messages in
search, in a person's context and in the sources your agent reads. The way in is the separate
[mail](https://github.com/WireCatLabs/mail-cli) program: `mail` copies your mailbox into the shared WireCat store, and
Memo searches and shows what is there. Memo never changes your mailbox or sends mail.

<a id="import-mail" />

## Bring mail in with mail

Install `mail` and add your mailbox. Its [documentation](https://github.com/WireCatLabs/mail-cli/blob/main/docs/index.md)
lists the steps for each provider, such as the IMAP setting and the app password (a separate password for one program,
which you can revoke at any time).

```sh
npm install -g @wirecat/mail-cli
mail ya session start --address me@example.com
mail ya sync
mail ya status
```

`ya` is a profile name you choose for one mailbox. `session start` signs in, `sync` reads the last 30 days into the
shared store, and `status` shows how far a large mailbox is. Run `mail ya sync` again to bring in new mail. Memo needs
no setting for this mail: it reads the same store.

`mail` keeps the text and the headers of each message, not the attachments. See its
[documentation](https://github.com/WireCatLabs/mail-cli/blob/main/docs/index.md) for what it keeps and how to keep a
mailbox up to date. Everything about the mailbox itself is `mail`'s too:

- `mail <profile> account inspect` groups a mailbox's mail by sender and list with a spam score, before a big first
  sync; `--domain-age` asks when each sender's domain was registered.
- `mail <profile> messages import <file.mbox>` adds years of old Gmail from a [Google Takeout](https://takeout.google.com/)
  file to the same mailbox, each email once.
- `mail <profile> rules add|list|remove` decide which mail is stored whole, as an envelope or not at all.

`memo sync` and its timer embed the mail `mail` stored for [search by meaning](search.md) when the search model is
on your computer; `--no-embed` skips it.

## Search and read mail in Memo

```sh
memo search mail 'invoice'
memo messages show <ref>
```

`<ref>` is the `ref` of a search hit. `memo search all` finds this mail together with your notes and messages. More
search words are in [Find your mail](#find-your-mail) and [Search](search.md#search-mail).

## An agent that reads new mail and proposes tasks

memo can run an agent after each sync that stored new mail. It reads only mail past its own mark, and only stages
proposals: tasks, closes and updates of open tasks, facts, memories, links and new contacts. Nothing is created until
you confirm it in `memo review`. The agent never sends, drafts, moves or deletes mail, and never decides for you.

Turn it on once:

```sh
memo schedule agent mail-triage claude 'Run memo skill show mail-triage and follow it.' --every 5m --on-new-mail mail-triage --max-cost 1 --max-cost-per-day 5
```

Every 5 minutes the schedule checks the store. With no mail past the `mail-triage` mark it does nothing: no model
call, no notification. It waits until 10 emails wait for it, or the oldest has waited 30 minutes, so a day of
scattered mail costs a few runs, not dozens. Bulk mail, suspicious senders and other mail it would skip do not count.
Once the day's runs have cost 5 US dollars, no run starts until the next day; `memo schedule list` shows the day's
spend and why it skipped. Change these per schedule with `--mail-wait 1h`, `--mail-batch 20` and
`--max-cost-per-day 2`, or for every schedule in the config file: `schedule_mail_wait`, `schedule_mail_batch` and
`schedule_max_cost_per_day` (`memo config show` lists them; a flag wins over the file). Otherwise it starts `claude`
on Sonnet with only `memo` allowed, under `MEMO_READ_ONLY`, and without your MCP servers, skills, settings and
CLAUDE.md: a run starts on about 4,700 tokens instead of 38,000. `--model opus` picks another model for one schedule,
and `schedule_model_claude` in the config file for every new one; `schedule_lean_start: false` loads your setup. Both
apply when the schedule is added, so add it again after changing them. That run may move only the `mail-triage` mark.
The prompt it follows is `memo skill show mail-triage`. Its first run starts from now; older mail is not read.

What it does, per mailbox:

1. `memo mail review --holder mail-triage --source email:<account> --json` gives the mail past its mark. Bulk mail,
   lists, envelope rules, drafts, suspicious senders and mail not yet stored whole are left out, and counted. Each
   email has the `fingerprint` a finding cites it by, and says whether its sender is new.
2. It keeps the emails that ask something of you, carry a date, or answer a thread with an open task.
3. It reads context for those only, through links the store already has: the thread, `memo context` of the sender.
4. It stages one batch: `memo mail findings add - --source email:<account>`. New senders always get a link to a
   known person or a new contact proposal.
5. Then, and only then, `memo messages acknowledge --holder mail-triage --cursor <cursor> --source email:<account>`
   moves its mark. A run that fails before this reads the same mail again; the same batch is not staged twice.

| Command | What it does |
|---|---|
| `memo mail review --source email:<account>` | Threads with new mail, `--unanswered` what you owe, `--waiting` what waits for an answer; `--holder <name>` reads past that holder's mark |
| `memo messages acknowledge --holder <name> --cursor <cursor>` | Moves a holder's mark to the cursor its review gave |
| `memo mail findings add <file>` | Stages one mailbox's findings for you |
| `memo mail findings list status:proposed` | Batches waiting for you |
| `memo mail findings show <id>` | One batch with its evidence |

`MEMO_READ_ONLY` refuses every store change except `mail findings add` and `messages acknowledge`. You decide in
`memo review`: `memo review show <id>`, then `memo review confirm <id>/<finding>` or `memo review reject <id>`. No
agent can confirm or reject mail findings. `memo review status` shows each mailbox's mark and what waits.

Email bodies go to the model provider of the agent you schedule. Stop it with `memo schedule remove mail-triage`.

## Commands that moved to mail

Memo no longer reads a mailbox itself. Its old mail commands change nothing and name their replacement.
`<profile>` is the `mail` profile that holds the address; `mail session list` lists them.

| Old Memo command | Run instead |
|---|---|
| `memo mail add <account> <address>` | `mail <profile> session start --address <address>`, then `mail <profile> sync` |
| `memo mail check <account>` | `mail <profile> account check` |
| `memo mail inspect <account>` | `mail <profile> account inspect`, same options, no account |
| `memo mail rules list\|add\|remove\|apply\|export\|import <account> …` | `mail <profile> rules list\|add\|remove\|apply\|export\|import …`, same options, no account |
| `memo mail delete <account>` | `mail <profile> messages delete --rules` (a preview; `--yes` moves the mail) |
| `memo mail restore <account> --run <id>` | `mail <profile> messages restore --run <id>`; Memo's run ids work there |
| `memo mail runs list <account>` | `mail doctor`, which names the runs that stopped part way or whose Gmail Trash empties soon; every run is a file `<id>.jsonl` in Memo's state folder under `mail-trash/<profile>/` |

A config that still has Memo's old `mail` settings loads, and nothing reads them: `memo doctor` names the mailboxes
they list, for `mail` to sync, and `memo config unset mail` removes them. The mail Memo imported stays in the store
and is still found; `mail <profile> sync` of the same address goes on from it.

## Find your mail

```sh
memo search mail 'invoice'
memo search mail 'from:kai subject:budget'
memo search mail 'mailbox:starred' --source email:you@example.com
memo search mail 'trip NOT mailbox:bulk'
memo search all 'budget'
```

Mail sent to many — newsletters, notices, mailing lists, anything with a List-Id, List-Unsubscribe or
`Precedence: bulk` header — is in the mailbox `bulk` (`memo:bulk`), so `NOT mailbox:bulk` leaves it out when it
crowds a search. It is not left out by default: bills, bookings and other notices from companies carry the same
headers. `--source email:<address>` names one mailbox; `--source email:a@example.com,email:b@example.com` searches
both.

`mail <profile> sync` also scores every sender from the mail already stored, at most once a day, the same way
`mail <profile> account inspect` scores a group. A hit from a scored sender carries `sender_score` in `--json`, with the score
and its signals. Mail from a sender whose signs of fraud add up to 3 or more comes after the rest of the page in
`memo search mail` and `memo search all`, and its `sender_score` says `demoted: true`; nothing is left out. Your own
are never moved: a domain you wrote to anyone at, your mailbox's domain, and a sender a protect rule keeps.
`--plain-order` keeps such mail where the words put it, to find it:

```sh
memo search mail 'invoice' --plain-order
```

Gmail labels such as Inbox, Important, Starred and your own labels become mail folders, so
`mailbox:important` finds them. See [Search](search.md#search-mail).

`memo messages show <msg:email/…>` prints one email whole. Mail that older Memo versions imported keeps the text
Memo read from each attachment, such as a bill's PDF: the first 4,000 characters of each, or all of it with `--full`.
Mail synced by `mail` has no attachment text.

With `--before-n` and `--after-n` it also prints that many earlier and later emails of the same thread, oldest
first, with the email you asked for marked `anchor: true`. The thread is the one the mailbox gives (Gmail's own
thread, or for other mailboxes the first email its `References` header names). An email alone in its thread, such
as most newsletters, comes back alone.

## When mail is deleted

When you delete an email in your mailbox, its text leaves the store on the next `mail <profile> sync`, and Memo no
longer finds it.

## Mail and people

To include a person's email in [their context](people.md#everything-about-a-person), link the
address to them in tg or max: `tg personal contacts link 'Kai Sample' email:kai@example.com`.

## Phones and links in mail

Memo finds phones, e-mail addresses, links, names and street addresses in every stored email, note and document. List them and say
what they are:

```sh
memo mentions list kind:phone --source email:personal
memo mentions show 40 --source email:personal
memo mentions confirm 40 person:7 --source email:personal
memo mentions reject 41 --source email:personal
```

`--source` names what to read, the same way in every WireCat tool: `email:personal` one mailbox, `email:personal,email:work`
several, `mail` every mailbox (the answer lists which), `notes` memo's notes, `documents` imported documents, and
`group:<name>` a saved group. `show` lists the senders who may own a phone, but links nothing until you confirm it.

Next: [keep mail and notes up to date on a timer](archive.md).
