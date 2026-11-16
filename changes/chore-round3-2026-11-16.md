### Added

- **`memo facts history` lists the facts removed, newest first** (cli-core 0.674.0). Each row says which fact it was,
  what it was about, who removed it (you or an agent), when and why. It never shows what the fact said: removing still
  forgets that. `memo facts remove --reason <text>` keeps the reason there, and `memo facts reverse --reason <text>`
  keeps it on the reversed decision. An agent can read the log over MCP; only you can remove a fact.
- **memo ships its WireCat manifest, `contracts/wirecat.json`.** WireCat Desktop reads it out of the package before it
  installs memo, and shows the hosts memo may contact: the default addresses of the readers and AI models, this
  computer, and the shared update and model downloads. `memo --wcat-describe` answers format 2.

### Changed — may break callers

- **`memo projects evidence` and `memo projects status` take `--purposes`** for the comma list of chat purposes to
  read, as the family's flags name a list. `--purpose` still works for one more version, hidden from help and the
  command list. `memo relationships update --purpose` is unchanged: it sets one chat's purpose.

### Fixed

- **`memo notes export` and `memo notes edit --export` write a note's first subject as a link.** Only
  `memo notes add --export` wrote it before; the others left the first `--subject` out of the file (cli-core 0.674.0).
