### Fixed

- **`memo stats tasks show` counts every stored account when you name none.** It used to stop with "give --source"
  and a list of accounts. The answer now names the accounts it read in `accounts`, and each chat row keeps its own
  account. `--source` narrows it to one account, and `--chat` still asks for `--source`, since a chat belongs to one
  account.
- **On `@wirecat/cli-core` 0.632.0.** Search takes `muted:true` and `muted:false`, for the chats you muted.
