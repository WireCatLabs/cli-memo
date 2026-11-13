### Fixed

- **`memo sync` finishes when the shared WireCat config starts with a byte-order mark.** A
  `~/.config/WireCat/config.json` saved by a Windows editor made the meaning-search step fail with "not valid JSON",
  so the sync ended incomplete. A config that cannot be read at all also no longer counts as the "read only" setup
  answer (cli-core 0.656.0).

### Changed — may break callers

- **Built on cli-core 0.656.0** (was 0.651.0). See the
  [cli-core changelog](https://github.com/WireCatLabs/cli-core/blob/main/CHANGELOG.md).
