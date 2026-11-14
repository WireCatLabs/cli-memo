### Changed — may break callers

- **A `readonly` level no longer stops a sync** (cli-core 0.662.0, was 0.661.0). A command that only fetches from a
  service into the local store runs at `readonly`; `deny` still refuses it. Commands that write the owner's files or
  call another service stay blocked by `readonly`.
- **`memo models ai check` counts as reaching another service** (cli-core 0.662.0), so `readonly` stops its paid
  request to the model provider.
