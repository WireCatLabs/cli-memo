### Added

- **`wcat review subscriptions list`.** The newsletters and lists you get: mail sent to many readers, one row per list
  (`List-Id`), or per sender when there is none, newest first, with its mail count, its newest mail and where to
  unsubscribe (an https or mailto address its sender's domain signed, and whether one click does it). `type:` keeps
  one mail type, `--source` some mailboxes, `--limit` and `--page` page it. wcat never unsubscribes. See
  [Newsletters and lists](../docs/mail.md#newsletters-and-lists-you-are-subscribed-to).
- **`wcat bots list type:`** filters bots by what they send: `alerts`, `receipts`, `newsletters`, `marketing` or
  `messenger`. See [Bots](../docs/people.md#bots).
