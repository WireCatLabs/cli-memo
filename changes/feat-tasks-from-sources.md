### Added

- **A `task-triage` agent proposes tasks from chats and meetings.** Scheduled with `memo schedule agent task-triage
  claude 'Run memo skill show task-triage and follow it.'`, it reads the Telegram, MAX and WhatsApp messages and the
  meetings since its last run and stages what you promised, what you were asked and the dates said, as findings you
  confirm. Before, only mail could propose a task. See [Tasks](../docs/tasks.md#tasks-proposed-from-chats-mail-and-meetings).

### Fixed

- **`memo review agenda` shows the proposals that hold tasks first.** Hundreds of identity links no longer hide them;
  each says how many tasks it holds, and a note counts all of them. Its `tasks` section says when no agent proposes
  tasks, or when one was paused, fails or was refused, with the command that fixes it.
- **A task already open or waiting is not proposed again.** `memo projects actions add` and `memo meetings actions
  add` leave out a task whose title matches one, from any source, and answer `duplicates`. A read-only scheduled
  agent may now run both, as it runs `memo mail findings add`.
