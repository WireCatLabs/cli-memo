### Changed — may break callers

- **memo runs on cli-core 1.0 and cli-base 1.0** (cli-core 1.0.0-rc.0, was 0.736.0; cli-base 1.0.0-rc.1, was 0.132.0).
  cli-core 1.0 moves the message store to version 73 the first time it opens it: an id is never handed out twice,
  and a JSON column holds valid JSON. After that, only tools on cli-core 1.0 open the store. Watch for: upgrade every
  installed WireCat CLI to its 1.0 release first, and stop `serve`, `mcp` and every sync while memo migrates; the
  migration writes a rollback copy first and refuses to run without one. See
  [cli-core's changelog](https://github.com/WireCatLabs/cli-core/blob/main/CHANGELOG.md).

### Fixed

- **Over MCP, an input that names no local file is passed as the agent wrote it.** A folder id or path in
  `memo folders remove`, `memo sync --folder`, `memo tags add|remove --folder`, a subfolder in `--subfolder`, a name
  or glob in `memo sync --ignore`, and a command path in `memo commands` were made absolute against the client's
  folder, so `--ignore Psychology` named a folder that does not exist.

### Security

- **An MCP call cannot name a credential folder, a WireCat tool's folder or the message store.** Every option and
  argument that takes a local file or folder (`memo notes export --output-dir`, `memo notes add --text-file`,
  `memo projects annotations export --output` and the rest) is checked by its real path before the call runs, so
  neither a link nor `..` gets past. A refused call answers `permission_error` (`access.denied`) with the option in
  `param`. A run in a terminal is unchanged.
