### Added

- **`memo people delete` deletes a person and what memo knows of them alone.** Without `--yes` it shows what would
  go (their identities, the tags, links and mentions that name them, what stays without them) and changes nothing.
  Messages, mail and meetings stay with their source. Refused for your own person and while an invoice, order or
  subscription names them. Only you run it. See [Delete a person](../docs/people.md#delete-a-person).

### Fixed

- **`memo records clear` also deletes the people only that import made.** A person you tagged or gave a task to, or
  one another source knows, stays.
