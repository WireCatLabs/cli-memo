### Changed — may break callers

- A sender bot's reference is `bot:<id>`, as cli-core names it from 1.3. `memo bots show`, `memo bots move` and `--into`
  still take the old `sender-bot:<id>`. An agent's reference is now `agent:<id>`, and its type in JSON is `"agent"`
  where it was `"bot"` (`author`, `proposed_by`, `created_by`). See [people](../docs/people.md).
