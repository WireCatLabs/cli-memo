# cli-memo

`memo` answers "what do I need to know about this person": who they are in each messenger, the
newest messages each way, the notes about them, and the newest mail threads — each item with a link
to its source.

It reads the local message store that [tg-cli](https://github.com/leemour/tg-cli) and
[max-cli](https://github.com/leemour/max-cli) share, Markdown notes such as an Obsidian vault, and mail
through [Himalaya](https://github.com/pimalaya/himalaya). Everything stays on your machine; nothing is
sent or changed at the source.

**Status:** early. Notes, Gmail import and person notes work; the joined answer about a person is being built.

## Notes

```sh
memo notes "Rin Example" --folder ~/Notes
```

It lists the notes *about* the person (file name or `aliases` in the front matter), the notes that
*link* them (`[[Rin Example]]`, also through an alias or a heading), and lines that only say the name —
labelled weak, since another person can have the same name. Newest first, each with its file and line;
`--json` for scripts and agents, `--limit` for more. Hidden folders such as `.obsidian` are skipped, and
nothing is ever written.

To skip `--folder`, list the folders in `~/.config/cli-memo/config.json`:

```json
{ "notes": { "folders": ["/path/to/vault"] } }
```

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
