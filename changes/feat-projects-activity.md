### Added

- **`memo stats projects show` says how busy each project is, for all projects in one call**: the chats linked to it
  or its child projects, how many are muted, messages and yours in the period (`--since-time 30d` by default, or
  `all`), the newest message and the three busiest chats, busiest project first. A muted chat's messages are not
  counted. `--limit`, `--page` and `--json`. It is a light read for a dashboard; `memo projects status <project>`
  still says where one project stands.
