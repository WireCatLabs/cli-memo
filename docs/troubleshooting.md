# Troubleshooting

This page helps when Memo does not do what you expected. Find what the screen says or what you
noticed, then follow the steps. To ask your agent for help, give it the full message Memo printed.

## `memo: command not found`

Memo is not installed, or the terminal was opened before you installed it. Close the terminal, open a
new one and run `memo --help`. If it still fails, install Memo again:
`npm install -g @wirecat/cli-memo` ([installation](installation.md)).

## A note or file does not appear in search

1. Run `memo sync --notes` and read the report. It lists files it could not read and why.
2. Check that the file's folder is in `memo folders list`, and that the file is not skipped by
   `notes.ignore` in the [config file](configuration.md#notes).
3. Search for one word you know is in the file. A search finds results that contain **every** word,
   so a long sentence often finds nothing; use two or three key words.
4. PDF and Word files need the optional readers: `npm install -g unpdf mammoth`, then import again.
   Scanned PDFs have no text to read.

## "Searched by words only"

The search model for search by meaning is not on your computer. Memo still finds every note that
contains your words. To also search by meaning, download the model with tg or max, then import:

```sh
tg models text download e5-small    # or: max models text download e5-small
memo sync
```

## "nobody by that name yet"

A note links to a name, such as `[[Kai Sample]]`, but nobody with that name is in the local store
yet. The link starts working once the person's chats are downloaded with tg or max. If two people
share the name, link the right one with a reference such as `[Kai](person:7)`.

## A folder is refused by import

Every folder needs an ID from the local store. Add it with `memo folders add /path/to/folder`. If the
folder was added on another computer, connect it instead: `memo folders list` shows its ID, and
`memo folders attach ID /path/to/folder` connects it ([details](notes.md#use-the-same-notes-on-another-computer)).

## An import deleted nothing and printed a warning

The import found that most of a folder or mailbox was missing at once and stopped, to protect your
data. Check that the folder or disk is there and that the mail account works, then import again.

## "no mail account" or mail import asks for an account

`no mail account` means the config file has no mail accounts yet. Add one under `mail.accounts`
([mail](mail.md#add-the-account-to-memo)).

`memo sync --account work` takes the account's name: the `name` in `mail.accounts` of the config file. Memo
lists the names it knows when the name is wrong. Without `--account`, it reads every account.

## A note edit is refused

The revision you gave is not the current one: the note changed after you read it. Run
`memo notes show note:ID --json`, take the current `revision` and edit again.

## A person's context is empty or missing something

- The person's chats are not downloaded yet. Download them with tg or max.
- The accounts are not linked. Link them with `tg contacts link` ([details](people.md#link-a-persons-accounts)).
- With several accounts in one messenger, add `--account`.
- A note that only mentions the name in its text is not included; link it instead.

## "select --provider and, when several accounts exist, --account"

The command works in one account and Memo does not choose one for you. Add `--provider`, such as
`telegram`, and `--account` with the account's ID.

## Data from an older version is missing

Older Memo versions kept data in a file called `messages.db`. The current version uses the shared
local store, `wirecat.db`, and does not read the old file. Add each folder again with
`memo folders add`, then run `memo sync --notes` and `memo sync --mail`.

## Help shows every command instead of one

A command path in one argument, such as `memo "projects add" --help`, is refused with the words to
type. A shell loop passes it that way: in zsh, `for c in "projects add"; do memo $c --help; done`
keeps `$c` whole. Write `memo ${=c} --help` in zsh, or loop over the words.

## Still stuck

Before you report a bug, compare `memo --version` with `npm view @wirecat/cli-memo version`. If
yours is older, update and try again: the bug may be fixed already.

Run the failing command again with `--json` and give your agent the full answer, or
[open an issue](https://github.com/WireCatLabs/cli-memo/issues) with the command and the message.
Do not include private notes, email addresses or messages.
