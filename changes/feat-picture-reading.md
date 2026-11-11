### Added

- **Your coding agent can read a picture you add.** With `memo models picture-reading set request --agent claude`
  (or `--agent codex`, with an optional `--model`), `memo sources add <picture>` gives the picture to that agent and
  keeps the text it read, with the extractor `agent:claude` or `agent:codex/<model>`; this comes before the AI model.
  The default is `never`; only you turn it on. The picture goes to the agent's provider unless it runs a local model.
  The same setting lets `images read` in the messenger CLIs read a chat picture (cli-core).

### Fixed

- **A picture the AI model answers nothing to says so.** `memo sources add` gives `image.reason: "ai.empty-answer"`
  and a hint to choose a vision model, instead of `ai.failed`; with cli-core's fix, moondream on Ollama reads pictures.
