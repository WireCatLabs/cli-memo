# Installation

This page helps you install Memo, check that it works, and know where it keeps its files. When you
are done, `memo --help` lists Memo's commands and you can import your first folder of notes. You
need Node.js; everything else on this page is needed only for the sources that use it.

## What it needs

- **Node.js 22.16 or newer** (version 22.16+ or 24+), with npm. Node.js runs Memo, and npm
  installs it. If you do not have them, ask your agent to help you install them, or get
  them from [nodejs.org](https://nodejs.org).
- **Notes and documents:** nothing more. PDF and Word (`.docx`) files need two optional readers, see
  [files Memo can read](notes.md#files-memo-can-read).
- **Messages:** [tg](https://github.com/WireCatLabs/tg-cli) for Telegram or
  [max](https://github.com/WireCatLabs/max-cli) for MAX. They save your chats in the local store, and
  Memo reads them from there. Memo does not log in to a messenger itself.
- **Search by meaning:** a small search model that runs on your computer. tg or max downloads it
  once: `tg models text download e5-small`, or `max models text download e5-small`. Without it,
  Memo searches by words.
- **Mail:** [Himalaya](https://github.com/pimalaya/himalaya), a mail program that Memo uses to read
  your mailbox ([mail](mail.md)).
- **Importing on a timer** (`memo auto`): Linux. On macOS and Windows, run `memo import` yourself or
  from your own scheduler ([keeping Memo up to date](archive.md)).

## Install

**The easiest way: ask your agent.**

```text prompt
Install Memo with npm install -g @wirecat/cli-memo.
Check Node.js and npm first and help me set them up if needed.
Then run memo --help and tell me if it works.
```

**Or install it yourself.** Open a terminal and run:

```sh
npm install -g @wirecat/cli-memo
memo --help
```

On Windows, open PowerShell and type `npm.cmd` instead of `npm`.

`memo --help` should list commands such as `notes`, `search` and `tags`. If the terminal says the
command is not found, close it, open a new one and try again.

Memo has no login step. Next, [add a folder of notes](notes.md#add-a-folder) or
[connect a mail account](mail.md).

## Where the files are

| What | Where |
|---|---|
| Settings | `~/.config/cli-memo/config.json` ([configuration](configuration.md)) |
| Your messages, mail, notes, tags, tasks and memories | The local store, `wirecat.db`, shared with tg and max |
| What this computer imported last, for each folder | Memo's state folder |

`~` means your home folder. Your note files and your mailbox stay where they are; the local store
holds a copy of their text.

## Update and remove

```sh
npm install -g @wirecat/cli-memo     # update to the latest version
npm uninstall -g @wirecat/cli-memo   # remove the memo command
```

If you turned on the timer, run `memo auto off` before you remove Memo. Removing Memo keeps the local
store and the settings, because tg and max use the same store.

## Development

To work on Memo itself, clone [the repository](https://github.com/WireCatLabs/cli-memo) and run:

```sh
pnpm install
pnpm lint && pnpm typecheck && pnpm test
```
