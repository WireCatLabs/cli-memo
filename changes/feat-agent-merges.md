### Added

- **An agent's `memo people link` merges at once on strong evidence**, and only uncertain matches wait for you. Memo
  decides, never the agent's word: one mobile number or personal address that only these two people have, from two
  different sources, and for a phone at least one of them a messenger or a call. The answer is `merged` with the
  evidence and the merge id, or `proposed` with `evidence.weak` saying why it waits. `people show` names the agent,
  run, reason and evidence of each agent's merge, and `memo people unmerge` undoes it. `agent_merges: propose` makes
  every agent's link wait as before ([configuration](../docs/configuration.md#agent_merges)).
- **`memo people review` carries the context to decide.** Each match says what the two people share and why it is
  not strong (`strength`), and `sides`: each person's identities by source, last messages or calls with dates,
  companies and deals; `--full` adds phones, addresses, accounts and more text, and `--brief` leaves the sides out.
  `--kind merged` lists the agents' merges still in place, each with the command that undoes it
  ([people](../docs/people.md#link-a-persons-accounts)).
