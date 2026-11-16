### Fixed

- **memo starts on cli-core 0.680.0 and cli-base 0.106.0.** The shared `skill show` now takes `[name]`, a part of
  the skill or a skill shipped for a task, so memo's reviewed overrides of the shared `skill` command name that
  argument. Before this, memo refused to start against cli-core 0.680.0 with `contract.unacknowledged-override`.
