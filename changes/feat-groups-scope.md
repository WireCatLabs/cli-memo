### Added

- **`memo groups update <source> --scope personal|work` sets an account's scope**, which decides whether work views
  and meeting preparation read it; what search copied of the old scope moves with it. `--chat <chat>` pins one chat
  of the account instead, and `--scope account` takes the chat's own scope off. Only the owner runs it: a read-only
  lock refuses it and an agent over MCP does not see it. `groups list` shows each account's `scope`
  ([usage](../docs/usage.md#groups-of-accounts)).
