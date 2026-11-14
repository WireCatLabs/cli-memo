### Changed — may break callers

- **`memo search meetings` without `--limit` shows 20 hits, not 100** (cli-core 0.663.0). The page now comes from
  the shared default limit, as other lists do. Pass `--limit` for a longer page.
- **Meeting time flags take one grammar** (cli-core 0.663.0). `memo meetings prepare` and `memo search meetings`
  take an ISO date or time with or without seconds and zone, a date alone, `today`, or `30m`, `2h`, `7d` ago; a time
  without a zone reads the computer's zone. A `memo tasks update --due` or `--remind-time` date alone is that day.
