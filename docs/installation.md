# Installation

This page is for installing memo, a command-line tool, and knowing what it needs and where it keeps its
files. After it, `memo --help` works and you can import your first folder of notes. memo needs Node.js
22.16 or newer; the other tools below are needed only for the sources that use them.

## Requirements

- **Node.js** `^22.16.0` or `>=24`.
- **Notes and documents:** nothing more. PDF and DOCX files need the optional `unpdf` and `mammoth`
  packages installed alongside the CLI ([documents in a folder](notes.md#documents-in-a-folder)).
- **Messages:** [tg-cli](https://github.com/WireCatLabs/tg-cli) or [max-cli](https://github.com/WireCatLabs/max-cli),
  which write the local message store memo reads.
- **Search by meaning:** the local e5-small model, downloaded once with `tg models text download e5-small`.
- **Mail:** [Himalaya](https://github.com/pimalaya/himalaya) ([mail](mail.md)).
- **The import timer** (`memo auto`): Linux with systemd ([keeping the store current](archive.md)).

## Install

```sh
npm install -g @wirecat/cli-memo
memo --version
```

## Where the files are

- The config: `~/.config/cli-memo/config.json` ([configuration](configuration.md)).
- Messages, mail, notes, links, labels, relationships and task reminders: the local store shared with
  tg and max, `wirecat.db`.
- What this computer last imported, per folder: memo's state folder.

## Update and remove

```sh
npm install -g @wirecat/cli-memo     # update to the latest release
npm uninstall -g @wirecat/cli-memo   # remove the command; the store and config stay
```

`memo auto off` removes the import timer before you uninstall.

## Development

```sh
pnpm install
pnpm lint && pnpm typecheck && pnpm test
```
