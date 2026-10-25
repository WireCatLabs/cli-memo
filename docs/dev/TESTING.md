# Testing

`pnpm test` runs the suite against a sandboxed home, config, state and store (`test/sandbox.ts` and cli-base's
shared test setup): no real keyring, no network. Full validation runs it on Linux; on Windows the mail sync
tests still fail, so the Windows and macOS job is off.

## Test matrix

[test-matrix.md](test-matrix.md) lists every command and option and whether a test drove it through the CLI. The
suite records each parsed command in `coverage/argv.jsonl` (`test/argv-trace.ts`); `pnpm test:matrix` rebuilds the
page from that log. A command or option that is not tested on purpose gets its reason in
`scripts/test-matrix-untested.ts`. Full validation runs `pnpm test:matrix:check` after the suite and fails when the
committed page is stale. It does not yet fail on a ❌ row: many shared commands that memo mounts from cli-core are
tested in cli-core, and each still needs its test named here.

## Contracts

`contracts/` holds the offline contracts that full validation runs: `pnpm contracts:check` (help, discovery, errors
and the MCP tool list), `pnpm contracts:upgrade` (a note written by the last published memo is read by this build)
and `pnpm security:no-leak`. Update a snapshot only on purpose: `pnpm exec cli-contract contracts/plan.json --update`.

## Shared meeting grammar and lint

Memo mounts cli-core's complete meeting search grammar, as zm does. The shared vocabulary does not yet name
its `--meeting-id`, `--identity-id`, `--person-id`, `--series-id` or `--tag` roles, and reserves `--topic <id>`
for messenger topics while meeting search uses named knowledge topics. The command lint baselines match zm's
existing exceptions for these shared flags. Keep the parsers aligned; resolve their shared vocabulary in
cli-core/cli-base rather than renaming the flags in one host.

## A version pull request skips the full validation

A pull request that changes only `CHANGELOG.md` and the version in `package.json` and `src/version.ts`, against a
`main` whose pull request passed every required check on the same tree (bin/release's version pull requests), runs
`pnpm version:check` and `pnpm docs:check` instead, and reports the other required `validation / …` checks as
passed, saying why ([`scripts/ci-unchanged.sh`](../../scripts/ci-unchanged.sh),
[`scripts/ci-fingerprint.sh`](../../scripts/ci-fingerprint.sh)). The push to `main` that follows runs the full
validation.
