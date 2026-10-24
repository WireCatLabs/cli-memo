# Keeping Memo up to date

This page helps you keep Memo current without thinking about it. One command brings in what changed
in your note folders and mailboxes, and on Linux a timer can run it for you every few minutes. Only
what changed is read, so every run after the first is quick.

## Import what changed

```sh
memo sync
```

This imports every folder and mail account in the [config file](configuration.md). It reports what
it found for each one:

```text
notes /path/to/notes: 24 notes, 2 changed, 0 moved, 0 gone
```

| Option | What it does |
|---|---|
| `--only notes` | Only note folders |
| `--only mail` | Only mail accounts |
| `--no-embed` | Skip the preparation for search by meaning |

Telegram, MAX and WhatsApp messages are kept current by tg, max and wa, not by `memo sync`.

## Import on a timer (Linux)

```sh
memo jobs start --every 5m   # sync every 5 minutes, starting a minute from now
memo jobs status             # whether the timer is on, when it runs next and how the last run ended
memo jobs stop               # stop and remove the timer
```

While the timer's runs fail, every memo command writes one line to stderr saying since when, how many runs and
why, and `memo jobs status` shows the same under `failing`. The line goes once a timer run passes. The reason is an
error code with its reason id and the kind of source that failed (`notes: configuration_error (folder.unbound)`),
never the error's text, which can name a folder or a subject; the full message is in the timer's journal,
`journalctl --user -u memo-import.service`, which `memo jobs status` names.

`--every` takes `90s`, `5m`, `1h` and so on; the shortest is one minute. The timer uses systemd, the
service manager of most Linux systems. On macOS and Windows, run `memo sync` yourself or from your
own scheduler.

The timer runs `memo sync` with the settings of the terminal you turned it on from, so it finds
Himalaya and your passwords the same way. `memo jobs start` and `stop` write `auto` in the config file;
if you edit it there, the timer follows at its next run.

## What an import reads

- A note file with the same size and change time as last time is not read.
- Text that is already in the local store is not saved again, so a second computer importing the
  same folder adds nothing new.
- Mail that is already stored is skipped.
- Two imports never run at the same time, and one source that fails does not stop the others.

[How Memo works](how-it-works.md#what-an-import-does) explains what happens to edited, moved and
deleted files.

Next: [search what you imported](search.md).
