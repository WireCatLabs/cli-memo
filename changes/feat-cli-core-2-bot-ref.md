### Changed — may break callers

- A sender bot's reference is `bot:<id>`, as cli-core names it from 1.3. `memo bots show`, `memo bots move` and `--into`
  still take the old `sender-bot:<id>`. An agent's reference is now `agent:<id>`, and its type in JSON is `"agent"`
  where it was `"bot"` (`author`, `proposed_by`, `created_by`). See [people](../docs/people.md).
- **memo runs on cli-core 2.0.0** (was 1.1.0). The first open moves the store to version 78, and a tool on cli-core
  1.x then refuses it, so memo 0.154.0 cannot open a store that another 2.0 tool already moved. Upgrade memo, the
  other WireCat CLIs and WireCat Desktop together. Mail search shows each email's type and reach after its labels. See
  [cli-core's changelog](https://github.com/WireCatLabs/cli-core/blob/main/CHANGELOG.md).
