# cli-memo — working rules

`memo` joins what the owner knows about a person across tg, MAX, notes and mail. Messages live in the
shared store of [`@wirecat/cli-core`](https://github.com/WireCatLabs/cli-core); this repository
reads notes, reads the mail the `mail` CLI stores there, and answers.

The [WireCat CLI standards](https://github.com/WireCatLabs/cli-base/blob/main/docs/standards/README.md)
apply here and win over this file; it keeps only memo's own rules.

Security audits of this repository follow the shared
[security method](https://github.com/WireCatLabs/cli-testing/tree/main/docs/security) in cli-testing;
vulnerabilities are reported as the
[security policy](https://github.com/WireCatLabs/.github/blob/main/SECURITY.md) says.

## The constraints that shape everything

1. **This repository is public; the owner's data is not.** No real name, address, subject, note or
   message in a fixture, test name, commit, issue or document — synthetic data only. Plans and the
   session journal live in the private `cli-private` repository, never here.
2. **No test reaches the owner's store, vault, mailbox or config.** `test/sandbox.ts` points
   `MESSAGING_STORE`, `HOME` and the XDG folders into a temp folder for every test
   file; do not weaken it.
3. **memo never opens a mailbox.** Everything mail-specific (adding a mailbox, sign-in, sync, import, inspect,
   sender scoring, rules, cleanup) belongs to the `mail` CLI, and memo's old commands for it only name their
   replacement; memo keeps what spans sources (search, `messages show`, linking, mail findings, the mail-triage
   skill). Source notes are never changed. No test may use the owner's mailbox.
4. **Pin `@wirecat/cli-core` to an exact published version compatible with the other store consumers.**
   Compatible SDK updates may be adopted independently after reviewing intervening changelog entries
   and store compatibility. Changes that raise `minCompatible` or break shared consumer contracts
   require coordinated rollout under the shared standards.
5. **Shared chunking and embedding live in `cli-core` and are changed there**, through its own
   worktree, pull request and release rules. Mail transport and Google sign-in stay out of it; only
   its public `./store` export is used for storage.
6. **Deletions are honoured.** A note deleted at the source loses its text in the store on the next
   import.

## Comments

Sparse, and only *why*. The global rule in `~/.claude/CLAUDE.md` applies.

## Committing

Conventional commits, a branch off `main`, a pull request. The pre-commit hook checks staged lint and secrets; no other local checks are required by default.

A change a caller can see gets a changelog fragment: a new file `changes/<branch>.md` (lower case, `/` as `-`) with
one or more of the five headings of
[WC-DOC-15](https://github.com/WireCatLabs/cli-base/blob/main/docs/standards/docs.md#wc-doc-15--changelog-entries-go-under-five-fixed-headings-each-at-most-once-per-section)
and the entries under them, written as they will read in `CHANGELOG.md`, with links relative to `changes/`
(`../docs/…`). Do not edit `## Unreleased`: every open pull request edits the same lines there and conflicts at each
merge. `pnpm docs:check` checks the fragments; `bin/release` collects them into the version's section and deletes
them in its pull request. Older released sections keep the headings they shipped with. Releasing is `bin/release` on
`main`.

```md
### Fixed

- **`memo mail sync` names what it skipped.** Why it matters and what a caller does about it.
```

## Documents

They state the current facts only
([WC-DOC-3](https://github.com/WireCatLabs/cli-base/blob/main/docs/standards/docs.md#wc-doc-3--every-document-states-current-facts-rewrite-a-wrong-sentence-in-place)).
`CHANGELOG.md` is the one place for history.

## Before a release that changes how mail is indexed

A change that rewrites many stored emails (a rule change, a re-import) queues their
threads for the search index, and the next `memo sync`, often the timer's, works through that queue while it holds
the import lock. Before releasing such a change, or a cli-core bump that touches indexing or vector cleanup, run
cli-testing's [`performance/mail/indexing/run.sh`](https://github.com/WireCatLabs/cli-testing/tree/main/performance/mail/indexing)
against a built cli-core checkout. It copies the store first and writes only under `~/.cache`. A queued thread
should drain in well under a millisecond and an email with text in a few.

## Development check budget

Hooks, pull request CI and full validation follow the handbook's
[CI rules](https://github.com/WireCatLabs/cli-base/blob/main/docs/standards/ci.md). Here `ci:quick` is
`pnpm typecheck && pnpm build && pnpm lint:commands`.
