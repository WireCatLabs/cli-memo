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

None.

## Next (P2)

- **MEMO-34** · P2 · 🟡 `memo deals` over cli-core's personal CRM tables (slice B2), once CORE-45 ships. Records,
  invoices, payments and the money block in `projects status` shipped in #584, #586 and #588. The commands live in
  memo (owner, NEED-2161 A). cli-private `plans/2026-11-02-business-ingestion.md` (TASK-886) §4.7.
- **MEMO-35** · P2 · Memory that follows its sources: propose evidence-backed facts and memories from new source
  records, merge an equivalent one instead of adding a twin, and mark a confirmed memory for review when a source it
  cites changes (today `memories invalidate` is manual). Proposals go through the proposal registry and `memo review`
  (#574). Plan: cli-private `plans/2026-11-02-context-direction.md` §7.
- **MEMO-8** · P2 · Project gathering, next slices: source readiness (slice 1), context expansion with the
  merged Core #1700 (slice 2), optional semantic lane (slice 3). Core-led; memo hosts
  `projects evidence`. Plan: cli-private `plans/projects/2026-10-21-project-semantic-gathering.md`.
- **MEMO-9** · P2 · Search is slow: `memo search notes` takes 2.7 s on a two-note store with the model, and
  `memo --version` 0.85 s (measured 2026-10-23, 0.89.0). Profile startup and model load; try Node's compile cache
  as tg did.
- **MEMO-11** · P2 · `memo context telegram:<unknown>` answers "choose one of folder:<id>": it offers a notes
  folder as the Telegram account. List only accounts of the asked provider, or say there are none.
- **MEMO-12** · P2 · `memo auto status` reads the user's systemd timer even when `HOME`/`MEMO_CONFIG_DIR` point
  elsewhere, so it reports a timer `active` while `memo doctor` says `timer off` for that config. Make the two
  agree on whose timer it is.
- **MEMO-29** · P2 · 🟡 🚩 Synthetic corpus, 50-question scorer and API cost plan are prepared in
  [cli-testing](https://github.com/WireCatLabs/cli-testing/tree/main/performance/agents/knowledge-graph-memory).
  Widened 2026-11-02: also Hermes alone, Hermes + Hindsight and Hermes + Memo, then OpenClaw (cli-private
  `plans/2026-11-02-competitive-test-plan.md`). The no-cost Memo retrieval baseline is done (cli-testing #286);
  paid model use waits for the owner's budget (NEED-2155).
