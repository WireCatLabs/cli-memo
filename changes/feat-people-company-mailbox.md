### Added

- **`memo people company <id> [organization]` says a match's shared mailbox is a company's.** The address goes to the
  organization you name, else to the one that has the address or its company domain, else to a company of `--name`,
  else to a new company named after the domain. The two people are not joined and are not suggested again on that
  address. Only the owner answers it, as with `people confirm` and `people reject`
  ([people.md](../docs/people.md)).

- **`memo people review --json` shows `shared` and `mailbox` on a match.** `shared` is `role` for an address such as
  `info@` and `line` for a company's address; `mailbox` is that address. Both are `null` on other matches.

### Changed — may break callers

- **`memo people review` lists the highest score first.** Matches with no score and splits follow, newest first, as
  before.
