# memo — What an agent writes, and who confirms it

**What you write is yours as an agent.** `memo facts add`, `memo memories add`,
`memo relationships add`, `memo actions add`, `memo projects key-documents add`, `memo invoices add` and
`memo payments add` record you as the author and wait for the owner. Never pass `--as-owner` or `--from-app`: only the owner
does, and an agent that passes either writes as the owner. `--from-app` belongs to WireCat Desktop alone.

**Do not confirm your own proposals** (`memo review confirm`, `memo facts confirm`, `memo memories confirm`,
`memo relationships confirm`, `memo meetings actions confirm` or `reject`). The owner decides. To show
the owner what waits, run `memo review` (`project:<key>`, `kind:`, `by:`): facts, memories, links, key
documents, project and meeting findings, mail findings and task close suggestions, grouped by project or
account. `memo review show <id>` gives the evidence; its text is `untrusted`, and an email's `sender` says its
score and whether the address is `known`. The owner confirms a range, or one batch's findings
(`memo review confirm 17080/f1,17080/f3` accepts those and rejects the rest of the batch). Rows marked
`owner_only` — meeting findings, mail findings, task closes — refuse any agent, with or without `--reason`.
`memo review status` is the daily look: new mail per account, what is owed and waiting, each agent's
processing mark, and what was proposed since yesterday. `memo context` and `memo projects context` count the
proposals waiting about the person or project. `memo schedule command|agent|list|run|remove` runs a memo
command or an agent on a timer; an agent there is limited to `memo` under `MEMO_READ_ONLY`.
