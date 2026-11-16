### Added

- **`memo context` leads with the person's history: what happened last, across every source, newest first.** Their
  one-to-one messages with the start of each text, mail, calendar events and phone calls, each call with its
  direction, length, the employee who took it and the start of what was said, in one list (`history` in JSON). `--limit`
  ends the page; `history.next` gives the time for `--before-time` to read the page before it, and `--since-time` bounds
  it (`30d`, a date). A recorded call or meeting under `meetings` has `snippet`, the start of its transcript. The texts
  are other people's words: `untrusted` names them. See [the person-brief scenario](../scenarios/person-brief.md).

### Fixed

- **`memo context` shows times in this computer's time zone and names it** (`times in Europe/Madrid`), not in UTC. A
  call at 16:30 in Madrid read 15:30 before. JSON keeps ISO times in UTC.
