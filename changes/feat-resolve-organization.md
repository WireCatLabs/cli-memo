### Added

- **`memo people resolve <id> organization` makes both "people" on a match a company's mailboxes.** For a match such
  as two contacts named after a company at its domain: every address on the match goes to one organization (the one
  named, else one with an address or the domain, else `--name`, else a new one named after the people's shared name
  or the domain; free mail needs `--name` or the organization). People who are only those addresses leave the people
  list as the company's; people with other identities keep them. The match closes; `--json` gives `organization`,
  `mailboxes`, `people` and `closed`. See [people](../docs/people.md).
- **The `proposals` skill topic says how an agent sorts the owner's matches.** "Sorting the owner's matches for him":
  gather evidence, sort each match into one person, different people, one company or unsure, and hand the owner at
  most three commands to run.
