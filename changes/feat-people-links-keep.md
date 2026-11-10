### Added

- **`memo people links resolve <person> keep` says a person `people links check` doubts is right as they are.** The
  identities in doubt stop being listed until one of them moves to another person; an identity that joins later is
  checked again, and an agent's split of the kept ones is refused. Only the owner runs it; WireCat Desktop passes
  `--from-app`. `--json` answers `{ "person": "person:<uid>", "kept": ["<provider>:<id>", …] }`.
- **`memo people show --json` gives `display_name`**, the name `people list` shows for the person: their own, else the
  first readable account name, a username, phone or address.

### Fixed

- **`memo people links check` no longer lists a person you linked by hand under mixed names.** The identities the
  person held when you linked another to them count as seen by you; one that joins later is still checked.
