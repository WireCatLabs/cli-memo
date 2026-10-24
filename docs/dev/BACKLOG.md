# Backlog

Open work only, P1 and P2, most important first. A finished item's line is deleted. P3 and someday work is in
[`BACKLOG_LATER.md`](BACKLOG_LATER.md). What memo does today: [`../commands.md`](../commands.md) (generated).
Plans and owner rulings live in the private notes (`cli-private`, `plans/`); this file names them by path.

## Rules

- **An id is permanent** and never reused. Take one with `bin/next-id MEMO`: one counter for every worktree on
  the machine, under a lock, and never below the highest number on any branch.
- **One item:** id · priority · the task as a title · where the work starts (`path:line` or a plan) · details.
  Long analysis goes to a plan in the private notes, never here.
- **Priority:** **P1** launch blocker: broken, tells users something untrue, install or first-run failure,
  security · **P2** this cycle · **P3** someday, in `BACKLOG_LATER.md`.
- **Mark:** none — not started · 🚧 `<branch>` — taken · 🟡 — half done, the rest named · ⏸️ — deferred by the
  owner · 🚩 — waits on an owner decision.
- **Claim before code:** put `🚧 <branch>` on the line in the first push of the branch.
- **Close in the PR that ships the work:** delete the line here in that PR. Users read what shipped in
  `CHANGELOG.md`.

## Launch blockers (P1)


## Next (P2)

- **MEMO-4** 🚧 `fix/memo-setup-20261024` · P2 · Search by meaning needs a model memo cannot download itself: every hint sends a memo-only
  user to `npx -y @wirecat/tg-cli local models text download e5-small` (a tg command with `local` as a profile
  word; works, 135 MB), and `sync` and `search` print two different hints. Give memo the shared
  `models text download` from cli-core, or one hint everywhere (`docs/installation.md:37`, `docs/search.md:184`,
  `docs/troubleshooting.md:28`).
- **MEMO-5** 🚧 `fix/memo-setup-20261024` · P2 · Adding a mail account means hand-editing `config.json` after setting up Himalaya
  (`docs/mail.md:31`). A `memo mail` command that adds and checks an account (Himalaya lists it, the address
  matches) would remove the hardest first-run step.
- **MEMO-7** · P2 · `search all` and `context` do not read meetings; meetings need `search meetings` with one
  explicit `--source` (`skills/cli-memo/SKILL.md:104`). Add stored meetings to `search all` with coverage.
- **MEMO-8** · P2 · Project gathering, next slices: source readiness (slice 1), context expansion with the
  merged Core #1700 (slice 2), optional semantic lane (slice 3). Core-led; memo hosts
  `projects evidence`. Plan: cli-private `plans/projects/2026-10-21-project-semantic-gathering.md`.
- **MEMO-9** · P2 · Search is slow: `memo search notes` takes 2.7 s on a two-note store with the model, and
  `memo --version` 0.85 s (measured 2026-10-23, 0.89.0). Profile startup and model load; try Node's compile cache
  as tg did.
- **MEMO-10** 🚧 `fix/memo-setup-20261024` · P2 · Shared meeting readers differ from zm: `search meetings`, `meetings passage` and
  `meetings prepare` take other flags and summaries than `zm` (41 new `same-path-contract` findings in
  `cli-dev audit` against tg 0.81, max 0.69, drive 0.23, zm 0.36). Align in cli-core, or record why they differ.
- **MEMO-11** · P2 · `memo context telegram:<unknown>` answers "choose one of folder:<id>": it offers a notes
  folder as the Telegram account. List only accounts of the asked provider, or say there are none.
- **MEMO-12** · P2 · `memo auto status` reads the user's systemd timer even when `HOME`/`MEMO_CONFIG_DIR` point
  elsewhere, so it reports a timer `active` while `memo doctor` says `timer off` for that config. Make the two
  agree on whose timer it is.
- **MEMO-14** · P2 · The site lags: cli-docs pins memo `v0.83.0` (npm 0.89.0), memo has no entry in
  `docs/release-notes-review.json`, and the new `docs/roadmap.md` needs adding to the site's memo pages.
  Work is in WireCatLabs/cli-docs `tools.json`.
- **MEMO-15** · P2 · Open PRs to settle: five Dependabot bumps (#364, #360, #174, #172, #169) and the docs PR #118
  (skill: search again in other words), open since 2026-10-13.
- **MEMO-29** · P2 · A memory-quality benchmark on synthetic data (known answers), so memo can be compared with
  Hindsight, mem0 and Graphiti, who publish LongMemEval scores. In cli-testing `performance/agents/`.
