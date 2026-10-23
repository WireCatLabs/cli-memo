# Backlog — later

P3: nice to have, research and someday work. Same rules and ids as [`BACKLOG.md`](BACKLOG.md). When an item
becomes P2, move its line there. A finished item's line is deleted.

- **MEMO-16** · P3 · Project gathering phase 5: a full project export and restore, beyond the selected aliases,
  facts and links that `projects annotations export|check|restore` move today. Plan: cli-private
  `plans/projects/2026-10-18-project-gathering.md` (phases 5–6).
- **MEMO-17** · P3 · Project gathering phase 6: optional AI analysis of an evidence bundle through the existing
  model gateway, with a structured change report. Same plan.
- **MEMO-18** · P3 · Project gathering slices 4–5: order answer support (questions vs decisions) and a frozen
  evaluation pilot. Plan: cli-private `plans/projects/2026-10-21-project-semantic-gathering.md`.
- **MEMO-19** · P3 · Merge duplicate tags: `vocabulary inspect` previews a consolidation (`apply_supported:
  false`); no command applies one. Plan: cli-private `plans/2026-10-18-label-consolidation-design.md`.
- **MEMO-20** · P3 · Reminders on a project's own tasks: "A task in a project cannot have a reminder yet"
  (`README.md:146`).
- **MEMO-21** · P3 · Remove the deprecated `--account`/`--provider` from the 34 read commands that now take
  `--source`, in a release marked "Changed — may break callers" (`memo commands --json`).
- **MEMO-22** · P3 · macOS and Windows: tests run on Linux only (`docs/installation.md:27`), and the unit suite
  is known to fail on Windows. Add a platform job before claiming support.
- **MEMO-23** · P3 · `memo mcp --http` and `--permission`, as tg and max have, so a local app (such as a future
  visual map of the store) can use memo without a terminal. Core has `serveOverHttp` (`@wirecat/cli-core/mcp`).
- **MEMO-24** · P3 · Command names outside the shared vocabulary: 16 verbs and 7 resources in `lint/baseline/`
  (`mail trash`, `mail runs`, `reminders poll`, …). Rename, or add them to cli-base's vocabulary; cli-base's
  central `audit/baseline` also lacks memo's `mail trash`, `mail runs` and `mail rules import-filters`.
- **MEMO-25** · P3 · Image search by context, photo data and picture (core-led). Plan: cli-private
  `plans/2026-10-13-image-search-plan.md`.
- **MEMO-26** · P3 · What a visual UI over the store would need from memo: a link graph read
  (`store.notes.links` exists in cli-core, no command or MCP tool exposes it), a change feed for notes and mail,
  and cursor paging on lists. Research only; see the 2026-10-23 audit.
