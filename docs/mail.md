# Mail

This page helps you bring your email into Memo, so mail sits beside your notes and messages in
search, in a person's context and in the sources your agent reads. Memo reads mail through
[Himalaya](https://github.com/pimalaya/himalaya), a mail program you set up first. Your mailbox is
opened read-only: Memo never sends, moves or deletes mail, and does not mark it as read.

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

## Choose what to import

A large mailbox is mostly newsletters and notifications. Look before a first large import:

```sh
memo mail probe work
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
| `dmarc_fail` | 3 | Gmail's own DMARC check failed when the mail arrived (`Authentication-Results: mx.google.com`) |
| `brand_spoof` | 3 | A brand in the display name, such as PayPal or Apple, sent from another domain |
| `young_domain` | 3 | The sender's domain was under 180 days old when the first email came |
| `reply_to_elsewhere` | 2 | Replies go to another domain than the sender's |
| `disposable_domain` | 2 | A throwaway-mail domain |
| `bulk_never_replied` | 1 | At least 80% bulk mail, and you never wrote to the sender |
| `replied` | −5 | You wrote to the sender |

`young_domain` needs each domain's registration date. memo asks for it only when you add `--domain-age`:

```sh
memo mail probe work --domain-age
```

It asks the registry of each shown group's sender domain through RDAP, using IANA's list of registries, one
domain a second, and keeps the answer on this computer for good. **Each question tells that registry the
domain's name**, so it learns that someone looks at mail from it. Big mailbox providers such as gmail.com and
senders you wrote to are never asked. Most country domains, such as .ru, .de, .es and .io, have no RDAP:
they stay unknown and add nothing. Without `--domain-age`, only dates already kept are used.

You decide:

```sh
memo mail rules add work --domain shop.example --envelope --reason 'newsletters'
memo mail rules add work --domain spam.example --skip
memo mail rules add work --from orders@shop.example --keep
memo mail rules list work
```

A rule does one of three things:

- `--skip`: `memo sync` never reads or stores the email, and counts it as skipped.
- `--envelope`: `memo sync` stores the sender, date, size, labels and the Gmail id, but not the text or
  attachments. The subject is kept in the email's metadata, so the email is never a search hit.
  `memo mail rules list` shows how many emails each envelope rule recorded and their size, so you can see
  what a cleanup would remove. An envelope costs no more from Gmail than a skip: its fields come with the
  listing.
- `--keep`: imports the email even when a skip or envelope rule matches it.

A keep wins over an envelope, and an envelope wins over a skip. When you remove an envelope rule, or change it
to keep, the next sync reads those emails in full. Mail stored in full before a rule stays as it is.

Mail stored in full before an envelope rule existed stays whole until you cut it:

```sh
memo mail rules apply work        # says how many emails and how much text each rule would cut
memo mail rules apply work --yes  # cuts them to envelopes
```

It reads the account's headers from the mailbox, as `memo sync` does, because mail stored before memo kept
List-Id lacks it. Each matching email loses its text, attachments and search entries and keeps its sender, date,
size, labels and subject in metadata. Mail only a skip rule matches stays as stored. Nothing changes in the
mailbox, and changing the rule to keep reads the emails in full again on the next sync.

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

The file is only read when you name the account, and each run reads all of it. It only adds mail: nothing
missing from the file is deleted from the store, and Spam and Trash are left out.

## Find your mail

```sh
memo search mail 'invoice'
memo search mail 'from:kai subject:budget'
memo search mail 'mailbox:starred' --account you@example.com
memo search all 'budget'
```

Gmail labels such as Inbox, Important, Starred and your own labels become mail folders, so
`mailbox:important` finds them. See [Search](search.md#search-mail).

## What is kept

- The sender, the recipients (To, CC and BCC), the subject, the date and the text of each email.
- Whether an email is read or starred, as your mailbox shows it.
- The text of readable attachments, searched with the email. PDF and Word attachments need the
  [optional readers](notes.md#files-memo-can-read). After you install them, run
  `memo sync --account work --retry-attachments` to read attachments that were skipped.
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

Next: [keep mail and notes up to date on a timer](archive.md).
