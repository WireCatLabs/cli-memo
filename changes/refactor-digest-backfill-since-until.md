### Changed — may break callers

- **`memo digest backfill` takes `--since-time <date> --until-time <date>`, no longer `--from` and `--to`.** Across
  WireCat CLIs `--to` names a recipient (a chat or an address), so the date range now uses the pair memo's other
  commands already read. WireCat Desktop's Digests screen sends the new flags, and the old ones to an older memo.
