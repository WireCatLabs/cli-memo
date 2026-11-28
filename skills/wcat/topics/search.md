# wcat — Searching in depth: commands, accounts, fields, references and windows

Find a command with `wcat commands` (all of them, by section), then read just that one with its path:
`wcat commands search notes --json`. A path, not a keyword. `wcat <command> --help` works too.
`wcat guide` lists scenarios, command sequences for common tasks (`wcat guide person-brief --json`).
`wcat skill show` prints the installed binary's instructions; `wcat skill install` refreshes copies.
Use `--json=ref,excerpt` for compact search hits. Dotted paths select nested objects and arrays;
pagination, coverage, next steps, missing data and execution metadata remain. Start with a bounded
`--limit` and expand when coverage requires it. Projection reduces output, not the work scanned.

**Honor account scope.** A read names accounts with `--source`: `telegram:1`, `email:work`, a provider, a kind or
`group:<name>`. A write names the one account it acts as with `--account telegram:1`. Reuse the owner's selected
account; if wcat refuses an ambiguous selection and lists candidates, ask which one. Cross-account reads state their
coverage in `meta.accounts`. A group word first (`wcat <group> search all …`) reads only that group's accounts;
`all` is every account; bare `--source personal` is the owner's own messenger accounts, not a group.

**A client, a person or a deal.** Resolve one ref: `wcat search people <name>`, `wcat organizations list`,
`wcat deals list`. Read its context: `wcat context person:<id>`, `wcat organizations context <ref>`,
`wcat deals context <ref> --brief`. Follow only the relationships the question needs
(`wcat relationships list kind:reports-to to:<ref>`), then search for evidence with `wcat search all '<words>'`.
Cite the refs and name each gap in `coverage`. `reported` is a CRM's word only: say so. Never guess a gap.
`wcat groups list` shows which accounts each group holds.

**`content:` narrows a search to the text of files, `filename:` to their names.** Whether a plain word
also reads file text and voice transcripts depends on the version. Compare like with like:
`wcat search messages 'content:invoice'` with `tg personal search messages 'content:invoice'`, a plain word
with a plain word.

**Every answer is `item` (one thing) or `items` with `page` (a list), plus `meta`.** References:
every search's `items[].ref`. Pass a reference back unchanged. A search names its fields, so
`--json=ref,excerpt` keeps those and refuses one it does not have. `missing` says what was not searched and why.
A list narrows by field:value terms after its arguments, not by flags: `wcat facts list kind:decision
status:proposed`; its `--help` names the fields.
Who a note links to: `wcat context <person>`.

**Search again in other words before saying the answer is absent.** Try a document title, the sender's
term, one or two key words, a synonym or the other language. A paraphrase can miss even with search by
meaning. After two or three tries, say what you searched for.

```sh
wcat search people <name> --json                 # who: person:<id> for --contact, across every account
wcat context telegram:<id or name> --json        # one person: messages, mail, events, notes, tasks
wcat projects context <key> --json               # one project: key documents first
wcat projects status <key> --compact             # whose move, open asks, money; next names the chats to read
wcat search all '<words>' --project <key> --json # everything, the project's key documents first
wcat search all '<words>' --only meetings --json  # every meeting account; next opens each transcript hit
wcat search messages 'content:invoice' --json    # inside files
wcat search mail '<words>' --source email:<name> --json # add NOT mailbox:bulk when newsletters crowd it
wcat commands search messages --json             # one command's contract, by its path
wcat show chat:max/<account>/<chat> note:<id>    # what any reference is, and the command that opens it
wcat search messages '<words>' --compact         # one line per hit, each with its reference
wcat projects evidence <project> --source all --compact # the evidence as rows, every reference kept
```

**Business data is a lane of `search all`** (`--only business`): invoices, payments, orders, contracts,
subscriptions, products and wallets, found by the words of their numbers and names only, so a query with an operator
(`inv?ice`, `-budget`, `budg*`) leaves them out with a reason in `meta.issues`. A hit an import made names its
source's provider and account. Bank transactions are not in it: `wcat transactions list` filters them. Deals and
leads are their own lane. When the owner denies `business.list` to the MCP server, the lane is left out and
`meta.issues` says so; `--only business` is then refused.

Cite each result by its reference (`msg:…`, `note:…`, `document:…`) so the owner can open it.
`wcat show <ref>` tells what any reference is and the command that opens it; a bare number is refused with the
reference it may mean. Read with `--compact`: one line per item, every reference kept, paging and next steps as `#`
lines; `--json` when you need the fields. Never write message, mail or note text to a file.

Use `--before-time <ISO timestamp with UTC offset>` (MCP `before_time`) to repeat an exact exclusive end time;
days back count from it. Keep it on continuation. The window is fixed, but archive contents, aliases
and account scope may change: retain actual references, source fingerprints and coverage separately.

**Before reporting a bug, compare `wcat --version` with `npm view @wirecat/wirecat version`.** An
older install may lack the fix.

**When something seems missing or broken, run `wcat doctor --json` first.** It reads this computer only and
lists each problem with the command that fixes it. A sync failure with reason `mail.throttled` means Gmail is
limiting the account: wait an hour or more, do not retry in a loop.

## Sources the owner hands you

Pasted text, a call's notes: `printf '%s' '<text>' | files sources add - --title '<title>' --subject <ref> --json`. It
answers a `document:<id>` you can cite; your subjects wait for the owner. A file or a public page the owner
names: `files sources add <path|url>` (over MCP, text only). Only the owner removes a source. `files sources mentions <ref>` lists the people and
organizations named in it; `files sources show <ref>` its text and what cites it. `files sources suggest <ref> --json`
has the reader the owner chose propose facts, each quote checked against the text, as a batch only the owner
confirms; never pass `--provider` or `--model`, and never run `sources readers set` or `models keys`.
