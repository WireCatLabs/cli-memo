### Added

- **`memo sources add` reads an image with your AI model.** After `memo models ai set <provider> --model <m>
  --allow-remote`, a PNG, JPEG or WebP image up to 4 MB is sent to that model, and its text (or a short description when it
  has little text) is kept and searchable. The answer's `image` says `read_by`, or why the image is kept by its name
  only: `ai.not-set`, `ai.images-not-allowed`, `ai.key-missing`, `ai.owner-only` (an agent added it),
  `ai.setting-invalid`, `image.unsupported` or `ai.failed`. The image leaves
  this computer, except with Ollama. `memo models ai show|set|unset|remove|revoke|check` come from cli-core.

- **`memo sources readers set ai-model` reads sources with the same AI model and key.** One key and one model now
  serve images and facts: the reader uses what `memo models ai set` chose, and `leaves_computer` follows it (false for
  Ollama on this computer), and `model` names the one it read with. It takes no `--model`. WireCat Desktop offers it
  in «Чтение фактов» in place of its own key form.

### Fixed

- **`memo sources readers` works on a computer with no system keyring.** The reader keys fell back to nothing; they
  now use the 0600 file that `memo models keys set` writes there.
- cli-core 0.628.0.
