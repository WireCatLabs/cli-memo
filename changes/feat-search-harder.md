### Added

- **`memo search all --harder`: a hosted model reorders the first 30 results.** Claude Haiku reads the question with
  the results and puts the ones that answer it first. It is off until you allow it with
  `memo models search-consents set anthropic --yes`, and then only a search with `--harder` sends anything: the
  question and the first 30 results (date, title, up to 400 characters each) go to Anthropic. A missing key, a wait
  of more than 5 seconds or any error keeps the usual order and says why. See [Search harder](../docs/search.md#search-harder).
