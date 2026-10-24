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

- **MEMO-23** · P1 · Remote MCP before launch: `memo mcp --http`, so Claude and ChatGPT on the web and phone can read
  and write memo through the owner's tunnel, as with tg and max. Owner ruling 2026-10-24 (cli-private journal
  NEED-1716, answer A). Starts at `src/mcp/command.ts:14` (stdio only today). tg and max already serve this: `mcp
  --http` logs in with a one-time access code (OAuth, token hashes per profile) and `--revoke` forgets every login;
  the user guide to copy is tg-cli `docs/remote.md`. cli-core has the pieces: `serveOverHttp`, `MCP_PATH` and
  `revokeAll` are exported from `@wirecat/cli-core/mcp` (`src/mcp/http/serve.ts`, `src/mcp/http/oauth.ts`;
  `ownerLogin` is used inside `serveOverHttp`, so the login needs no separate export). The tg and max wiring
  (`serveOverHttpUntilStopped`, the `--http`, `--port`, `--public-url`, `--revoke` flags) is in cli-core
  `src/cli/messenger/mcp-command.ts` and `src/mcp/server.ts`; it is messenger-specific and not exported, so memo
  copies the flag handling and the stop-on-Ctrl-C loop (about 60 lines) and passes its own `buildMcpServer`. **cli-core
  change: not strictly required, one small one recommended.** `publicUrlOf` and `portOf` (`src/http/public-url
 .ts`: https-only check, no path, port range) are not in any package export, so memo must copy them; exporting
  them from `@wirecat/cli-core/mcp` or `/cli` avoids a third copy. Both CLIs pin cli-core 0.406.0; cli-core main is
  0.407.0. Done when: `memo mcp --http --public-url https://<name>.ts.net` serves MCP behind the access-code login and
  prints the code; `--permission` keys and saved permissions still apply to every tool call over HTTP; `--revoke`
  works; a `docs/remote.md` page (copied from tg-cli `docs/remote.md`, memo wording) is linked from the README and the
  comparison page row "MCP over HTTP" (cli-docs `translations/pages/memo/compare.en.md:61`, and its MCP note at
  `:76`) turns ✅ for memo and the roadmap line
  (`docs/roadmap.md:35`) is removed.

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
