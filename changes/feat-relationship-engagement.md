### Added

- **An engagement level on a person's membership of a project.** `memo relationships add` and
  `memo relationships update <id>` take `--engagement none|low|medium|high`: how much you deal with that person
  yourself, not how active they are. Without one it is unknown; `--engagement ''` clears it. It is shown in
  `relationships list`, `review show` of a change, `projects context` and every relationship answer
  (`engagement`). `projects context` and `relationships list` put people in the order high, medium, unknown, low,
  none. A low member stays a member, so `projects evidence` still reads what they write.
- **A role note beside the role.** `--role-note <text>` on `relationships add` and `relationships update` keeps what
  the role means here in your words (`role_note`), while `--role` stays one of its list.
- cli-core 0.618.0.
