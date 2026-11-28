### Changed — may break callers

- **memo is now `wcat`, published as `@wirecat/wirecat`.** The npm package `@wirecat/cli-memo` stops at 0.156.0, and
  `@wirecat/wirecat` starts at 1.0.0. Install
  the new one with `npm install -g @wirecat/wirecat`. Its program is `wcat-wirecat`, and the `wcat` launcher runs it
  as `wcat <command>`. The `memo` and `wcat-memo` programs are gone, with no alias. The MCP server is named `wirecat`
  (`dev.wirecat/wirecat` in the MCP Registry), and its tools are `wcat_read`, `wcat_write` and `wcat_tools_search`.
  The agent skill is `wcat`. The repository moved to
  [WireCatLabs/wirecat](https://github.com/WireCatLabs/wirecat).
- **wcat's folders, variables and keyring entries have wcat's name.** The folders are `~/.config/wcat`,
  `~/.local/share/wcat` and `~/.cache/wcat`. The variables start with `WCAT_` (`WCAT_CONFIG_DIR`, `WCAT_READ_ONLY` and
  the rest), and the keyring service is `wcat`. The first start of wcat moves memo's folders, its keyring entries, its
  `memo jobs` timer, its schedules and its agent skill to the new names, once, also on a bare `wcat-wirecat
  --version`. A folder that wcat already holds files in is never merged: memo's stays where it was, and wcat says so
  on stderr. A run with moved folders (a `WCAT_*_DIR` variable, or a `HOME` of its own) moves nothing.
- **Notes, folders, sources and import belong to the files CLI now.** `wcat notes`, `wcat folders`, `wcat sources`,
  `wcat import` and `wcat notes links` are removed. Use `files` (`npm install -g @wirecat/files-cli`) for them.
  `wcat search notes`, `wcat tags` and `wcat tasks` stay, and read the notes the files CLI stored. `wcat show` opens a
  note or a document with `files notes show`.
- **`wcat sync` runs `wcat-files sync` when the files CLI is installed,** and reports its folders as before. Without
  it, `wcat sync` embeds the stored mail and links people, and `--only notes` fails with `files.not-installed`. The
  `--folder` and `--ignore` options are removed: the files CLI has them.
- **`memo mail findings` is `wcat review findings list|show|add`, `memo mail review` is `wcat review mail`, and
  `memo mail subscriptions list` is `wcat review subscriptions list`.** The `mail` group is gone, with no alias. A schedule that ran the old words runs the new ones after the move.
- **`wcat doctor` no longer checks notes folders**, since the files CLI keeps them.
