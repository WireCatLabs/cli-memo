### Changed — may break callers

- **A task found in a message takes the fields of a project task.** `memo tasks update` gives it `--priority`,
  `--agent`, `--status todo` or `in_progress`, another message kind with `--type`, and `--project` moves it into a
  project under that project's key, keeping its source message ([tasks](../docs/tasks.md#moving-a-task-to-another-project)).
- **`memo tasks list` with any board field lists found tasks too.** `assignee:`, `priority:`, words and the other
  fields, `--sort` and `--cursor` no longer need `project:`: they list every task, project and found, and each item
  carries its `assignments`. `project:*` still lists project tasks only. `memo tasks counts` counts found tasks too.

### Fixed

- **`memo actions confirm` decides a meeting findings batch by the findings it names.** As for mail findings, the
  named finding IDs are accepted and the rest rejected, with `--fingerprint` checked when given; it used to refuse and
  point to `meetings actions confirm`.
