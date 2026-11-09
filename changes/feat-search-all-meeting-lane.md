### Added

- **`memo search all` finds meetings, from every meeting account, personal and work.** It reads each account's
  search index and ranks meeting passages with messages, mail, notes, events, CRM and business data, at most 3 per
  meeting. A transcript hit's `next` step is `memo meetings passage <cue_ref> --source <provider>:<account>`.
  `missing` names an account whose index is not built yet, and `next` gives
  `memo search meetings <query> --source <provider>:<account>`, which builds it. `missing` also names a meeting account
  that could not be read. `--source zoom:work,notes` reads only the accounts it names; `--only` takes `meetings` too.
  In a group, meetings come from the group's meeting accounts only. Unless the permissions let `search.meetings` and
  `meetings.passage` go ahead (`allow` or `readonly`), meetings are left out and `missing` says so; `ask` leaves them
  out too.
