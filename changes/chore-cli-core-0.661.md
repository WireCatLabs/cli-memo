### Changed — may break callers

- **Dates in list queries read the computer's zone, and a due date alone is the end of that day** (cli-core
  0.661.0). `today` and a bare date in `memo tasks list` and the other list queries started in UTC, and now start
  at local midnight, as search and the digest do. `memo tasks update --due 2026-11-20` sets the end of the 20th, so
  the task is not overdue all that day.

### Fixed

- **`memo documents show` says more text follows after emoji** (cli-core 0.661.0). `has_more` compared a length in
  UTF-16 units with one in code points, so a part holding emoji could report no more text before the end, and
  WireCat Desktop's "Show more" disappeared early. `text_offset`, `text_length`, `--cursor` and `--max-chars` all
  count Unicode code points.
