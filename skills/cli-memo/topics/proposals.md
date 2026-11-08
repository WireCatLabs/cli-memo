# memo — What an agent writes, and who confirms it

**What you write is yours as an agent.** `memo facts add`, `memo memories add`,
`memo relationships add`, `memo actions add`, `memo projects key-documents add`, `memo invoices add`,
`memo payments add`, `memo orders add`, `memo contracts add` with an amount, `memo subscriptions add`,
`subscriptions prices add` and `memo transactions add` record you as the author and wait for the owner. Products,
wallets, deals and leads are written at once; only the owner sets a wallet's opening balance. Never pass `--as-owner`
or `--from-app`: only the owner does, and an agent that passes either writes as the owner. `--from-app` belongs to
WireCat Desktop alone.

**Do not confirm your own proposals** (`memo review confirm`, `memo facts confirm`, `memo memories confirm`,
`memo relationships confirm`, `memo meetings actions confirm` or `reject`). The owner decides. To show
the owner what waits, run `memo review` (`project:<key>`, `kind:`, `by:`): facts, memories, links, key
documents, project and meeting findings, mail findings, task close suggestions, and money (`kind:invoice`,
`payment`, `order`, `contract`, `subscription`, `subscription_price`, `transaction`), grouped by project or account. `memo review show <id>` gives the evidence; its text is `untrusted`, and an email's `sender` says its
score and whether the address is `known`. The owner confirms a range, or one batch's findings
(`memo review confirm 17080/f1,17080/f3` accepts those and rejects the rest of the batch). Rows marked
`owner_only` — meeting findings, mail findings, task closes, source reviews — refuse any agent, with or without `--reason`.
`memo review status` is the daily look: new mail per account, what is owed and waiting, each agent's
processing mark, and what was proposed since yesterday. `memo context` and `memo projects context` count the
proposals waiting about the person or project. `memo schedule command|agent|list|run|remove` runs a memo
command or an agent on a timer; an agent there is limited to `memo` under `MEMO_READ_ONLY`.

**When a source changes.** A `memory_source_review` says a memory or fact may no longer hold: a source changed,
went, was replaced, or someone challenged it. `memo memories check --since-time 1d --json` looks again (sync does it
too) and answers `changed_refs`, changed sources no findings batch reads yet, including those an earlier run found: read them and stage what is new with
`memo projects actions add`. When evidence contradicts a record, run
`memo memories challenge <ref> --evidence <refs…> --reason <why> [--suggest <text>]` (or `memo facts challenge`); it
only opens the owner's review. Quote what a source says with `--quote <ref>=<words>` on `memories add` and
`facts add`, so an edit that keeps those words raises nothing. Never confirm or reject a source review: tell the
owner `memo review show <id>`.
