### Fixed

- **`memo review agenda` and the morning digest no longer crash** (cli-core 0.664.0). A project link from a chat that
  was since deleted made them stop with `command.crashed`. Such a link is now left out.

### Added

- **`memo models chats show` and `memo models chats set <mode>`** (cli-core 0.664.0). They say whether chat text may
  go to a model off this computer: `allowed`, `ask` (needs `--yes`) or `denied` (refused even with `--yes`).
