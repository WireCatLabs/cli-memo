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

`work` is the account's `name` from the config. Without `--account`, Memo reads every account in the
config and names each one in its report; it lists the accounts it knows when a name is wrong.

- Without `--since-time`, Memo reads the last 30 days. It takes a date, an ISO 8601 time or `30d` ago.
- Each run reads up to 200 new emails per account (`--limit` changes this). Run it again and it continues
  where it stopped; emails already stored are skipped.
- `memo sync` and the timer read every account in the config.

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
