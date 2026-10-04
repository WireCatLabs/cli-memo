# cli-memo — working rules

`memo` joins what the owner knows about a person across tg, MAX, notes and mail. Messages live in the
shared store of [`@leemour/cli-messaging`](https://github.com/leemour/cli-messaging); this repository
reads notes, imports mail into that store, and answers.

## The constraints that shape everything

1. **This repository is public; the owner's data is not.** No real name, address, subject, note or
   message in a fixture, test name, commit, issue or document — synthetic data only. Plans and the
   session journal live in the private `max-cli-private` repository, never here.
2. **No test reaches the owner's store, vault, mailbox or config.** `test/sandbox.ts` points
   `MESSAGING_STORE`, `HOME`, the XDG folders and `HIMALAYA_CONFIG` into a temp folder for every test
   file; do not weaken it.
3. **Read only.** Mail is never sent, flagged or moved; notes are never changed.
4. **`@leemour/cli-messaging` is pinned to the exact version tg and max pin.** Opening the store runs
   its migrations, so a newer version here would move the owner's file ahead of the messengers.
5. **Changes to `cli-messaging` are proposed there, not patched from here.** Mail transport and Google
   sign-in stay out of it; only its public `./store` export is used.
6. **Deletions are honoured.** A mail deleted at the source loses its text in the store on the next
   import.

## Comments

Sparse, and only *why*. The global rule in `~/.claude/CLAUDE.md` applies.

## Committing

Conventional commits, a branch off `main`, a pull request. Before committing:

```sh
pnpm lint && pnpm typecheck && pnpm test
```

A change a caller can see gets a `CHANGELOG.md` entry under `## Unreleased`. Releasing is `bin/release`
on `main`, once the first release is agreed.
