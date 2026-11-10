### Added

- **`memo people counts` gives how many people each kind holds in one answer.** The answer has the
  shape of `tasks counts`: `total` and `kind`, a list of `{ value, count }` for `person`, `organization`, `automated`,
  `stranger` and `unsorted`. `name:` counts only the people who match.
  WireCat Desktop's People page showed a count on each kind tab and made one `people list` call for each, about 3.7 s
  each on a store of 113,000 people. Now the page makes one call, which takes milliseconds on cli-core with store
  version 62 ([people](../docs/people.md)).

### Fixed

- **`memo people list`'s help names the `stranger` kind**: a readable name with no tie to you.
