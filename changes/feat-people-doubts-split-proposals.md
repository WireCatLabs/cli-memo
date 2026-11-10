### Added

- **`memo people links check` lists people that may be wrong**, you first: your own person holding an identity under
  another name (a partner's mailbox, a spouse's messenger), test data, an identity joined by an address a person of
  another name has, and one person with different names and nothing in common. Each says why, the evidence, and the
  `unlink` or `unmerge` that would fix it. `--limit`, `--page` and `--json`. See [People](../docs/people.md#people-that-look-wrong).
- **An agent's `memo people unlink` and `memo people unmerge` propose instead of being refused.** They need
  `--reason` and wait in `memo people review` (and `memo review`) as a split; only you carry one out. MCP now offers
  both commands to agents, as proposals.
- **`memo people confirm` and `memo people reject`** answer matches and splits by id or range, or `all` that
  `people review` lists; `all` shows what it would do until `--yes`. Only you; MCP does not offer them.
- `memo people review` lists splits beside matches, each row with its `kind`, and takes `--kind link|split|all`. A
  split row names one `person`, never a `persons` pair.

### Fixed

- **`memo people show person:me` shows you**, instead of saying nobody matches.
- **`memo people show` prints how, by whom and when each merge was made**, as its JSON already said.
