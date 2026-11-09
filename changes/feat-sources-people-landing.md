### Added

- **`memo sources suggest <ref>` has the reader you chose propose facts from a source.** Each fact comes with the
  exact words it rests on, checked against the stored text; a fact whose quote is not there is dropped, and one
  already stored from the source is named as `duplicate_of`. The rest wait as one findings batch citing the source,
  staged by `memo-reader`, that only you confirm (`memo actions confirm`), even with `agent_decisions` on. The same
  text read again by the same reader answers `reused: true` without asking it; `--rescan` asks again.
- **`memo sources readers list` and `memo sources readers set <reader> [--model]`.** The readers are Claude Code and
  Codex (your own sign-in, tools off, an empty folder), Ollama on this computer, and the OpenAI and Anthropic APIs
  with the key `memo models keys set` keeps. The list says for each whether it is ready, whether the text leaves this
  computer and whether it could read files; only you choose one, kept as `sources.reader` and `sources.model`, and
  memo never picks one. Over MCP, `sources suggest`, `sources readers set` and `models keys` are not offered.
- **`memo people show`, `review`, `scan`, `link`, `unlink` and `unmerge`: who is who across sources.** `show` gives a
  person's identities by source, the accounts that saw each with their scope, the merges and the open matches, naming
  the people as they are now; each match says its `signal`, the `identity` and `with` it names, and whether confirming
  `joins` the two people or moves one identity. `scan`, and every `memo sync` (`--only people`), joins people on the
  same email address in any scope when no third person has it and it is not a role address (`info@`, `support@` …),
  and on a phone number exactly two people have when one has it in Telegram, MAX or WhatsApp. A role address only
  proposes a match, and a no-reply address neither joins nor proposes anyone. A pair the owner rejected is never
  joined, but new evidence about it proposes it again; the rejected evidence never does. Other shared numbers and
  addresses, and a meeting guest's typed address, wait in `review`, which says `has_more` when `--limit` cuts it.
  `link` links for the owner; an agent's link waits for the owner as an `identity_link` match and needs `--reason`.
  `unlink` (one identity, or several to one new person, each by its exact id: a name is refused with
  `identity.not-found`) and `unmerge` are the owner's alone: an agent is refused (`identity.owner-only`), MCP does not
  offer them, and WireCat Desktop passes `--from-app`. `memo review kind:identity_link` lists the matches. They are
  owner-only, so an agent's `review confirm` is refused. `memo skill show proposals` is the agent's guide.
