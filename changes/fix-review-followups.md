### Changed — may break callers

- **`memo search meetings` without `--limit` shows 20 hits, not 100** (cli-core 0.662.0). The page now comes from
  the shared default limit, as other lists do. Pass `--limit` for a longer page.
