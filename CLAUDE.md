# cli-memo — working rules

`memo` joins what the owner knows about a person across tg, MAX, notes and mail. Messages live in the
shared store of [`@wirecat/cli-core`](https://github.com/WireCatLabs/cli-core); this repository
reads notes, imports mail into that store, and answers.

Security audits of this repository follow the shared
[security method](https://github.com/WireCatLabs/cli-testing/tree/main/docs/security) in cli-testing;
vulnerabilities are reported as the
[security policy](https://github.com/WireCatLabs/.github/blob/main/SECURITY.md) says.

## The constraints that shape everything

1. **This repository is public; the owner's data is not.** No real name, address, subject, note or
   message in a fixture, test name, commit, issue or document — synthetic data only. Plans and the
   session journal live in the private `cli-private` repository, never here.
2. **No test reaches the owner's store, vault, mailbox or config.** `test/sandbox.ts` points
   `MESSAGING_STORE`, `HOME`, the XDG folders and `HIMALAYA_CONFIG` into a temp folder for every test
   file; do not weaken it.
3. **Read only.** Mail is never sent, flagged or moved; notes are never changed.
4. **`@wirecat/cli-core` is pinned to the exact version tg and max pin.** Opening the store runs
   its migrations, so a newer version here would move the owner's file ahead of the messengers.
5. **Shared chunking and embedding live in `cli-core` and are changed there**, through its own
   worktree, pull request and release rules. Mail transport and Google sign-in stay out of it; only
   its public `./store` export is used for storage.
6. **Deletions are honoured.** A mail deleted at the source loses its text in the store on the next
   import.

## Comments

Sparse, and only *why*. The global rule in `~/.claude/CLAUDE.md` applies.

## Committing

Conventional commits, a branch off `main`, a pull request. The pre-commit hook checks staged lint and secrets; no other local checks are required by default.

A change a caller can see gets a `CHANGELOG.md` entry under `## Unreleased`. Releasing is `bin/release`
on `main`, once the first release is agreed.

## Documents

They state the current facts only: a changed fact is rewritten with no mark, and git keeps the old
text. `CHANGELOG.md` is the one place for history.

## Before a release that changes how mail is indexed

A memo command that rewrites many stored emails (`mail rules apply`, a rule change, a re-import) queues their
threads for the search index, and the next `memo sync`, often the timer's, works through that queue while it holds
the import lock. Before releasing such a change, or a cli-core bump that touches indexing or vector cleanup, run
cli-testing's [`performance/mail/indexing/run.sh`](https://github.com/WireCatLabs/cli-testing/tree/main/performance/mail/indexing)
against a built cli-core checkout. It copies the store first and writes only under `~/.cache`. A queued thread
should drain in well under a millisecond and an email with text in a few; PERF-42 (2026-10-15) was 68 ms a thread,
which held the lock for hours after 44,000 emails were cut to envelopes.

## Development check budget

Local commits check only staged lint and secrets. There is no pre-push check.
Config integrity, repository lint, Markdown, and secret detection run in PR CI.
The bounded `ci:quick` step adds typechecking, a build and the command lint for CLI packages or synthetic unit tests for the docs site.
Full tests, coverage and builds also run once on each merge to `main` (Linux only, no publishing).
Browser and platform suites run for releases, explicit manual validation, and monthly nonpublishing
validation. See the
[shared policy](https://github.com/WireCatLabs/community/blob/main/standards/README.md#ci-and-hooks).
