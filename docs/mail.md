# Mail

This page helps you bring your email into Memo, so mail sits beside your notes and messages in
search, in a person's context and in the sources your agent reads. Memo reads mail through
[Himalaya](https://github.com/pimalaya/himalaya), a mail program you set up first. Imports read your mailbox without changing it or marking mail as read.
[Clean up Gmail](#clean-up-gmail) separately moves selected mail to Trash, or restores it, only with `--yes`.
Memo never sends mail.

## Before you start

Set up your mail account in Himalaya. For Gmail, use an IMAP account with a Gmail
[app password](https://myaccount.google.com/apppasswords) (a separate password for one program,
which you can revoke at any time). Check that Himalaya lists your mail before you continue.

```text prompt
Help me set up Himalaya for my Gmail account with an app password, and check that it lists my inbox.
Then add the account to Memo's config and import the last 30 days of mail.
```

## Add the account to Memo

Name the account in Memo's [config file](configuration.md#mail), `~/.config/cli-memo/config.json`.
`name` is the account's name in Himalaya; `address` is your email address:

```json
{ "mail": { "accounts": [{ "name": "work", "address": "you@example.com" }] } }
```

Gmail is the default. For another provider, add `"mode": "imap"` and the folders to read:

```json
{ "mail": { "accounts": [{ "name": "home", "address": "me@example.org", "mode": "imap", "folders": ["INBOX", "Archive"] }] } }
```

## Sync mail

```sh
memo sync --account work --since-time 2026-09-01
```

`work` is the account's `name` from the config, or use its address. Without `--account`, Memo reads every account in the
config and names each one in its report; it lists the accounts it knows when a name is wrong.

- Without `--since-time`, Memo reads the last 30 days. It takes a date, an ISO 8601 time or `30d` ago.
- Each run reads up to 200 new emails per account (`--limit` changes this). Run it again and it continues
  where it stopped: it lists only the mail no earlier run finished, so a large mailbox is not listed again.
- A whole listing marks mail deleted at the source and refreshes labels and read state. It runs at least once a
  day, after any change to your rules, and with `--rescan`; a window under 5,000 emails is listed whole every run.
- `memo sync` and the timer read every account in the config.

See how far an import is, without asking the mailbox:

```sh
memo mail status work
```

The first line counts the widest window ever imported, such as everything since 2004, and says "complete" only
when all of it is stored. A narrower later run, like the timer's 30 days, is shown on its own line as the last
run. It never counts as the whole mailbox.

## Choose what to import

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
| `dmarc_fail` | 3 | Gmail's own DMARC check failed when the mail arrived (`Authentication-Results: mx.google.com`), on mail from 2022 on, without a valid DKIM signature, from a sender that never passes it |
| `brand_spoof` | 3 | A brand in the display name, such as PayPal or Apple, sent from another domain; not "Google via LinkedIn" from LinkedIn's own domain, nor Coursera courses or Quora spaces named after a company |
| `young_domain` | 3 | The sender's domain was under 180 days old when the first email came |
| `reply_to_elsewhere` | 2 | Replies go to another domain than the sender's |
| `never_opened` | 2 | You opened none of the group's mail |
| `dkim_not_passed` | 2 | Gmail's DKIM check did not pass on most of the group's mail |
| `disposable_domain` | 2 | A throwaway-mail domain |
| `bulk_never_replied` | 1 | At least 80% bulk mail, and you never wrote to the sender |
| `replied` | −5 | You wrote to the sender |

`young_domain` needs each domain's registration date. memo asks for it only when you add `--domain-age`:

```sh
memo mail inspect work --domain-age
```

It asks the registry of each shown group's sender domain through RDAP, using IANA's list of registries, one
domain a second, and keeps the answer on this computer for good. **Each question tells that registry the
domain's name**, so it learns that someone looks at mail from it. Big mailbox providers such as gmail.com and
senders you wrote to are never asked. Most country domains, such as .ru, .de, .es and .io, have no RDAP:
they stay unknown and add nothing. Without `--domain-age`, only dates already kept are used.

You decide:

```sh
memo mail rules add work --domain shop.example --do envelope --reason 'newsletters'
memo mail rules add work --domain spam.example --do skip
memo mail rules add work --sender orders@shop.example --do keep
memo mail rules list work
```

The basic `--do` actions are listed below; protection and tags follow in the next section:

- `skip`: `memo sync` never reads or stores the email, and counts it as skipped.
- `envelope`: `memo sync` stores the sender, date, size, labels and the Gmail id, but not the text or
  attachments. The subject is kept in the email's metadata, so the email is never a search hit.
  `memo mail rules list` shows how many emails each envelope rule recorded and their size, so you can see
  what a cleanup would remove. An envelope costs no more from Gmail than a skip: its fields come with the
  listing.
- `keep`: imports the email even when a skip or envelope rule matches it.

A keep wins over an envelope, and an envelope wins over a skip. When you remove an envelope rule, or change it
to keep, the next sync reads those emails in full. Mail stored in full before a rule stays as it is.

### More conditions, tags and protection

Besides `--sender`, `--domain` and `--list-id`, a rule can take a `--filter` query and a `--kind`. Every condition
given must hold:

| In `--filter` | Matches mail |
|---|---|
| `from:<address>`, `from:<domain>` | from this one sender, or from this domain and its subdomains |
| `from:<word>` | from a sender whose address or display name contains the word, any case |
| `to:<address>` | sent to this address, in To or Cc |
| `subject:<word>`, or a bare word | with every such word in the subject, any case |
| `older:<n>d` | received more than n days ago |
| `larger:<size>` | bigger than `5MB`, `300KB` or a number of bytes at the source |
| `has:attachment` | sent as `multipart/mixed`, the way mail with attachments is: a guess from the header |
| `label:<name>` | carrying this Gmail label, such as `label:Promotions` or `label:"Two words"` |
| `is:unread` | never opened |
| `is:bulk` | sent to many: List-Id, List-Unsubscribe or `Precedence: bulk` |
| `score:<n>` | from a sender whose score (above) is at least n |

`--do` takes one action and any number of tags, comma-separated: `skip`, `envelope`, `keep` or `protect`, plus
`tag:<name>`.

```sh
memo mail rules add work --filter 'label:Promotions older:365d' --do envelope
memo mail rules add work --domain shop.example --do keep,tag:shopping
memo mail rules add work --domain tax.gov.example --do protect
memo mail rules list work --filter is:protected
```

- **`tag:<name>`** puts a memo tag on every email the rule matches, whichever rule decides the action. A sync
  tags the mail it stores or records; `memo mail rules apply` tags mail stored earlier. A tag the store refuses
  as too close to an existing label is put on as that label, and the rule is updated to it (`tags_reused` in
  `--json`). A tag refused with nothing to reuse is skipped, the mail is still stored, and the rule lists it as
  `tags skipped` (`tags_skipped`). A refused tag never stops the sync.
- **`protect`** keeps the mail whole and out of every cleanup, whatever other rules or kinds say. A protected
  rule wins over all others and always stores in full, so `memo mail rules apply` never cuts its mail and a later
  mailbox cleanup must refuse it. Use it for government, tax and bank mail. `memo mail rules list` shows
  protected rules first, as `PROTECTED`.
- **`score:` and `--kind`** judge a sender by its mail in the same listing: a sync that lists only new mail
  judges the sender from that mail.

### Kinds of mail

`--kind` names a built-in kind of mail, matched by who sends it and how, not by your own senders:

| Kind | Matches |
|---|---|
| `social` | notifications from social networks |
| `newsletters` | mailing lists with List-Id and List-Unsubscribe, and newsletter services |
| `developer` | code hosting, CI, package and error-tracker notifications |
| `shopping` | shops, and what Gmail files under Promotions |
| `alerts` | monitoring and uptime alerts |

`memo mail inspect` ends with how much of your mail each kind would match. Nothing applies until you add a rule:

```sh
memo mail rules add work --kind social --do envelope
```

Mail from someone you wrote to never matches a kind, and any explicit rule wins over a `--kind` rule.

### Gmail filters

A Google Takeout export of Mail holds your Gmail filters in `Mail/User settings/Filters.json`. memo proposes a
rule for each filter it can express:

```sh
memo mail rules import-filters work Filters.json        # shows the proposed rules and the skipped filters
memo mail rules import-filters work Filters.json --yes  # adds them
```

Each Gmail label a filter adds is matched to memo's labels first: the same label in other capitals is reused,
and a close one is suggested in its place; the proposal lists each mapping as `label … → …`.

A filter that skips the inbox, marks read or deletes becomes an envelope rule; one that only adds a label becomes
a keep rule with that label as a tag. A filter naming several senders or recipients (`from:a from:b`,
`from:(a OR b)`) becomes one rule each, since one email cannot come from both. Words in a filter become subject
words: Gmail searched the whole email, memo matches the subject, and the rule's reason says so. A filter that
excludes words or uses a field memo does not match (`list:`, `size:`) is skipped and listed. Takeout's
`{"filter": [{query, labelsToAdd, labelsToRemove}]}`, Gmail's API shape (`criteria` and `action`) and the
settings export's flat properties (`from`, `shouldArchive`, `label`) are all read; a label given only by its Gmail
id is tagged with that id.

Mail stored in full before an envelope rule existed stays whole until you cut it:

```sh
memo mail rules apply work        # says how many emails and how much text each rule would cut
memo mail rules apply work --yes  # cuts them to envelopes
```

It reads the account's headers from the mailbox, as `memo sync` does, because mail stored before memo kept
List-Id lacks it. Each matching email loses its text, attachments and search entries and keeps its sender, date,
size, labels and subject in metadata. Mail only a skip rule matches stays as stored. Nothing changes in the
mailbox, and changing the rule to keep reads the emails in full again on the next sync.

Rules live in the local store, beside the mail they decide, so `memo mail rules list` counts each rule's
emails in one query. Each envelope email remembers the rule that recorded it. To review rules, keep a copy or
move them to another computer:

```sh
memo mail rules export work > rules.json
memo mail rules import work rules.json   # a rule with the same sender, domain or list is replaced
```

Before 0.32.0 rules were kept in `config.json`. The first memo command that reads rules moves them into the
store, checks they all arrived, and only then drops them from the config. The old config stays beside it as
`config.json.<time>.before-rules-in-store`, readable only by you, and memo says so on stderr once. A keep rule
whose reason says "never remove" becomes protected: no cleanup may cut or delete what it matches.

## Clean up Gmail

Envelope mail is junk you chose not to keep the text of. `memo mail trash` moves it to Gmail's Trash, where Gmail
keeps it 30 days before deleting it for good:

```sh
memo mail trash work                  # says what would move, per rule, and what stays and why
memo mail trash work --yes            # a first run moves at most 100, to check by hand in Gmail's Trash
memo mail trash work --yes            # later runs move up to 5,000, oldest first (--limit changes it)
memo mail trash work --yes --since-time 2012-01-01   # only mail from 2012 on; older mail stays for now
memo mail runs work                   # each run: how much moved, and until when it can be restored
memo mail restore work --run <id> --yes   # moves a run back, to the inbox if it was there, with its labels
```

Each email is decided again with today's rules, from what the last sync stored; only the emails about to move are
read from Gmail again, for their labels and stars now, so a run costs Gmail little however big the mailbox is. It stays in Gmail when a protected or keep rule
matches it, you ever replied to its sender, it is starred, important, sent or a draft, it carries a label of yours
that its rule does not add, or it is under 30 days old. `--yes` refuses until a store backup under 8 days old is
recorded: the backup script writes `backups/last.json` next to the store when a copy passes its check. A Google
Takeout `mbox` file of the mailbox is advised, not required, so the full text of what is trashed is kept; the preview and
`memo doctor` say whether one is imported.

Before each batch, every email's Gmail id, labels and flags go to a restore log in memo's state folder
(`mail-trash/<account>/<run>.jsonl`). Moving to Trash takes a message out of All Mail and drops its Inbox label;
Gmail keeps its other labels, and moving it back returns it as it was. A moved email is marked deleted in the store;
the next sync after a restore stores it again under today's rules. A restore brings back every email the log lists
that Trash holds, also from a batch Gmail moved without confirming it. Cleanup never runs from the timer.

## Old mail from Google Takeout

Gmail limits how much IMAP can download a day, so years of old mail are faster from a
[Google Takeout](https://takeout.google.com/) export of Mail. Add the file as a second account with the
same address, so its emails and the Gmail account's are one set:

```json
{ "name": "archive", "address": "you@example.com", "mode": "mbox", "path": "~/Takeout/Mail/All mail Including Spam and Trash.mbox" }
```

```sh
memo sync --account archive --since-time 2000-01-01 --limit 5000
```

The file is only read when you name the account. An incomplete import scans it again; a completed
snapshot is skipped until its size or modification time changes. `--rescan` forces another scan.
It only adds mail: nothing
missing from the file is deleted from the store, and Spam and Trash are left out.

## Find your mail

```sh
memo search mail 'invoice'
memo search mail 'from:kai subject:budget'
memo search mail 'mailbox:starred' --account work
memo search mail 'trip NOT mailbox:bulk'
memo search all 'budget'
```

Mail sent to many — newsletters, notices, mailing lists, anything with a List-Id, List-Unsubscribe or
`Precedence: bulk` header — is in the mailbox `bulk` (`memo:bulk`), so `NOT mailbox:bulk` leaves it out when it
crowds a search. It is not left out by default: bills, bookings and other notices from companies carry the same
headers. memo marks such mail when it reads its headers, which it does for an account that has rules; a full
listing, at least daily, marks mail stored earlier. `--account` takes the account's name or its address.

Each sync also scores every sender from the mail already stored, at most once a day, the same way
`memo mail inspect` scores a group. A hit from a scored sender carries `sender_score` in `--json`, with the score
and its signals. It does not change the order of results yet: it is there to check before anything is ranked by
it.

Gmail labels such as Inbox, Important, Starred and your own labels become mail folders, so
`mailbox:important` finds them. See [Search](search.md#search-mail).

`memo messages show <msg:email/…>` prints one email whole, with the text memo read from each attachment, such as
a bill's PDF: the first 4,000 characters of each, or all of it with `--full`. An attachment with no text says why,
for example `needs-agent` for a scanned page.

## What is kept

- The sender, the recipients (To, CC and BCC), the subject, the date and the text of each email.
- Whether an email is read or starred, as your mailbox shows it.
- The text of readable attachments, searched with the email. PDF and Word attachments need the
  [optional readers](notes.md#files-memo-can-read). After you install them, run
  `memo sync --account work --retry-attachments` to read attachments that were skipped. It reads again, by
  their Gmail id, only the emails whose attachment a missing reader left unread, up to `--limit` of them; it lists
  nothing, so it is quick, and run again it continues with the rest.
- Up to 1,000,000 characters of each email and 200,000 of each attachment
  ([change the limits](configuration.md#mail)).

Mail is prepared for search by meaning when the search model is on your computer; `--no-embed`
skips this.

## When mail is deleted

When you delete an email in your mailbox, its text leaves the local store on the next import. Mail
moved to Spam counts as deleted. To protect you from mistakes:

- the first two days of the period are not checked for deletions;
- if a run finds an unusually large part of your mail missing, it deletes nothing and tells you.

## Mail and people

To include a person's email in [their context](people.md#everything-about-a-person), link the
address to them in tg or max: `tg contacts link 'Kai Sample' email:kai@example.com`.

## Phones and links in mail

Memo finds phones, e-mail addresses, links, names and street addresses in every stored email, note and document. List them and say
what they are:

```sh
memo mentions list email kind:phone --account personal
memo mentions show 40 --account personal
memo mentions confirm 40 person:7 --account personal
memo mentions reject 41 --account personal
```

Mail is read only from the accounts you name with `--account`. `show` lists the senders who may own a phone, but
links nothing until you confirm it. `memo mentions list note` and `memo mentions list document` work the same way
without `--account`.

Next: [keep mail and notes up to date on a timer](archive.md).
