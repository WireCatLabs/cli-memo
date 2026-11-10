### Added

- **`memo people counts` gives how many people each kind holds in one answer.** The answer has the
  shape of `tasks counts`: `total` and `kind`, a list of `{ value, count }` for `person`, `organization`, `automated`,
  `stranger` and `unsorted`. `name:` counts only the people who match.
  WireCat Desktop's People page showed a count on each kind tab and made one `people list` call for each, about 3.7 s
  each on a store of 113,000 people. Now the page makes one call, which takes milliseconds on cli-core with store
  version 62 ([people](../docs/people.md)).

### Changed — may break callers

- **memo is built on cli-core 0.629.0** (was 0.627.0). The store moves to version 62 on first open: each person's kind
  is kept on the person, so `people list` filters, counts and pages in SQL; the first list after the upgrade works
  everyone out once. **`memo models ai` uses the shared command words**: `off` is now `unset`, `forget` is now
  `remove`, the key comes with `--secret-stdin` (was `--key-stdin`) and image consent with `--allow-remote` (was
  `--images`); `models ai revoke` takes the consent back.

### Fixed

- **`memo people list`'s help names the `stranger` kind**: a readable name with no tie to you.
