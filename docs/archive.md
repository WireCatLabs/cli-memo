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
| `--notes` | Only note folders |
| `--mail` | Only mail accounts |
| `--no-embed` | Skip the preparation for search by meaning |

Telegram and MAX messages are kept current by tg and max, not by `memo sync`.

## Import on a timer (Linux)

```sh
memo auto on --every 5m     # import every 5 minutes, starting a minute from now
memo auto status            # whether the timer is on, when it runs next and how the last run ended
memo auto off               # stop and remove the timer
```

`--every` takes `90s`, `5m`, `1h` and so on; the shortest is one minute. The timer uses systemd, the
service manager of most Linux systems. On macOS and Windows, run `memo sync` yourself or from your
own scheduler.

The timer runs `memo sync` with the settings of the terminal you turned it on from, so it finds
Himalaya and your passwords the same way. `memo auto on` and `off` write `auto` in the config file;
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
