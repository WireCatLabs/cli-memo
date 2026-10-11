# Mail

This page is for bringing your email into memo, so mail sits beside your notes and messages in search,
evidence for an agent and a person's context. memo reads mail through
[Himalaya](https://github.com/pimalaya/himalaya), a command-line mail client you set up first. The
mailbox is opened read-only: nothing is sent, moved or marked read.

## Set up the account

Set the account up in Himalaya first (an IMAP account with a Gmail
[app password](https://myaccount.google.com/apppasswords); `bin/mail-password <account>` stores it in the
keyring; the script is in this repository, not in the npm package), then name it in `~/.config/cli-memo/config.json`:

```json
{ "mail": { "accounts": [{ "name": "work", "address": "you@example.com" }] } }
```

`mail.maxBodyChars` (default 1,000,000) and `mail.maxAttachmentChars` (default 200,000) set how many characters
of a body and of one attachment's text are kept.

Gmail remains the default. For another IMAP provider, configure an account with `mode: "imap"`
and `folders: ["INBOX", "Archive"]` in `mail.accounts`. Message-ID and reference headers preserve
message/thread identities across folder moves and UID resets. Mail without Message-ID uses an explicit
UIDVALIDITY/folder/UID fallback, which can change after a move/reset. Configured folders are listed
completely before deletion checks; a changed folder scope skips deletion for that run.

## Import

```sh
memo mail work import --since 2026-09-01      # work: the account's name in mail.accounts
memo search mail 'budget' --account you@example.com   # one mail account; every one without --account
```

`<account>` is required, even with one account configured: memo never picks one for you, and names the
configured accounts when it is missing or unknown. `memo import` and the timer import every account in
`mail.accounts`. A mail import and `memo import` share one lock, so they never run at the same time.

Reads a Gmail account's All Mail through [Himalaya](https://github.com/pimalaya/himalaya) into the
shared store's mail tables: one thread per Gmail thread, each folder a mailbox, the mailbox address as
the account, senders and recipients as people. Gmail labels (Inbox, Important, Starred, your own) become
label mailboxes, so `search mail mailbox:important` finds them. `search mail`, `search all`, `ask`, person context and tags
see it. Mail that older versions of memo saved as messages stays searchable; an email imported again is listed
once.

- Read only: the mailbox is opened read-only, nothing is sent, and no mail is marked read.
- Run it again any time: what is stored is skipped; `--max` (default 200) bounds the new mails read
  per run, and the next run continues.
- A mail deleted at the source loses its text in the store. The first two days of the window are left
  alone, and a run that finds an unusually large share missing deletes nothing and says so. Mail moved
  to Spam leaves All Mail and counts as deleted.

## What is kept

Imports report the proven date/folder window. No thread is called globally complete on the basis of one
window. To, CC and BCC are kept, and read and starred stay as the mailbox shows them; a flagged IMAP
message carries the `Starred` label. A readable attachment's text is kept with its email and searched with it
(`content:`, `filename:`); extraction failures are reported. After installing an optional engine, use
`memo mail <account> import --retry-attachments` to reread a bounded batch of stored mail. `memo search mail` matches
words; mail is embedded on import, so `tg search conversations` finds it by meaning. `--no-embed`, or
`embed: false` on the account, skips the embedding.

To make a mail address part of a person, link it in messaging — see [People](people.md#people).

Next: [keep mail and notes current on a timer](archive.md).
