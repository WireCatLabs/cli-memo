### Changed — may break callers

- **`memo folders add` picks a new folder's format when `--format` is not given.** A folder with Obsidian's own
  `.obsidian` folder in it or above it is `obsidian`, any other folder `markdown`; before, every folder was
  `obsidian`, so a `#word` in plain Markdown became a tag. The `--json` answer names where the format came from
  (`format_from`: `detected`, `option` or `saved`). `--format` still wins, and a folder memo already knows keeps
  its format. See [Add a folder](../docs/notes.md#add-a-folder).

### Fixed

- **Changing a folder's format reads its notes again.** After `memo folders add --format` or `memo folders update
  --format` with another format, the next `memo sync --only notes` parses every note of that folder again, even
  unchanged ones, so tags and links read in the old format are replaced. See
  [Markdown or Obsidian](../docs/notes.md#markdown-or-obsidian).
