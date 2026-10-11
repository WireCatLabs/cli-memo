# Keeping the store current

This page is for keeping memo up to date without thinking about it: one command imports what changed
in your notes folders and mailboxes, and a timer can run it for you. Only what changed is read, so a
run after the first is quick. The timer is a systemd user timer, so it needs Linux.

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

`memo import` is incremental. A note whose size and change time are as this computer last saw them is
not read; one whose content hash the store already has is not saved, so a second computer importing the
same folder saves nothing new. What this computer last saw is kept per folder in memo's state folder. Mail reads bodies only of messages not stored yet. A lock
keeps two imports from running at once, and one failing source does not stop the others.

`--notes` or `--mail` limits a run to one kind, and `--no-embed` skips embedding for search by meaning.

Next: [search what was imported](search.md).
