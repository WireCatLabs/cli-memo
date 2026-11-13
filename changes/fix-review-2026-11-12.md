### Added

- **An agent over MCP may run a schedule you made.** `schedule list`, `agents list`, `run` and `exec` are offered, as
  in every WireCat CLI. Making, removing, pausing or resuming a schedule needs `mcp.authority`, which defaults to
  `deny`. See [MCP](../docs/mcp.md).

### Changed — may break callers

- **`memo stats tasks show` has no `--chat` any more: name the chat in the query, `-- chat:7`.** From cli-core
  0.648.0, as in tg and MAX. A chat with no account named is still refused.

### Fixed

- **The sync health of the digest no longer credits a schedule with no profile to one named `default`.** A tg, MAX or
  WhatsApp sync timer that names no profile, in its arguments or its environment, now counts for no account, so a
  profile called `default` is never picked for you.
- **A release with new commands or a breaking change gets a new minor version.** `bin/release` raised only the patch
  number, so 0.131.86 and 0.131.87 shipped new commands as patches.
- **`memo mcp --help` no longer speaks of "this profile".** Memo has no profiles; it serves memo's commands.

### Security

- **`sources suggest` reaches only the hosts of the readers.** Its Ollama and API readers go through the host check:
  OpenAI's and Anthropic's APIs, this computer, and the addresses you set for Ollama and for the shared AI model. A
  local model may take up to 15 minutes on one source.
