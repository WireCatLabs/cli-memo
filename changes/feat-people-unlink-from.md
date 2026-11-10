### Changed — may break callers

- **`memo people unlink` names the person the identities leave, with `--from person:<uid>` or `--from person:me`.**
  It is required, and an identity that sits on someone else is refused with `identity.held-elsewhere`; the message
  names who holds it and nothing changes. Before, a script that meant to take a colleague's mailbox off your card
  took it off the colleague. A run without `--from` is refused with `person.from-required`. The `fix` of
  `memo people links check` ends in the `--from` it needs.
