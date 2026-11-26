### Added

- **`memo mail subscriptions list`.** The newsletters and lists you get: mail sent to many readers, one row per list
  (`List-Id`), or per sender when there is none, newest first, with its mail count, its newest mail and where to
  unsubscribe (an https or mailto address its sender's domain signed, and whether one click does it). `type:` keeps
  one mail type, `--source` some mailboxes, `--limit` and `--page` page it. Memo never unsubscribes. See
  [Newsletters and lists](../docs/mail.md#newsletters-and-lists-you-are-subscribed-to).
- **`memo bots list type:`** filters bots by what they send: `alerts`, `receipts`, `newsletters`, `marketing` or
  `messenger`. See [Bots](../docs/people.md#bots).

### Changed — may break callers

- **memo runs on the cli-core release that carries cli-core#3379** (was 1.1.0; the version is set when it is out).
  It brings the subscriptions read, the kept List-Unsubscribe addresses and the bots filter. See
  [cli-core's changelog](https://github.com/WireCatLabs/cli-core/blob/main/CHANGELOG.md).
