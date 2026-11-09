### Added

- **Digests by name: `memo digest list|add|edit|run|pause|resume|remove`.** Each digest has a title, its times
  (`--at 08:30 --at 18:00`, or `--at 'mon,fri 09:00'` on those days), the sources it reads (`--source telegram,mail`;
  `all` reads everything), its routes (`--deliver-to telegram-bot:<profile>/<chat>`, `email:<profile>/<address>`;
  `none` sends nowhere), its brief (`--text`) and its cost caps; `--paused` makes it off its timer. A daily digest reads a day, a weekly one the week, and
  one that runs more than once a day reads since its previous time. `digest run` builds one now: along its routes,
  only along the ones `--deliver-to` names, or with `--no-notify` nowhere. `digest list --json` gives each digest's
  last and next run. The morning digest is listed first, and its schedule, brief and templates stay where they were.
  Only the owner changes or runs a digest; each run is a paid model call.
- `digest brief show|edit|reset`, `digest backfill` and `templates` take a digest's name (`report/<name>`); a
  digest without its own template uses the morning digest's.
- `review agenda --source <sources>` reads only the sources given; a digest's run reads the digest's own sources
  without it.
