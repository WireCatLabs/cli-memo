### Added

- **`memories list`, `facts list`, `actions list` and `agents list` take `--page`.** They stopped at 500 rows, so
  WireCat Desktop's Memory page could not show more of a kind. `--limit 500 --page 2` gives the next 500 in the same
  order, newest first, each row once, and `page.next_page` says when there is one, as `relationships list` does. A
  page at the 500 cap now says `has_more: false` when nothing follows, where it used to say `true`. Needs cli-core with
  `offset` on these store lists.

### Fixed

- **A failed `sync`, `doctor`, `digest run` or `digest backfill` under `commands --serve` keeps its exit code to
  itself.** The server answers several requests at once, and these four wrote the one process exit code, so the code
  went to whichever request ended next. They now set it for their own request.
