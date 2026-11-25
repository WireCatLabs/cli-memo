### Added

- **`memo bots list`, `memo bots show` and `memo bots move`.** A bot, a program that writes to you, is now kept apart
  from people (`sender-bot:<id>`), so `people list kind:automated` no longer shows it. `bots list` finds bots by a part
  of a name, address or username (`name:`) or by the organization they send for (`organization:`), a page at a time.
  `bots show` adds every move to or from a bot. `bots move <who> --kind bot|person` is your correction: it moves the
  sender's whole history, past and future, no rule moves it back, and moving it the other way undoes it. Only you can
  run it; an agent's move is refused. See [Bots](../docs/people.md#bots).
- **`memo domain-lists update` and `memo domain-lists list`.** They download and show WireCat's pack of bank, shop,
  news and spam domain lists, which give more organizations a sector. Sender domains are matched on this computer
  only. `--commercial-only` leaves out the lists a paid service may not use, and `--offline` refuses the download.

### Changed — may break callers

- **memo runs on cli-core 1.1.0** (was 1.0.0). The first open moves the store to version 76: bots get their own table
  (version 75) and each email gets a type and a reach (version 76). Both are added only, so a tool still on cli-core
  1.0 keeps opening the store, but its views list no bots: upgrade memo and WireCat Desktop together. See
  [cli-core's changelog](https://github.com/WireCatLabs/cli-core/blob/main/CHANGELOG.md).
