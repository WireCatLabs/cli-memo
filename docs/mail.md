# Mail

This page helps you bring your email into Memo, so mail sits beside your notes and messages in
search, in a person's context and in the sources your agent reads. The way in is the separate
[mail](https://github.com/WireCatLabs/mail-cli) program: `mail` copies your mailbox into the shared WireCat store, and
Memo searches and shows what is there. Memo never changes your mailbox or sends mail.

Memo can still import mail through Himalaya. That older path works for now and will be removed in a later version;
it is described in [Older import through Himalaya](#older-import-through-himalaya-legacy).

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
mailbox up to date.

## Search and read mail in Memo

```sh
memo search mail 'invoice'
memo messages show <ref>
```

`<ref>` is the `ref` of a search hit. `memo search all` finds this mail together with your notes and messages. More
search words are in [Find your mail](#find-your-mail) and [Search](search.md#search-mail).

## The memo mail commands

`memo mail inspect` stays. It takes an account from Memo's `mail.accounts` list, which `memo mail add` fills from a
Himalaya account, so it does not work for an account that only `mail` added.

When `mail` syncs an account that is also in `mail.accounts`, set `"import": false` on it, for example
`{ "name": "personal", "address": "you@gmail.com", "import": false }`. `memo sync` and the timer then skip its
Himalaya import, and `memo sync --source email:personal` says the import is handed to `mail`. `memo mail inspect`
keeps working, and each sync still repairs HTML text, scores senders and embeds the mail already in the store. Only the
header backfill needs Himalaya, so it stops.

| Command | What it needs | What it does |
|---|---|---|
| `memo mail inspect <account>` | A Himalaya account in Memo's config | Reads headers from the mailbox and groups mail by sender ([Choose what to import](#choose-what-to-import)) |

Rules, Gmail cleanup and restore are commands of `mail`. The old Memo commands only name their replacement and
change nothing. `<profile>` is the `mail` profile that holds the address; `mail session status` lists them.

| Old Memo command | Run instead |
|---|---|
| `memo mail rules list\|add\|remove\|apply\|export\|import <account> …` | `mail <profile> rules list\|add\|remove\|apply\|export\|import …`, same options, no account |
| `memo mail delete <account>` | `mail <profile> messages delete --rules` (a preview; `--yes` moves the mail) |
| `memo mail restore <account> --run <id>` | `mail <profile> messages restore --run <id>`; Memo's run ids work there |
| `memo mail runs list <account>` | `mail doctor`, which names the runs that stopped part way or whose Gmail Trash empties soon; every run is a file `<id>.jsonl` in Memo's state folder under `mail-trash/<profile>/` |

## Older import through Himalaya (legacy)

This import will be removed in a later version. Use [mail](#bring-mail-in-with-mail) for new accounts. Memo reads
mail here through [Himalaya](https://github.com/pimalaya/himalaya), a mail program you set up first. The import reads
your mailbox without changing it or marking mail as read.

### Before you start

Set up your mail account in Himalaya. For Gmail, use an IMAP account with a Gmail
[app password](https://myaccount.google.com/apppasswords). Memo works with Himalaya 2.x (`himalaya --version`).

Himalaya reads its accounts from `~/.config/himalaya/config.toml` (`HIMALAYA_CONFIG` or `-c` points it
elsewhere). A Gmail account named `work` looks like this; the password comes from a command, here the Linux
keyring, so it is never written in the file:

```toml
[accounts.work]
email = "you@example.com"
imap.server = "imaps://imap.gmail.com:993"
imap.sasl.plain.username = "you@example.com"
imap.sasl.plain.password.command = "secret-tool lookup service himalaya account work"
```

`himalaya account list` shows the accounts it read. Check that Himalaya lists your mail before you continue.

```text prompt
Help me set up Himalaya for my Gmail account with an app password, and check that it lists my inbox.
Then add the account to Memo's config and import the last 30 days of mail.
```

### Add the account to Memo

Give the Himalaya account's name and its configured email explicitly:

```sh
memo mail add work you@example.com
memo mail check work
```

`add` asks Himalaya to list its accounts, matches the selected account's `email` (or `from`) in its TOML file,
then adds it to Memo's [configuration](configuration.md#mail). It never chooses Himalaya's default account.
A missing name lists the available names and changes nothing. A mismatched address or an existing name/email
is refused. Set `email` in the selected Himalaya account first if it has none. `check` repeats the local
configuration checks without changing Memo or connecting to a mailbox; it is not a login test.

For another IMAP provider, select its kind and folders:

```sh
memo mail add home me@example.org --kind imap --folder INBOX --folder Archive
```

Gmail is the default kind. These commands support one Himalaya config file, selected by `HIMALAYA_CONFIG`
or its normal location. Keep the same environment for imports. A merged list of config files needs manual
configuration. A Google Takeout `mbox` still uses the `mode: "mbox"` configuration described below.

### Sync mail

```sh
memo sync --source email:work --since-time 2026-09-01
```

`work` is the account's `name` from the config, or use its address; separate several with commas. Without `--source`, Memo reads every account in the
config and names each one in its report; it lists the accounts it knows when a name is wrong.

- Without `--since-time`, Memo reads the last 30 days. It takes a date, an ISO 8601 time or `30d` ago.
- Each run reads up to 200 new emails per account (`--limit` changes this). Run it again and it continues
  where it stopped: it lists only the mail no earlier run finished, so a large mailbox is not listed again.
- A whole listing marks mail deleted at the source and refreshes labels and read state. It runs at least once a
  day, after any change to your rules, and with `--rescan`; a window under 5,000 emails is listed whole every run.
- `memo sync` and the timer read every account in the config.

To see how far a mailbox that `mail` synced is, run `mail <profile> status`. The Himalaya import has no
status command now.

## Choose what to import

This works on an account of the Himalaya import.

A large mailbox is mostly newsletters and notifications. Look before a first large import:

```sh
memo mail inspect work
```

It reads headers only (about 1 KB an email) and groups mail by sender and mailing list: how many
emails, how much space, how much is unread or bulk mail, the years, and whether you ever wrote to the
sender. It suggests `skip` for groups of at least 20 emails, at least 80% bulk mail, that you never wrote to.

Each group also gets a **score** for how much it looks like spam, a scam or a robot, with the signals that
make it up. Gmail already filters most spam, so a high score usually means a spoofed sender or a robot that no
rule covers yet:

| Signal | Adds | From |
|---|---:|---|
| `spam_folder` | 4 | Most of the group's mail is in Gmail's Spam |
| `dmarc_fail` | 3 | Gmail's DMARC check failed (`Authentication-Results: mx.google.com`), with no valid DKIM signature, from a sender that never passes it, on mail from 2022 on; counts only beside another sign of fraud |
| `brand_spoof` | 3 | A brand in the display name, such as PayPal or Apple, sent from another domain |
| `young_domain` | 5 | The sender's domain was under 180 days old when the first email came |
| `reply_to_elsewhere` | 1 | Replies go to another domain than the sender's |
| `never_opened` | 2 | You opened none of the group's mail |
| `dkim_not_passed` | 2 | Gmail's DKIM check did not pass on most of the group's mail |
| `disposable_domain` | 2 | A throwaway-mail domain |
| `bulk_never_replied` | 1 | At least 80% bulk mail, and you never wrote to the sender |
| `replied` | −5 | You wrote to the sender |

`brand_spoof`, `young_domain`, `disposable_domain` and `dmarc_fail` point at a forged or fraudulent sender; a
failed DMARC check alone more often means a real sender with a broken setup or mail that came through a forward
or a list. The rest are common on real bulk mail, bills and bookings included: a score of 3 from `never_opened`
and `bulk_never_replied` alone is a newsletter you ignore, not a scam, and many companies answer from a help-desk
domain. A platform that passes on other names is not a spoof: "Google via LinkedIn" from LinkedIn, a Coursera
course or a Quora space named after a company. DMARC failures before 2022 are left out: many real senders failed
the check then.

`young_domain` needs each domain's registration date. Each sync that scores senders, at most once a day, asks for
the dates it does not have yet, for senders you never wrote to and heard from in the last two years: an older
sender's domain may have lapsed or changed hands. `memo mail inspect work --domain-age` asks for the groups it
shows. A domain registered again after an email came is not young for that email.

memo answers creates each domain's own registry through RDAP, using IANA's list of registries, one domain a second, and keeps
the answer on this computer for good. **Each question tells that registry the domain's name**, so it learns that
someone looks at mail from it. Big mailbox providers such as gmail.com are never asked. Most country domains, such
as .ru, .de, .es and .io, have no RDAP: they stay unknown and add nothing.

You decide with rules, which `mail <profile> rules add` writes into the store (see the
[mail documentation](https://github.com/WireCatLabs/mail-cli/blob/main/docs/index.md)). `memo sync` reads the
account's rules from the store on each Himalaya import:

- `skip`: `memo sync` never reads or stores the email, and counts it as skipped.
- `envelope`: `memo sync` stores the sender, date, size, labels and the Gmail id, but not the text or
  attachments. The subject is kept in the email's metadata, so the email is never a search hit. An envelope costs
  no more from Gmail than a skip: its fields come with the listing.
- `keep`: imports the email even when a skip or envelope rule matches it.
- A tag on a rule puts a memo tag on every email the rule matches that a sync stores or records. A tag the store
  refuses as too close to an existing label is put on as that label; one refused with nothing to reuse is skipped,
  and the mail is still stored.
- A protected rule wins over all others and always stores in full.

A keep wins over an envelope, and an envelope wins over a skip. When you remove an envelope rule, or change it
to keep, the next sync reads those emails in full. Mail stored in full before a rule stays as it is. Rules that
judge a sender by its mail (a score or a kind) judge it from the mail in the same listing, so a sync that lists
only new mail judges the sender from that mail.

Older settings kept rules in `config.json`. The first `memo sync` that reads rules moves them into the store,
checks they all arrived, and only then drops them from the config. The old config stays beside it as
`config.json.<time>.before-rules-in-store`, readable only by you, and memo says so on stderr once. A keep rule
whose reason says "never remove" becomes protected.

## Clean up Gmail

Memo no longer changes a mailbox. Moving envelope mail to Gmail's Trash, and bringing a run back, are commands of
`mail`: `mail <profile> messages delete --rules` previews and `--yes` moves, `mail <profile> messages restore
--run <id>` undoes a run, and `mail doctor` names the runs that stopped part way or whose Gmail Trash empties soon.
`mail` reads the restore logs older Memo versions wrote, so their run ids still work: each is a file `<id>.jsonl` in
Memo's state folder under `mail-trash/<profile>/` (`memo doctor` shows the folder).

## Old mail from Google Takeout

Gmail limits how much IMAP can download a day, so years of old mail are faster from a
[Google Takeout](https://takeout.google.com/) export of Mail. Add the file as a second account with the
same address, so its emails and the Gmail account's are one set:

```json
{ "name": "archive", "address": "you@example.com", "mode": "mbox", "path": "~/Takeout/Mail/All mail Including Spam and Trash.mbox" }
```

```sh
memo sync --source email:archive --since-time 2000-01-01 --limit 5000
```

The file is only read when you name the account. An incomplete import scans it again; a completed
snapshot is skipped until its size or modification time changes. `--rescan` forces another scan.
It only adds mail: nothing
missing from the file is deleted from the store, and Spam and Trash are left out.

## Find your mail

```sh
memo search mail 'invoice'
memo search mail 'from:kai subject:budget'
memo search mail 'mailbox:starred' --source email:work
memo search mail 'trip NOT mailbox:bulk'
memo search all 'budget'
```

Mail sent to many — newsletters, notices, mailing lists, anything with a List-Id, List-Unsubscribe or
`Precedence: bulk` header — is in the mailbox `bulk` (`memo:bulk`), so `NOT mailbox:bulk` leaves it out when it
crowds a search. It is not left out by default: bills, bookings and other notices from companies carry the same
headers. memo marks such mail when it reads its headers, which it does for an account that has rules; a full
listing, at least daily, marks mail stored earlier. `--source email:<account>` takes the account's name or its
address; `--source email:work,email:personal` searches both.

Each sync also scores every sender from the mail already stored, at most once a day, the same way
`memo mail inspect` scores a group. A hit from a scored sender carries `sender_score` in `--json`, with the score
and its signals. Mail from a sender whose signs of fraud add up to 3 or more comes after the rest of the page in
`memo search mail` and `memo search all`, and its `sender_score` says `demoted: true`; nothing is left out. Your own
are never moved: a domain you wrote to anyone at, your mailbox's domain, and a sender a protect rule keeps.
`--plain-order` keeps such mail where the words put it, to find it:

```sh
memo search mail 'invoice' --plain-order
```

Gmail labels such as Inbox, Important, Starred and your own labels become mail folders, so
`mailbox:important` finds them. See [Search](search.md#search-mail).

`memo messages show <msg:email/…>` prints one email whole. For mail from the Himalaya import it adds the text memo
read from each attachment, such as a bill's PDF: the first 4,000 characters of each, or all of it with `--full`. An
attachment with no text says why, for example `needs-agent` for a scanned page. Mail synced by `mail` has no
attachment text.

## What is kept

This list is for the Himalaya import. Mail that `mail` synced keeps its text and headers only: no attachments, so
no attachment text.

- The sender, the recipients (To, CC and BCC), the subject, the date and the text of each email.
- Whether an email is read or starred, as your mailbox shows it.
- For the Himalaya import: the text of readable attachments, searched with the email ([files Memo can read](notes.md#files-memo-can-read)).
  The PDF and Word readers come with Memo. If an attachment was left unread because its reader was not installed
  (`engine-missing`, from an older Memo or a broken install), `memo sync --source email:work --retry-attachments`
  reads again, by their Gmail id, only those emails, up to `--limit` of them; it lists nothing, so it is quick, and
  run again it continues with the rest.
- Up to 1,000,000 characters of each email and 200,000 of each attachment
  ([change the limits](configuration.md#mail)).

Mail is prepared for search by meaning when the search model is on your computer; `--no-embed`
skips this.

## When mail is deleted

When you delete an email in your mailbox, its text leaves the local store on the next Himalaya import. Mail
moved to Spam counts as deleted. To protect you from mistakes:

- the first two days of the period are not checked for deletions;
- if a run finds an unusually large part of your mail missing, it deletes nothing and tells you.

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
