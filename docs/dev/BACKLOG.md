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

- **MEMO-31** · P2 · Finish MCP alignment with the shared three-tool surface (WC-MCP-1): use cli-core
  `registerCommands` for `memo_tools_search`, `memo_read` and `memo_write`. The command coverage is generated,
  but the server still lists individual tools and keeps 37 handwritten compatibility handlers
  (`src/mcp/server.ts`, `src/mcp/catalogue.ts`). Plan the saved-client migration and retire duplicate handlers;
  retain richer evidence answers through the CLI service path.

- **MEMO-7** · P2 · `search all` and `context` do not read meetings; meetings need `search meetings` with one
  explicit `--source` (`skills/cli-memo/SKILL.md:104`). Add stored meetings to `search all` with coverage.
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
- **MEMO-29** · P2 · 🟡 Synthetic corpus, 50-question scorer and API cost plan are prepared in
  [cli-testing](https://github.com/WireCatLabs/cli-testing/tree/main/performance/agents/knowledge-graph-memory).
  Implement engine adapters and a metered pilot before comparing Memo, Hindsight, Graphiti and Cognee;
  paid model use still needs an agreed budget.
