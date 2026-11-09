# Troubleshooting

This page helps when Memo does not do what you expected. Find what the screen says or what you
noticed, then follow the steps. To ask your agent for help, give it the full message Memo printed.

## `memo: command not found`

Memo is not installed, or the terminal was opened before you installed it. Close the terminal, open a
new one and run `memo --help`. If it still fails, install Memo again:
`npm install -g @wirecat/cli-memo` ([installation](installation.md)).

## A note or file does not appear in search

1. Run `memo sync --only notes` and read the report. It lists files it could not read and why.
2. Check that the file's folder is in `memo folders list`, and that the file is not skipped by
   `notes.ignore` in the [config file](configuration.md#notes).
3. Search for one word you know is in the file. A search finds results that contain **every** word,
   so a long sentence often finds nothing; use two or three key words.
4. Scanned PDFs have no text to read, and old `.xls` files cannot be read: the report lists them
   under "not read".

## "Searched by words only"

The search model for search by meaning is not on your computer. Memo still finds every note that
contains your words. To also search by meaning, download the model with tg or max, then import:

```sh
memo models download embeddinggemma
memo sync
```

## "nobody by that name yet"

A note links to a name, such as `[[Kai Sample]]`, but nobody with that name is in the local store
yet. The link starts working once the person's chats are downloaded with tg or max. If two people
share the name, link the right one with a reference such as `[Kai](person:7)`.

## A folder is refused by import

Every folder needs an ID from the local store. Add it with `memo folders add /path/to/folder`. If the
folder was added on another computer, connect it instead: `memo folders list` shows its ID, and
`memo folders update ID /path/to/folder` connects it ([details](notes.md#use-the-same-notes-on-another-computer)).

## An import deleted nothing and printed a warning

The import found that most of a folder was missing at once and stopped, to protect your
data. Check that the folder or disk is there, then import again.

## "no mail account"

`no mail account` means the store holds no mail of that address. Memo does not import mail: the
[mail](mail.md#bring-mail-in-with-mail) CLI does, with `mail <profile> sync`, and `memo search mail` then finds it.
`--source email:<address>` takes the mailbox's address; Memo lists the ones the store holds when it is wrong.

## "memo sync no longer imports mail"

The config still has Memo's old `mail` settings, which nothing reads. `memo doctor` names the mailboxes they list:
sync each with `mail <profile> session start --address <address>`, then `mail <profile> sync`. The mail Memo
imported stays in the store. `memo config unset mail` removes the old settings and the message.

## Adding a source

`memo sources add` refuses with a reason in `--json` (`error.reason`) and says what to do next. Nothing is stored
when it refuses.

| Reason | What happened | What to do |
|---|---|---|
| `source.unsupported` | No reader takes this kind of file or page | Save it as PDF, Word or plain text and add that file |
| `source.no-text` | The file, page or pasted text holds no text | Add a file that holds text, or paste the text with `memo sources add -` |
| `source.unreadable` | The reader could not read it: damaged or locked | Open it, save it again or as PDF or plain text, and add that |
| `source.engine-missing` | The reader for this kind of file is not installed | Reinstall Memo: `npm install -g @wirecat/cli-memo` |
| `source.too-large` | Over 50 MiB, or larger than its reader reads | Add a smaller part, or save only its text and add that |
| `source.url-refused` | Not an `http` or `https` address on the public internet: `localhost`, a home network address, a `file:` link, a link with a user name or password, or a redirect from `https` to plain `http` | Give the address of a public page |
| `source.url-status` | The site answered with an error, such as 404 | Check the address in a browser; if it opens only for you, save the page as a file and add it |
| `source.url-timeout` | The page did not arrive within 30 seconds | Try again later, or save the page as a file and add it |
| `source.url-redirects` | The site sent the request on more than 5 times | Open the address in a browser and add the address it ends at |
| `source.url-unreachable` | The site could not be found or reached | Check the address and the connection, or save the page as a file |
| `source.needs-sign-in` | The page asks you to sign in, such as a private Google Doc | Add it through your signed-in Google account: `drive documents add <url> --profiles <names\|all>` (or `drive <profile> documents add <url>`) |

A scanned PDF or a picture is not refused: it is kept by its title and subjects, with `read: "no-text"`.

## A note edit is refused

The revision you gave is not the current one: the note changed after you read it. Run
`memo notes show note:ID --json`, take the current `revision` and edit again.

## A person's context is empty or missing something

- The person's chats are not downloaded yet. Download them with tg or max.
- The accounts are not linked. Link them with `tg personal contacts link` ([details](people.md#link-a-persons-accounts)).
- With several accounts in one messenger, add `--source`, such as `--source telegram:1`.
- A note that only mentions the name in its text is not included; link it instead.

## "give --account", "give --source" or "names 2 accounts; give one"

The command works in one account and Memo does not choose one for you. A command that changes something
takes `--account` with the provider and the account's ID, such as `--account telegram:1`; one that reads
takes `--source` in the same form. The error lists the accounts the store holds.

## Data from an older version is missing

Older Memo versions kept data in a file called `messages.db`. The current version uses the shared
local store, `wirecat.db`, and does not read the old file. Add each folder again with
`memo folders add`, then run `memo sync --only notes` and `memo sync --only mail`.

## Help shows every command instead of one

A command path in one argument, such as `"projects add"`, is refused with the words to
type. A shell loop passes it that way: in zsh, `for c in "projects add"; do memo $c --help; done`
keeps `$c` whole. Write `memo ${=c} --help` in zsh, or loop over the words.

## Still stuck

Before you report a bug, compare `memo --version` with `npm view @wirecat/cli-memo version`. If
yours is older, update and try again: the bug may be fixed already.

Run the failing command again with `--json` and give your agent the full answer, or
[open an issue](https://github.com/WireCatLabs/cli-memo/issues) with the command and the message.
Do not include private notes, email addresses or messages.
