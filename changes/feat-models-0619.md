### Added

- **`memo models keys set|remove <provider>`**: the key write-time enrichment sends, read from stdin or a hidden
  prompt (never an argument) into memo's keyring entry `embeddings:<provider>`. `--json` answers
  `{ provider, stored: true, source: "keyring" | "file" }` and `{ provider, removed, from }`; the key is never printed.
- **`reason_id` beside `reason` in `item.enrichment`** of `memo sync --json`: `enrichment.no-key`, `key-rejected`,
  `unreachable`, `rate-limited`, `bad-replies`, `cancelled` or `error`, so a window can word it itself.

### Changed — may break callers

- **EmbeddingGemma is memo's default search model** (cli-core 0.619.0). With no `memo models set`, sync embeds and
  search by meaning use it; a machine that has e5-small and not EmbeddingGemma keeps e5-small. `memo models download
  embeddinggemma` asks for no terms: the download writes the Gemma notice beside the model, and `THIRD_PARTY_NOTICES`
  names it. A timer run embeds fewer chunks with it, so it still ends in time.
- **`item.enrichment` is the only enrichment report of `memo sync --json`**: `notes_embedded.enrichment` and
  `mail_embedded.enrichment`, which repeated its parts, are gone.
- **A sync that sent records and got none back enriched says `failed`**, with its reason, not `done`. Notes failed
  beside mail enriched reads `stopped`.
