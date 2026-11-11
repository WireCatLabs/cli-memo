### Added

- **`memo models local-only set on|off` and `show`.** One switch that keeps every model call on this computer, in
  every WireCat tool, and a list of each feature with where its data goes. Off until you turn it on; only you turn it
  off (cli-core's local only).
- **The Ollama reader takes another address on this computer.** `memo sources readers set ollama --model <model>
  --base-url http://127.0.0.1:<port>` keeps it as `sources.base_url`; an address on another computer is refused
  (`reader.address-refused`).
- **`memo answers create --analyze` uses the AI model chosen with `memo models ai set`** when
  `MEMO_MODELS_ANALYSIS_PROVIDER` and `MEMO_MODELS_ANALYSIS_MODEL` are not set, with the key kept for its address.
- **A digest can run codex, with a model.** `memo digest add|edit --agent claude|codex --model <model>`; an edit that
  changes the agent drops the old agent's model unless `--model` names one. `memo digest list` and `show` give
  `harness` and `model`.

### Changed — may break callers

- **Plain http to another computer is refused for every model call**, and voice messages are heard by the downloaded
  model first (cli-core 0.642.0).
