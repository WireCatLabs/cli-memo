### Added

- **`memo context` lists the recorded calls and meetings a person took part in, in `meetings`**, beside `events`:
  each with its `meeting:` ref, account, title, start, length and whether it has a transcript. `meetings show` of the
  CLI that owns the account opens one. From cli-core 0.650.0, which also links a call to the CRM contact with the same
  phone.

### Changed — may break callers

- **A model address WireCat refuses now answers the reason `model.address-refused`, not `ai.address-refused`.** From
  cli-core 0.650.0, in `memo models ai set`, `memo answers create --analyze` and every other call to a model. A
  script that checks the old name checks the new one.

### Fixed

- **`memo store recover run --json` prints JSON.** It printed the text report: `store recover` has a `--json` of its
  own, and it took the flag. A script or WireCat Desktop reading the answer now gets the JSON object.
