### Added

- **`memo search all --harder`: a hosted model reorders the first 30 results.** The model reads the question with the
  results and puts the ones that answer it first. It is off until you allow it with
  `memo models search-consents set <provider> --yes` (Anthropic, OpenAI or an OpenAI-compatible service such as
  OpenRouter), and then only a search with `--harder` sends anything: the question and the first 30 results (date,
  title, up to 400 characters each) go to that provider. A missing key, a wait of more than 5 seconds or any error
  keeps the usual order and says why. On synthetic data it raised recall in the first ten from 0.79 to 0.88 (reworded
  questions) and from 0.32 to 0.39 (LifeBench sample) over Memo's own search. See
  [Search harder](../docs/search.md#search-harder).
