### Changed — may break callers

- **`memo upgrade` moves you from memo to wcat.** memo is now `wcat`, package `@wirecat/wirecat`. This is the last
  `@wirecat/cli-memo`. `memo upgrade` installs `@wirecat/wirecat` (and `@wirecat/files-cli` when notes folders are
  set) with the package manager that installed memo, starts it once so it moves memo's folders, keys and timers, then
  removes `@wirecat/cli-memo`. While `@wirecat/wirecat` is not on npm it says so and changes nothing. `--check` shows
  the commands. Its JSON is new: `current`, `installer`, `memo_latest`, `wirecat`, `packages`, `commands`,
  `switched`, `removed`.
- **A daily line says to run `memo upgrade`.** On a terminal only, never in JSON, MCP or a timer run. It asks npm
  nothing.
