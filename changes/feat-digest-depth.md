### Added

- **`memo digest history`** lists the last reports a digest delivered, newest first, each item with how many digests
  in a row had it and what became of it since: you answered, they wrote again, nothing new, or a task done or still
  open. It is a read, so a digest's agent runs it under `MEMO_READ_ONLY` to say "second day without an answer" and to
  leave out what was already done. See [commands](../docs/commands.md).
- **A digest's scheduled run catches up first.** Before its agent starts, memo runs again each sync you put on a timer
  in tg, max, wa and mail that is more than an hour behind, as that schedule says (its profile, its flags), for up to
  4 minutes in all. A morning digest no longer reads the night's 04:30 sync as the day. memo syncs no account you gave
  no schedule, and picks no profile.
- The digest's agent gets the agenda and the last three reports in its input, so it spends its calls on following
  leads.

### Changed — may break callers

- **`review agenda` lists owed mail from new senders under `mail`**, each marked "owed reply, new sender", instead of
  one count with a command. The `owed` section's `unknown` count stays.
- `review agenda` lists under `owed` a dialog whose newest message the sync has not stored yet, marked "newest message
  not synced: may be owed". Before, such a person was never shown.
- `review agenda`'s `health` names an account whose timer has not synced it for 36 hours, with `reason: null` and the
  hours since its last good sync, as `wirecat.report/1` allows.
- The morning-digest skill writes a deeper report: a reply for every person waiting, an item for every project that
  moved with what moved, today's and tomorrow's calendar, meetings with what was agreed, and mail worth a look. It
  compares each item with the last digests and says how long one waits, what changed, and leaves out what was done.
  It may make up to 20 memo calls, not 12.
