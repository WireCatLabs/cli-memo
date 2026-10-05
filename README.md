# cli-memo

`memo` answers "what do I need to know about this person": who they are in each messenger, the
newest messages each way, the notes about them, and the newest mail threads — each item with a link
to its source.

It reads the local message store that [tg-cli](https://github.com/leemour/tg-cli) and
[max-cli](https://github.com/leemour/max-cli) share, Markdown notes such as an Obsidian vault, and mail
through [Himalaya](https://github.com/pimalaya/himalaya). Everything stays on your machine; nothing is
sent or changed at the source.

**Status:** early. Notes search, Gmail import and person notes work; the joined answer about a person is being built.

## Notes

```sh
memo notes import                          # load the notes into the shared store; run again after edits
memo notes search "lighthouse budget"      # notes by their words, and the people they name
memo notes about "Rin Example"             # notes about a person, read straight from the folders
```

`import` stores each Markdown or text note as one entry of provider `notes` in the shared store (the
folder is the account, each subfolder a chat), so `memo notes search`, `tg messages search "in:notes …"`
and agents find notes beside messages and mail. An edited note keeps its old text as a revision; a note
deleted from the folder loses its text on the next import.

`search` lists the notes found, newest first, then who they name: `[[Name]]` links, and people the
store knows from tg, MAX or mail whose full name appears in the text — by name only, so a guess.

`about` lists the notes *about* the person (file name or `aliases` in the front matter), the notes that
*link* them, and lines that only say the name (weak). Hidden folders such as `.obsidian` are skipped,
and nothing is ever written to a notes folder.

Folders and what to skip go in `~/.config/cli-memo/config.json`; `--folder` and `--ignore` add to them
for one run. An ignore rule is a path inside the folder — a file, or a folder and everything under it —
or a glob (`**/Private*`, `*.txt`):

```json
{ "notes": { "folders": ["/path/to/vault"], "ignore": ["Journal/Private.md", "Archive"] } }
```

## Keeping it current

```sh
memo import                  # notes and mail, only what changed since the last run
memo auto on --every 5m      # run memo import on a systemd user timer (default 5m, a minute or more)
memo auto status             # on/off, interval, next and last run
memo auto off                # stop and remove the timer
```

The config is the one source: `memo auto on/off` write `auto: { enabled, every }` to
`~/.config/cli-memo/config.json`, and a hand edit there takes effect at the next timer run, which
rewrites or removes its own timer to match. The timer runs `memo import` from the place it was set up
from, with the `PATH` of that shell, so Himalaya and the keyring helper are found.

`memo import` is incremental. A note whose size and change time are as last stored is not read; one
whose content hash is the same is not saved. Mail reads bodies only of messages not stored yet. A lock
keeps two imports from running at once, and one failing source does not stop the others.

## Mail

```sh
memo mail import --since 2026-09-01
```

Reads a Gmail account's All Mail through [Himalaya](https://github.com/pimalaya/himalaya) into the
shared message store as provider `email`: one chat per Gmail thread, the mailbox address as the
account, senders and recipients as people. Messenger search and person context then see mail too.

- Read only: the mailbox is opened read-only, nothing is sent, and no mail is marked read.
- Run it again any time: what is stored is skipped; `--max` (default 200) bounds the new mails read
  per run, and the next run continues.
- A mail deleted at the source loses its text in the store. The first two days of the window are left
  alone, and a run that finds an unusually large share missing deletes nothing and says so. Mail moved
  to Spam leaves All Mail and counts as deleted.

Set the account up in Himalaya first (an IMAP account with a Gmail
[app password](https://myaccount.google.com/apppasswords); `bin/mail-password <name>` stores it in the
keyring), then name it in `~/.config/cli-memo/config.json`:

```json
{ "mail": { "accounts": [{ "name": "gmail", "address": "you@example.com" }] } }
```

## People

Who is who is decided in messaging: `tg contacts link <person> email:<address>` (or `max contacts link`)
records that a messenger identity and a mail address are one person, in the shared store. A same name
is never enough. `memo` only adds the note that is about the person:

```sh
memo note telegram:"Rin Example" ~/Notes/people/Rin.md
```

An identity is `<messenger>:<name or id>`; a name two people share is refused, with their ids to
choose from. The note path lives in `~/.config/cli-memo/people-notes.json`.

## Development

```sh
pnpm install
pnpm lint && pnpm typecheck && pnpm test
```

## License

MIT
