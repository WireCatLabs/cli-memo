# Troubleshooting

A search comes back empty, a note is missing or a command refuses. Most of these take a minute to fix. Find what you
see on the screen in the list, then follow its steps. If nothing helps, give your agent the full message wcat printed.

**On this page:**

1. `wcat: command not found`
2. A note or file does not appear in search
3. "Searched by words only"
4. "nobody by that name yet"
5. A folder is refused by import
6. An import deleted nothing and printed a warning
7. "no mail account"
8. "wcat sync no longer imports mail"
9. Adding a source
10. Reading a source for facts
11. A note edit is refused
12. A person's context is empty or missing something
13. "give --account", "give --source" or "names 2 accounts; give one"
14. Data from an older version is missing
15. Help shows every command instead of one
16. Still stuck

## `wcat: command not found`

wcat is not installed, or the terminal was opened before you installed it. Close the terminal, open a
new one and run `wcat --help`. If it still fails, install wcat again:
`npm install -g @wirecat/wirecat` ([installation](installation.md)).

## A note or file does not appear in search

1. Run `wcat sync --only notes` and read the report. It lists files it could not read and why.
2. Check that the file's folder is in `files folders list`, and that the file is not skipped by
   `notes.ignore` in the [config file](configuration.md#notes).
3. Search for one word you know is in the file. A search finds results that contain **every** word,
   so a long sentence often finds nothing; use two or three key words.
4. Scanned PDFs have no text to read, and old `.xls` files cannot be read: the report lists them
   under "not read".

## "Searched by words only"

The search model for search by meaning is not on your computer. wcat still finds every note that
contains your words. To also search by meaning, download the model once, then import. tg, max and the other WireCat
tools share it:

```sh
wcat models download embeddinggemma
wcat sync
```

## "nobody by that name yet"

A note links to a name, such as `[[Kai Sample]]`, but nobody with that name is in the local store
yet. The link starts working once the person's chats are downloaded with tg, max or wa. If two people
share the name, link the right one with a reference such as `[Kai](person:7)`.

## A folder is refused by import

Every folder needs an ID from the local store. Add it with `files folders add /path/to/folder`. If the
folder was added on another computer, connect it instead: `files folders list` shows its ID, and
`files folders update ID /path/to/folder` connects it ([details](https://wirecat.dev/en/docs/files)).

## An import deleted nothing and printed a warning

The import found that most of a folder was missing at once and stopped, to protect your
data. Check that the folder or disk is there, then import again.

## "no mail account"

`no mail account` means the store holds no mail of that address. wcat does not import mail: the
[mail](mail.md#bring-mail-in-with-mail) CLI does, with `mail <profile> sync`, and `wcat search mail` then finds it.
`--source email:<address>` takes the mailbox's address; wcat lists the ones the store holds when it is wrong.

## "wcat sync no longer imports mail"

The config still has wcat's old `mail` settings, which nothing reads. `wcat doctor` names the mailboxes they list:
sync each with `mail <profile> session start --address <address>`, then `mail <profile> sync`. The mail wcat
imported stays in the store. `wcat config unset mail` removes the old settings and the message.

## Adding a source

`files sources add` refuses with a reason in `--json` (`error.reason`) and says what to do next. Nothing is stored
when it refuses.

| Reason | What happened | What to do |
|---|---|---|
| `source.unsupported` | No reader takes this kind of file or page | Save it as PDF, Word or plain text and add that file |
| `source.no-text` | The file, page or pasted text holds no text | Add a file that holds text, or paste the text with `files sources add -` |
| `source.unreadable` | The reader could not read it: damaged or locked | Open it, save it again or as PDF or plain text, and add that |
| `source.engine-missing` | The reader for this kind of file is not installed | Reinstall wcat: `npm install -g @wirecat/wirecat` |
| `source.too-large` | Over 10 GiB (`MESSAGING_ATTACHMENT_MAX_MIB`), or larger than its reader reads | Add a smaller part, or save only its text and add that |
| `source.url-refused` | Not an `http` or `https` address on the public internet: `localhost`, a home network address, a `file:` link, a link with a user name or password, or a redirect from `https` to plain `http` | Give the address of a public page |
| `source.url-status` | The site answered with an error, such as 404 | Check the address in a browser; if it opens only for you, save the page as a file and add it |
| `source.url-timeout` | The page did not arrive within 30 seconds | Try again later, or save the page as a file and add it |
| `source.url-redirects` | The site sent the request on more than 5 times | Open the address in a browser and add the address it ends at |
| `source.url-unreachable` | The site could not be found or reached | Check the address and the connection, or save the page as a file |
| `source.needs-sign-in` | The page asks you to sign in, such as a private Google Doc | Add it through your signed-in Google account: `drive documents add <url> --profiles <names\|all>` (or `drive <profile> documents add <url>`) |

A scanned PDF or a picture is not refused: it is kept by its title and subjects, with `read: "no-text"`.

## Reading a source for facts

`files sources suggest` and `files sources readers set` refuse with these reasons. Nothing is staged when they do.

| Reason | What happened | What to do |
|---|---|---|
| `reader.none-chosen` | No reader is chosen; the refusal lists them | `files sources readers set <reader>` |
| `reader.unknown` | The reader is not one wcat knows | Give one that `files sources readers list` lists |
| `reader.owner-picks` | An agent named a reader or a model, or tried to choose one | Only you choose; the agent reads with your reader |
| `reader.model-missing` | Ollama or an API reader has no model, or Ollama lacks it | `files sources readers set <reader> --model <model>`; for Ollama, `ollama pull <model>` |
| `reader.unavailable` | Claude Code or Codex is not installed | Install it, or choose another reader |
| `reader.failed` | The reader failed: not signed in, too old, the key was rejected or the account has no credit | `files sources readers list` names the problem; sign in, update, or `wcat models keys set <provider>` |
| `reader.no-key` | No key is kept for the API reader, or for the AI model `ai-model` reads with | `wcat models keys set <provider>`; for `ai-model`, `wcat models ai set <provider> --model <m> --secret-stdin` |
| `reader.ai-not-set` | `ai-model` is chosen, but no AI model is | `wcat models ai set <provider> --model <m>` |
| `reader.not-running` | Ollama is not running on this computer | `ollama serve`, then try again |
| `reader.limit` | The provider's limit is reached | Try again later |
| `reader.timeout` | The reader gave no answer within 10 minutes | Try again, or add a smaller part of the source |
| `reader.unusable-answer` | The answer was not the JSON wcat asked for | Try again with `--rescan`, or another model |

A batch with no facts means every proposed fact was dropped; `dropped` says why for each.

## A note edit is refused

The revision you gave is not the current one: the note changed after you read it. Run
`files notes show note:ID --json`, take the current `revision` and edit again.

## A person's context is empty or missing something

- The person's chats are not downloaded yet. Download them with tg, max or wa.
- The accounts are not linked. Link them with `wcat people link` ([details](people.md#link-a-persons-accounts)).
- With several accounts in one messenger, add `--source`, such as `--source telegram:1`.
- A note that only mentions the name in its text is not included; link it instead.

## "give --account", "give --source" or "names 2 accounts; give one"

The command works in one account and wcat does not choose one for you. A command that changes something
takes `--account` with the provider and the account's ID, such as `--account telegram:1`; one that reads
takes `--source` in the same form. The error lists the accounts the store holds.

## Data from an older version is missing

Older wcat versions kept data in a file called `messages.db`. The current version uses the shared
local store, `wirecat.db`, and does not read the old file. Add each folder again with
`files folders add`, then run `wcat sync --only notes`. To bring mail back, sync each mailbox with the `mail` CLI
([bring mail in](mail.md#bring-mail-in-with-mail)).

## Help shows every command instead of one

A command path in one argument, such as `"projects add"`, is refused with the words to
type. A shell loop passes it that way: in zsh, `for c in "projects add"; do wcat $c --help; done`
keeps `$c` whole. Write `wcat ${=c} --help` in zsh, or loop over the words.

## Still stuck

Before you report a bug, compare `wcat --version` with `npm view @wirecat/wirecat version`. If
yours is older, update and try again: the bug may be fixed already.

Run the failing command again with `--json` and give your agent the full answer, or
[open an issue](https://github.com/WireCatLabs/wirecat/issues) with the command and the message.
Do not include private notes, email addresses or messages.
