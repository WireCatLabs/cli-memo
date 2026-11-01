# Changelog

Notable changes to `@wirecat/cli-memo`, one section per version, newest
first. Versions follow [semantic versioning](https://semver.org/); before `1.0.0` a minor release may change
the API.

## Unreleased

## 0.131.5 — 01.11.2026

### Added

- **`"import": false` on a `mail.accounts` entry hands its import to the `mail` CLI.** `memo sync` and the timer skip
  the account, `memo sync --source email:<name>` says the import is handed to `mail` (`meta.handed_to_mail` in
  `--json`), and `memo mail inspect`, `rules`, `delete` and `restore` keep working on it. Memo still repairs HTML
  text, scores senders and embeds the mail in the store for it; only the Himalaya header backfill stops.

## 0.131.4 — 01.11.2026

### Changed — may break callers

- **A task's `revision` goes up only for a change a person could overwrite** (cli-core 0.516.0, store version 42):
  title, description, state, priority, assignees, agent, due date, project, parent or tags. An agent's claim, its
  renewal and release, and `--remind-time` leave it as it is, so a board no longer says "changed elsewhere" while an
  agent works.
- **`tasks move <id> --before|--after <other>` beside a task in another column moves it into that column.** A
  `--status` that names another column than the neighbour's is refused with reason `task.column`
  (`HRB-2 is in in_progress, not todo: pick a task in the todo column`).

### Fixed

- **`tasks update --priority none` clears the priority** instead of failing with "a priority score is 0 to 1".

## 0.131.3 — 01.11.2026

### Added

- **`projects evidence --sync-profile <tool>=<profile>`** names the messenger profile `--sync-first` syncs as when
  several are signed in to a chat's account (`--sync-profile max=default`; repeat for another tool). The profile must
  be signed in to that chat's account, or the chat is not synced and the answer says why.
- **`projects evidence --json` carries each linked chat's `sync_command`**: the exact `tg`, `max` or `wa` line that
  syncs a chat held in part back to `--since-time`, or `null` when it needs no sync or no profile can be chosen here;
  then a `missing` entry with field `sync_command` says why.

### Fixed

- **`projects evidence` exits 0 on a partial answer.** A chat held in part made it exit 1 with nothing on stderr;
  `meta.complete: false`, `missing` and `next` now say what is missing, as in the searches.
- **`projects evidence --sync-first` says when several profiles are signed in to a chat's account**, and names them,
  instead of "no profile is signed in".
- **`--sync-first` no longer passes the messenger CLI's JSON progress lines through**; its sentence for the same
  progress is kept.

### Removed

- **`memo mail status` is removed.** It counted only the Himalaya import, while `mail <profile> status` counts the
  mailboxes the `mail` CLI syncs, so two status commands gave two different numbers. Use `mail <profile> status`
  for a mailbox synced by `mail`; the Himalaya import has no status command until a better one, covering both,
  comes later. The MCP tool `mail status` goes with it.

## 0.131.2 — 01.11.2026

### Added

- **Project tasks have five states: `open`, `todo`, `in_progress`, `done`, `dismissed`** (WireCat Desktop's Tasks
  page, cli-core 0.513.0). `tasks update --status` moves a project task to any of them, back from `done` or
  `dismissed` too, and each move is kept in the task's history. `todo` and `in_progress` count as open work for
  readiness, claims and the default list.
- **`tasks list` with `project:` takes a full query**: `project:*` for every project, a project by its name or alias,
  `assignee:`, `priority:` (labels, `none`, ranges), `agent:`, `due:` and `closed:` with ranges, `overdue:`, OR within
  a field, NOT, and plain words over the title and description. `--sort` and `--desc` order it, `--cursor` reads past
  500, and `page.total` says how many match. Each task carries `assignments`, `ready`, `blocked_by`, `agent`,
  `priority_label` and `revision`.
- **`tasks counts [query]`** counts the matching project tasks per project, assignee, priority and state, each without
  the query's own terms on that field, for a picker.
- **`tasks move <id> --before|--after <id> [--status s]`** puts a project task beside another in its board column by
  giving it a priority between them; the answer says when its label changed and which tasks were spread out to make
  room.
- **`tasks history <id>`** lists who changed a task, what and when; **`tasks assign --clear`** takes a person off a
  task; **`tasks update --agent`** names the agent working on it, apart from its assignees; **`people list`** lists you
  and everyone tasks name, for an assignee picker.
- **`--revision`** on `tasks update`, `close`, `assign` and `move` refuses a write made on a stale copy:
  `configuration_error`, reason `task.stale`, exit code 3.

### Changed — may break callers

- **A task's priority is a label over a number from 0 to 1, higher first.** `--priority` takes `low`, `medium`,
  `high`, `critical` or `none`, and still reads 0 (urgent) … 4 (low) as critical, high, medium, low, low. `--json`
  gives `priority` as the number (0.875 for what was 0) and `priority_label`. Lists order by it, highest first.
- **A plain `tasks list` reads `state:` as open work**: without `state:`, it lists `open`, `todo` and `in_progress`.
  An explicit `state:open` now means only new tasks.

### Fixed

- **`tasks update --parent none`** makes a subtask top-level; it failed with "no task none".
- **`tasks add`, `close` and `assign` record the agent** whose terminal runs memo, as `update` did; they always
  recorded the owner.
- **A project's list says `has_more` at 500 tasks**; it said there were no more.
- **The README names `tasks links`**, not `relations`.

## 0.131.1 — 01.11.2026

### Fixed

- **The docs say that the `mail` CLI brings mail in, and that the Himalaya import will be removed in a later version.**
  `mail <profile> session start` and `mail <profile> sync` fill the shared store; memo searches and shows that mail.
  The Himalaya import and `memo mail inspect`, `rules`, `delete`, `restore` and `status` still work and are unchanged.
  Docs and help text only: `memo mail status` now says it counts only the Himalaya import and points to
  `mail <profile> status`. The docs also say that mail synced by `mail` has no attachment text, that `memo mail delete`
  moves Gmail mail to Trash, and write `memo mail delete`, `memo mail restore` and `memo mail inspect` in full.

## 0.131.0 — 31.10.2026

### Fixed

- **The header backfill and the HTML text repair no longer lock other CLIs out of the store.** Both saved one email
  per transaction. They now save 50 per transaction through cli-core's `MailStore.saveThreads` (cli-core 0.506.0,
  already in use at 0.509.0), pause 100 ms between slices, and keep their progress in the same transaction: the
  backfill saves its cursor with every slice, and the repair marks itself done with the last one. A run that fails
  resumes after the last saved slice.

## 0.130.0 — 31.10.2026

### Changed — may break callers

- **cli-core 0.509.0** (from 0.507.0) brings the two changes below; 0.508.0 changed only calendar commands memo does
  not offer.
- **`agents list` names the agent that made an MCP call, not `memo-mcp`.** A call through `memo mcp serve` is logged,
  and a fact, memory or action it adds is authored, under the name the client gave itself (MCP `clientInfo.name`,
  such as `claude-code`), else the coding agent that started the server, else `memo-mcp`. A filter on
  `agent:memo-mcp` no longer finds new calls. The name is the client's own claim, shown and never trusted.
- **`facts add --supersedes` corrects a fact of any kind**, not only an accepted decision. The old fact must be
  proposed or accepted; it becomes `superseded` once the new one is accepted, which the owner's is at once (a proposed
  one used to stay proposed). An agent's `--supersedes` of a fact the owner accepted is refused (exit 5); of a proposed
  one it waits, as before, for the owner to confirm.

## 0.129.0 — 31.10.2026

### Added

- **`memo doctor --online` says whether a newer memo is published.** The answer gains `online` with the shape of
  the other WireCat doctors: `ok`, `duration_ms` and `version: { current, latest, newer }` (`latest` is `null` when
  npm cannot be reached, which does not fail the command). Without `--online` memo's doctor still connects to
  nothing. Needs cli-core 0.507.0 and cli-base 0.68.1.

## 0.128.0 — 31.10.2026

### Changed — may break callers

- **cli-core 0.506.0: `search messages --discover` also searches by meaning when the query uses `-`, `NOT`, `OR`,
  groups, phrases or `exact:`**, where it ran strict search alone; every hit still matches the whole query.

### Added

- **`projects evidence --sync-first` syncs the project's linked chats before reading.** Off by default and not on
  MCP. For each linked chat the store does not hold back to `--since-time`, memo runs that chat's messenger CLI as
  `<tg|max|wa> <profile> messages sync --since-time <start> -- <chat>`, one chat at a time, inside `--sync-time`
  (3 minutes in all). The profile is the one signed in to the chat's account, from the messenger's own record of it;
  none or several is a refusal for that chat that lists them, never a guess. memo runs `wcat-<tool>` when it
  describes itself as that tool, or the short name only when it is WireCat's package. The child's stderr is passed
  on as progress. A chat the time cuts, or whose sync fails (another run holds the session, MAX needs `serve`),
  stays partial with the reason, and its `missing` and `next` stay.
- **The text names the command that syncs a partial linked chat**, with its CLI and profile:
  `tg work messages sync 9 --since-time 2026-09-01`.
- **`projects evidence` comes from cli-core** (`gatherStoredProject`, shared with tg and max). The command is
  declared a fetch because of `--sync-first`. Needs cli-core 0.504.0.

### Fixed

- **A forgotten memory's or fact's number is never given to a new one** (cli-core 0.506.0). After `memories remove` or
  `facts remove` of the newest record, the next one took its number, so a `memory:N` or `fact:N` read before the
  forget named a different record.
- **`memo doctor`, `memo mcp` and `memo mcp serve` use the summaries every WireCat CLI shares.** `memo doctor --help`
  now opens with "the state this installation is in, without connecting unless --online" (memo still connects to
  nothing and has no `--online`), `memo mcp` with "serve this profile's commands to an AI agent, and set that up" and
  `memo mcp serve` with "serve this profile's commands to an AI agent". Only the help text changed.

## 0.127.0 — 31.10.2026

### Added

- **Correct, reject and forget memories and facts.** `memories add --supersedes memory:<id>` corrects a memory: the
  old one stays as `superseded` (yours only; an agent's is refused with `permission_error`). `facts reject fact:<id>`
  turns down a proposed fact (new status `rejected`). `memories remove` and `facts remove` erase the record, its links
  to sources and its search entry, and answer `{ ref, removed: true, links }`; a store backup made before keeps it.
  None of the three is offered over MCP.
- **`subject_name` and `subject_is_owner`** in `memories list`, `memories show`, `facts list` and `facts show`: what the
  subject is called, without a second lookup.
- **`memories show --sources` and `facts show --sources`** read each piece of evidence back in one call: `ref`, `kind`,
  `title`, `sender`, `at`, `excerpt`, `tool`, and `missing` for a source deleted since.

## 0.126.0 — 31.10.2026

### Added

- **`search notes`, `search messages` and `search mail` say how many match in all.** `--json` adds
  `page.total: { value, relation }`, shaped as Elasticsearch's `hits.total`: `eq` is the exact count, `gte` a lower
  bound (counting stops at 10,000). The text view adds `showing 1–20 of 144` under the hits. Notes count those the
  words find and those found by meaning, every page together (cli-core 0.501.0).

### Fixed

- **Search by meaning inside a filter finds the filter's own notes.** With a filter of at most 2,000 notes, every one
  of them is ranked by meaning, instead of the 50 nearest overall cut to the filter (cli-core 0.501.0). memo requires
  cli-base 0.67.0.

### Changed — may break callers

- **`projects evidence` says what the store holds of each linked chat, and `search messages` and `search all` keep the
  coverage gap in their answers** (cli-core 0.498.0). Each `linked_chats` row gains `title`, `completeness` and `held`;
  a chat the run did not reach is `state: "pending"` with no `items` or `capped`, where it said `in-scope` with
  `items: 0`. The answer's `completeness` is `partial`, `unknown` or `complete`, and `meta.complete` is true only when
  the planned reads finished and every linked chat is held in full; `complete` keeps its meaning, "the planned reads
  finished". A chat held in part gives `missing` (`field: "history"`) and a line in the text naming it and the sync
  command; the exit code stays 0. memo has no `messages sync`, so `next` (cli-core's `messages.sync` step) is dropped
  from memo's answers: the messenger CLI syncs the chat. `search messages` and `search all` answered `meta.complete:
  true` without `missing` for a chat held in part, because memo's answer builders dropped what cli-core returned; they
  now carry both.

- **0.125.0 also carried cli-core's coverage answers, which change JSON output** (cli-core 0.493.0, not listed in that
  release). `memo search all --json` answers `meta.complete: false` with `missing` and `next` when a chat it searched is
  held only in part or was never fetched, where it said `true`; the exit code stays 0. `memo tasks agenda --json` rows
  gain `completeness` and `held`, and the answer may carry `meta.complete: false`, `missing` and `next`. A caller that
  read `meta.complete` as "no source failed" must read `missing` for the reason.

## 0.125.0 — 31.10.2026

### Fixed

- **`search notes` and `search all` keep the query's fields for notes found by meaning.** `date:today` or `tag:work`
  without `--exact` returned about 20 notes that matched neither; now every field and every excluded word holds for
  every hit, and a query of fields alone lists the matching notes, newest first. For a Google Drive document, `date:`
  reads its last edit on Drive, the time its result shows as `updated_at`, where it read when it was last imported
  (cli-core 0.496.0, with cli-base 0.65.5).

## 0.124.0 — 31.10.2026

### Changed — may break callers

- **Searching notes, documents, annotations and contact notes finds part of a word, in any letter case.** A mixed case
  Cyrillic word is no longer missed, and the title is searched with the text. A search of one or two characters is
  refused with "search needs at least three characters", as message search is. The store moves to version 40 the
  first time this version opens it; notes stored before get their search index in batches while `search notes` or
  `store migrate` runs. An older memo or other WireCat CLI must be upgraded the same day, or it stops indexing new
  notes. This memo uses cli-core 0.491.0, which also finishes locating a large mail folder over several budgeted syncs.

## 0.123.0 — 30.10.2026

### Fixed

- **`memo sync` no longer fails with "database is locked" while another tool writes the shared store.** The store
  waits for the write lock by trying every millisecond, so a tool that writes without pause (`mail sync`) cannot hold
  it for the whole 5 second wait.
- **Names match ignoring case in any alphabet, not only Latin.** `memo projects list 'name:*ТАРТ*'` now finds
  «Тартус». The same holds for chat titles, contact names, mail subjects and mailbox and label names, in
  `tags list name:` and in mail search `mailbox:` and `label:`. The store moves to version 38 the first time this
  version opens it, and fills the lowercase copies it matches against. An older memo or other WireCat CLI still reads
  the store, and warns you to upgrade.

### Added

- **`search all`, `search messages` and `search mail` hits carry `sender_is_me`**, true when you sent the message.

### Changed — may break callers

- **`--help` lists `gcal` under "Works with".** A script or test that pins the first screen gains that line. Install gcal with `@wirecat/gcal-cli`.

## 0.122.0 — 29.10.2026

### Changed — may break callers

- **The agent skill is listed on ClawHub as `wirecat-memo`.** Install it with
  `openclaw skills install @wirecat/wirecat-memo`. The `cli-memo` listing is no longer updated.
  `memo skill install` still writes `skills/cli-memo/`.

### Added

- **`person:me` names you** in `context`, `relationships add`, `notes` subjects, `tasks assign`, `mentions confirm` and
  `projects gather --contact`. It is the person the store marks as the owner; with none marked, the error says how to
  mark one (`tg <profile> contacts link <your id> me`).
- **`memo context person:<id>` reads a person you already hold the reference of.** It used to ask for a messenger
  account. The person is read from the one account that saw them; when several did, it lists them and asks for
  `--source provider:account`.

### Fixed

- **`memo messages show <email>` no longer prints the AMP and HTML versions of the body** (about 4 000 characters of
  markup) after the plain text. `--full` brings them back.
- **The skill sent agents to `memo commands search <word>`, which looks like a keyword search and answers
  `not_found`.** `memo commands` takes a command path (`memo commands search notes --json`); the skill now says so, and a
  test checks that every `memo` command line in it names a command that exists.

## 0.121.0 — 29.10.2026

### Changed — may break callers

- **cli-core 0.473.0.** `memo projects list` leaves out the task inbox each messenger account has (a project named
  like `telegram:100`, its key `IN` and eight characters); `memo projects list kind:inbox` lists only them, and
  `name:` takes `*` wildcards.

## 0.120.0 — 27.10.2026

### Changed — may break callers

- **cli-core 0.469.0 and cli-base 0.65.0.** cli-core 0.469 accepts only cli-base 0.65, so both pins move together.
  cli-base 0.65 knows the verbs `serve` and `revoke`, so their lint baseline entries are gone, and its `cli-dev bundle`
  finds a server started with a flag before `mcp serve`. From cli-core 0.468, an MCP server offers a command that only
  fetches into the store through its read tool.
- **Mail sync, rules and scoring run from cli-core 0.472.0.** The engine moved to `@wirecat/cli-core/mail`; memo keeps
  its Himalaya and mbox sources, the domain-age lookup and the embedding. The account, ids, sync state and answers are
  the same. `mail.source-failed` is now declared by cli-core, and `mcp serve` has the `--profiles` option of
  cli-core 0.470 only in the shared contract it is checked against, not in memo.
- **`skill show`, `skill status` and `skill install` answer `--json` in the one-thing envelope**
  ([WC-OUT-4](https://github.com/WireCatLabs/cli-base/blob/main/docs/standards/output.md#wc-out-4--answer-every-json-request-with-one-envelope-a-list-or-one-thing)),
  `{ item, meta }`, like every other memo command and cli-core's own `skill`; they printed the bare object. A caller
  reads the old fields under `item`, e.g. `item.targets` of `skill status`.

### Fixed

- **`memo` starts in about half the time: the package runs from a bundle.** A command loaded about a thousand module
  files before doing any work; it now loads a few dozen that hold the same code, built by cli-base's
  `cli-dev bundle`. Warm `memo search all --help` went from 420 to 186 ms, `memo --version` from 39 to 18 ms. Output
  is unchanged. A running `memo mcp serve` loads all of its code soon after it starts, so upgrading `memo` in place
  does not break it. The package is larger: 3.1 MB to download instead of 0.4 MB.
- **`memo mcp --json` refuses the flag with a JSON `validation_error` (exit 2)**, as `memo notes --json` and
  `memo mail --json` do; it printed the group's help and nothing in JSON. `mcp revoke` and `mcp server
  start|stop|status` now take `--json` themselves, so it goes after the command: `memo mcp revoke --json`, no longer
  `memo mcp --json revoke`.

## 0.119.0 — 27.10.2026

### Changed — may break callers

- **cli-core 0.467.0 and cli-base 0.64.0.** cli-core accepts only cli-base 0.64, so both pins move together.
- **Every search hit marks the text someone else wrote (cli-core 0.464.0).** `search all` message and mail hits carry
  `untrusted: ["title", "excerpt", "sender_name"]`, document hits `["title", "excerpt"]`, as event hits did;
  `search messages` and `search mail` mark the sender, chat title and text. A note stays unmarked: it is your own. A
  caller that checks hits against an older, strict copy of their shape refuses the new field.
- **Every run is now kept, successes too (cli-core record-every-run).** Before, only failed runs were kept unless
  `--record` or `record: true`. A successful run stays 7 days (`keep_successful_runs_for_days`), a failed one 30
  (`keep_runs_for_days`), and the runs folder stays under `runs_size_limit_mb` (200 MB; the oldest successes go
  first). **Privacy:** a kept run holds the command as typed (secrets and phone numbers hidden), so a successful
  `memo search` or `notes add` now leaves its words in a local, 0600 file for 7 days. `record_input: "failed"` keeps
  them only in a failed run, `record_input: false` masks them everywhere; `record: false` now keeps failed runs
  (before: nothing); `--no-record` keeps nothing. `memo mcp serve` keeps a success only under `--record`.
- **A run says who asked for it (cli-core).** `run.json` gains `via` (`cli`, `mcp-stdio`, `mcp-http`, `desktop`),
  `mcp` (tool, request and connection ids) and `agent.client` (the AI app's name and version). Over HTTP the agent
  is the browser app's MCP session, no longer whichever agent started `mcp serve --http`. A reader that checks a run
  against an older copy of its shape refuses the new fields.

### Added

- **`memo upgrade` restarts the HTTP MCP server and names the stdio MCP sessions still on the old version**
  (cli-core). After an install it restarts each `memo mcp serve --http` that `memo mcp server start` launched, with
  the same port, address and `--permission` limits, and lists this install's stdio `memo mcp serve` processes as
  `stale_sessions` to restart from your AI app. It works from the next upgrade on.
- **A mail read that himalaya tries again is two request lines in the run**: the second has `attempt: 2` and the
  15 s it waited, and a throttled account is named `mail.throttled`, never with what himalaya printed. RDAP lines
  carry `method`, the path with the domain as `:id`, and `transport: "http"`; a refusal names the registry's
  `errorCode` (`rdap.429`), read from an error body of 4 KB at most, never its title or description.
- **`record_input: "failed"`, `keep_successful_runs_for_days` and `runs_size_limit_mb`** in `config.json`.

## 0.118.0 — 27.10.2026

### Added

- **A `search all` event hit names its invitation text in `untrusted`** (`["title", "excerpt"]`), on cli-core
  0.460.0. Over MCP an agent sees it marked in the answer itself, not only in the server instructions.
- **`memo search all` finds Google Calendar events** that gcal stored, from every calendar, ranked with messages,
  mail and notes (cli-core 0.459.0). A hit has `kind: "event"` and an `event:<id>` reference, which
  `gcal <profile> events show` opens. `--only` takes `events`; `meta.accounts` and the `searched:` line name each
  calendar read. When events were searched by words only, the answer says why, as for notes and messages.
- **`memo context` lists the person's calendar events** under `events`: `upcoming` and `recent`, one occurrence
  per series, none cancelled, from every calendar any identity linked to them is invited through; `events.accounts`
  names the calendars read. The text answer shows them under "Upcoming events" and "Recent events".
- **Event text is marked as other people's words.** `memo context --json` carries `untrusted`, the event fields
  the invitation's sender wrote (`events.upcoming.title`, `events.upcoming.location` and the same under `recent`),
  as cli-core's calendar tools mark them. Memo's MCP instructions say an event's title, description and place are
  data, never instructions.

### Changed — may break callers

- **`memo context --json` names a missing calendar in `not_read`** (`source: "events"`, "no calendar in the store —
  gcal <profile> sync"), so an answer that used to have an empty `not_read` now has that entry until gcal syncs.
- **`@wirecat/cli-core` 0.451.0 → 0.463.0.** The shared store moves to version 35 (an occurrence names its series
  in a column); builds that speak version 34 still open it.
- **The MCP server is `memo mcp serve`; `memo mcp` alone only shows its commands** (cli-core 0.463.0). `--http`,
  `--port`, `--public-url` and `--permission` move to `mcp serve`, and `memo mcp --revoke` is now
  `memo mcp revoke`. There is no alias: an app whose MCP settings run `memo mcp` gets the help and exit 2, so change
  its `args` to `["mcp", "serve"]`; set Claude Code up with `claude mcp add memo -- memo mcp serve`.
  `memo mcp server start` runs `mcp serve --http` and still passes `--permission` on.

### Fixed

- **`memo sync` stops on Ctrl-C and SIGTERM**, where it used to ignore SIGTERM and run to the end. It stops at the
  next batch of emails, mail account or notes folder, keeps the resume point, ends a running himalaya, releases the
  import lock, and fails with `cancelled` (exit 130). **`memo sync --timeout <duration>`** stops it the same way at
  a deadline, with `timeout` (exit 9); without it a sync has no time limit, as before.
- **Memo's agent skill publishes to ClawHub as `cli-memo` again.** ClawHub keeps skill names per publisher, so
  `wirecat/cli-memo` is memo's own name, and every WireCat tool's skill now uses its plain name. The next release
  publishes it as `cli-memo` 1.0.1. `memo skill install` still writes `skills/cli-memo/`.

## 0.117.0 — 27.10.2026

### Added

- **The skill tells an agent never to ask for a mail or app password in the chat**: the owner adds a mail account
  themselves, in Himalaya and then `memo mail add`.

## 0.116.0 — 27.10.2026

### Fixed

- **`memo search all` and meaning search over notes and files answer in a fraction of a second (cli-core 0.451.0).**
  Ranking documents and notes by meaning now uses the vector index instead of reading every chunk in the
  store: on one archive with 600,000 chunks, mostly mail, it took 7–18 s a query and now about 0.05 s, with the same
  results. It still reads every chunk when the index is not ready.
- **Meaning search runs on the native ONNX Runtime on Windows too.** After `memo models download e5-small`, the model
  uses the native library on Windows x64 and arm64, as it already did on Linux and macOS: 2–3× faster than
  WebAssembly. The download takes `onnxruntime.dll` from the `onnxruntime-node` npm package (113.5 MB, once, checked
  by sha256).

## 0.115.0 — 27.10.2026

### Added

- **`memo mcp --http --public-url` takes a path (cli-core 0.450.0),** `https://<name>.ts.net/memo`, so memo shares one
  tunnel address with the other tools, a path each. The login and the connector address (`…/memo/mcp`) carry the
  path; the tunnel also routes `/.well-known/oauth-authorization-server/memo` and
  `/.well-known/oauth-protected-resource/memo` to the server. WireCat Desktop sets this up with Tailscale Funnel.

### Fixed

- **Memo's agent skill publishes to ClawHub as `wirecat-memo`.** ClawHub holds a `cli-memo` 1.0.0 that is not
  public and rejects every new 1.0.0 under that name, so no release could list the skill. `memo skill install` still
  writes `skills/cli-memo/`.

## 0.114.0 — 27.10.2026

### Fixed

- **`memo mail add` and `memo mail check` accept a Himalaya account that sets no `email`.** Himalaya works without
  it, so many accounts name their address only as the login. Memo now takes the address from the IMAP login, then
  the SMTP one, when it is an email address. When neither is, the error names the Himalaya config file and the line
  to add: `email = "you@example.com"` under `[accounts.<name>]`.

- **Every command spends less time getting ready (cli-base 0.62.0, cli-core 0.449.0).** The check of shared commands now
  describes each command once, not again for every group above it. It was about 60% of each command's setup; in tg a
  warm `run(["--version"])` went from 49 to 29 ms. It catches the same changes as before.

## 0.113.0 — 26.10.2026

### Fixed

- **Search by meaning, and the meaning lane of `memo search all`, run 2–3× faster on Linux and Apple-silicon Macs
  (cli-core 0.448.0)** after the next `memo models download`: the text models then run on the native ONNX Runtime,
  and on WebAssembly where it is not installed.

## 0.112.0 — 26.10.2026

### Security

- **A run record hides a secret by what it looks like, not only by the option's name (cli-core 0.446.0).** A token in
  a known format (GitHub, OpenAI, Anthropic, Slack, AWS, Google, Stripe, npm, Telegram, a JWT, a private key), a
  `Bearer` credential, the value after `password=`, `pin 1234` or another secret name, and a random-looking string are
  `[redacted]` inside the word, with the words around it kept: `memo search notes "Kai password=tulip42"` keeps
  `Kai password=[redacted]`. A config that will not load now hides every typed value, as `record_input: false` does.

## 0.111.0 — 26.10.2026

### Added

- **`memo mcp server start|stop|status` runs the HTTP MCP server in the background (cli-core 0.445.0).** `start`
  takes `--public-url`, `--port` (default 8767) and `--permission` and answers once it listens; `status --json` gives
  the port, the connector address, the current login code with when it runs out, and the apps logged in, each by the
  name it gave itself; `stop` ends only a server `start` started. `memo mcp --http` now keeps a lock beside its token
  file, so a second server is refused, and its login code renews when it runs out. WireCat Desktop uses these.

### Changed — may break callers

- **A run keeps the command as typed (cli-core 0.440.0).** `memo runs show` and `run.json` now carry `argv`, the words
  after `memo`, so the owner can read back what was run: a search, a name, a note's title. A secret is still
  `[redacted]` (an option named for a token, password or API key, a password in a URL, a long opaque string), and so is
  a phone number. The new `record_input` key in `config.json` set to `false` writes every value that may be content as
  `[redacted]`. `--record` help says so; it read "ids and timings, never note or mail content".

## 0.110.0 — 26.10.2026

### Added

- **`memo skill install --for hermes` gives Hermes Agent the skill, and `memo skill status` says what Hermes reads (cli-base 0.59.0).** It adds `~/.agents/skills` to Hermes's `skills.external_dirs` through `hermes config set`, keeping the folders already listed, or copies the file into Hermes's home when that fails. With no Hermes installed it fails with `not_found` and writes nothing. A bare `memo skill install` and `--for all` still write only the Claude Code and `~/.agents/skills` copies. `skill status --json` gains `hermes` beside `targets`.
- **A run started by OpenClaw or Hermes Agent names that agent (cli-core 0.437.0).** `runs show` gives `agent` as `openclaw` for a command OpenClaw's agent ran, with `from_chat: true` when a chat message started it; a Hermes run carries its session, so a task claim from Hermes is held per session.
- **The `cli-memo` skill tells OpenClaw and ClawHub that it needs `memo`, and how to install it** (`metadata.openclaw`: `requires.bins` and the npm package `@wirecat/cli-memo`). With `memo` missing from PATH, OpenClaw marks the skill not ready and offers to install the package. Claude Code and Codex ignore the block.

## 0.109.0 — 26.10.2026

### Added

- **`memo search all` finds messages by meaning too, once it can** (cli-core 0.435.0). It looks up the 100 messages nearest in meaning (e5-small over each message's own vector, every account it reads) and fuses them with the word hits into one messages list before the merge with mail and notes; each item's `found_by` says which search found it. Without the model or the vectors, messages are read by words as before and the answer says so: a `Messages by words only: …` note in the terminal and a `found_by` entry in `missing` with `--json` and MCP, naming `memo models download e5-small` or the messenger's `conversations rebuild`. `--exact`, and a query with NOT or with a filter under OR or in a group, stay words only. A search never downloads a model or sends text anywhere.

### Changed — may break callers

- **cli-core 0.435.0 moves the shared store to version 34**, which keeps an index for search by meaning (sqlite-vec, shipped in `@wirecat/cli-core-sqlite` 1.1.0). Once memo, or any WireCat CLI on cli-core 0.434.0 or later, has opened the store, memo 0.108 and older refuse it and ask to be upgraded, so upgrade every WireCat CLI together.

## 0.108.0 — 25.10.2026

### Fixed

- Mail is parsed with postal-mime 4.1.4, which fixes how a few malformed messages are read: a header block ends at the first line that is neither a field nor a fold, a base64 or quoted-printable attached message stays an attachment, and only real UTF-16 charset labels are honoured. Re-importing such a message can store slightly different text.
- **A bare `memo --version` answers before the program loads**: about 50 module files in place of 1,050 (cli-core's `cli/start`). `--version` with anything else on the line goes through the program as before.

## 0.107.0 — 25.10.2026

### Security

- **`memo doctor` reports files and folders other users can read, with the `chmod` that fixes each.** `files` in `memo doctor --json` is `{ checked, ok, problems }`, each problem `{ path, mode, want }`, the shape every WireCat doctor uses: the config file and the store with its `-wal` and `-shm` files want `0600`; the config folder, the run log folder and the store's folder (unless `MESSAGING_STORE` names the store) want `0700`. With `--json` the fix goes to stderr as `to make it private: chmod 600 '<path>'`; the text output lists it with the other problems. Nothing is changed on disk, and these problems leave the exit code alone, as config problems do. Windows is not checked: `files` is `{ checked: false, reason }`.
- **Every change memo saves to `config.json` leaves it owner-only (`0600`)** (cli-base 0.57.0). A file other users could read, as `config set` in older versions left it, becomes private on the next save.

## 0.106.0 — 25.10.2026

### Changed — may break callers

- **Run recording comes from cli-core 0.430.0** (`recordRuns`) in place of memo's own copy. Runs are kept as before — every failed command, a usage error before any command included, a successful one under `--record` or `record: true`, nothing under `--no-record` — and Himalaya and RDAP calls are logged as before. A run now leaves `profile` out of `runs list` and `runs show` instead of `""`, since memo has no profiles.

## 0.105.0 — 25.10.2026

### Added

- **A failed run says what went wrong** (cli-core 0.425.0): `memo runs list` and `memo runs show` gain `error`, with its class, code, reason, masked message and a short stack.
- `memo store info` describes the shared store: where it is, its schema against the one memo reads (`schema.reason`, and `schema.upgrade` — what memo's next run moves it to), and which tools used it. It opens the store read-only, so WireCat Desktop can tell whether memo can read the store.
- **`memo skill status` says, for each agent, whether its installed SKILL.md matches this version**, and `memo skill show --for claude|agents` prints the copy installed there (cli-base 0.56). `memo skill show`, `skill install` and `skill status` take `--json`, as tg's do: memo has no global `--json`, so each skill command has its own.

### Fixed

- **The MCP tools describe memo's own commands, not a messenger's.** `memo_tools_search` offers "list", "show", "change a setting" in place of "unread", "send message", "chat members"; `memo_write` says "creates, edits, deletes" in place of "sends, edits, deletes, joins"; the example command of `memo_read` and `memo_write` is `notes list`, not `messages list`, which memo does not have; and the answer's text is "names, titles, what people wrote" (cli-core 0.426.0).
- **Help no longer says "Availability: available for this profile"**, since memo has no profiles; a command that cannot run still says why. `memo --help` says zm and drive are "searchable with your other WireCat data".
- MCP no longer offers a command group that only prints its help, such as `models`; its commands are still offered one by one.
- The person-brief and decision-trail guide steps for tg, max, zm and drive name the profile, as those commands need: `tg personal contacts context Kai`.

## 0.104.0 — 25.10.2026

### Added

- **`memo doctor --json` lists every problem in the config file as `config.issues`**, in the shape every WireCat doctor uses: `{ kind, file, key?, line?, column?, what, fix? }`, with `kind` one of `invalid_json`, `unknown_setting`, `unknown_permission`, `missing_setting` or `invalid_value`. `what` says what a value has to be and never quotes the saved value; `fix` is a `memo config unset <key>` that runs as written, and is left out for invalid JSON, where `line` and `column` say where parsing stopped. Doctor still answers on a broken file, diagnoses the rest from what of the file still loads, and config problems alone leave its exit code at 0. Text output lists them with the other problems.
- **`memo config unset <key>` removes one setting by its dotted path** (`mail.accounts.0.colour`, `permissions.notes.edit`), even one memo does not know and on a file with other problems, so every fix doctor prints works. It is not offered over MCP, where it could remove a saved permission the server enforces.
- **memo keeps run logs, as tg, max and wa do.** A command that fails is kept as a run: its words (never its arguments), how it ended, its error code, and each Himalaya call (`himalaya.envelope.list`, exit status, duration) and RDAP lookup (`rdap.domain`, HTTP status) it made — never a note, an address, a subject, a folder or a domain. `memo runs list [query] --limit --page --json`, `memo runs show <run-id> --json` and `memo runs path <run-id>` read them; WireCat Desktop's Logs page reads `memo runs list … --json`. `--record` keeps a run that worked, `--no-record` keeps none; the config file's `record` and `keep_runs_for_days` (default 30) set both for every command. A tool call from an agent is kept as `mcp <command>`.

### Changed — may break callers

- **`memo doctor --json`'s `config.exists` is now `config.found`**, next to the new `config.issues`.
- **A config file with problems is refused with the first problem, its fix, and how many more `memo doctor` lists**: "<file>: setting default_profile is not a setting of memo — remove it with \`memo config unset default_profile\` (and 2 more problems — \`memo doctor\` lists them all)". Before, the refusal named only the first key and a fixed reason.
- **Old command names are no longer recognised as permission keys.** A saved permission or `--permission` key from a retired command path (`auto.start`, `mail.trash`, `note` and the rest) gets the same answer as any key that names no command: `memo mcp` refuses to start, naming the `memo config unset` that removes a saved one, or `--permission <key> names no command`, with no pointer to a replacement. Any other unknown permission key is refused the same way; before, it was ignored.
- **`memo sync --account` is removed.** Name mailboxes with `--source email:<account>`.
- **Uses cli-core 0.423.0.** With it `--source obsidian:<id>` and `--source local:<id>` name one notes folder; before, they found no account.

### Fixed

- **memo's help describes memo's own commands.** The first screen points to `answers create "…" --all` (there is no `ask` command). The MCP server's instructions open an email with `messages show`, not with a `mail show` memo does not have. `search messages` and `search mail` describe `--brief` and `--full` for a message or an email, and `--full` says JSON still gives the excerpt. Meeting examples name a real meeting account (`zoom:me@example.com`). The `mail delete`, `mail restore` and `mail rules apply` examples are dry runs, and `upgrade` shows only `--check`. memo tells cli-core that it is not a messenger (`AppIdentity.messenger: false`). The store's `minCompatible` does not change.

### Removed

- **`search all` and `search notes` no longer take `--brief` or `--full`.** Both flags were accepted and then ignored. A call that passes one now fails with an unknown option.
- The anchors for retired command names in `docs/commands.md` and the table of retired MCP tool names in `docs/mcp.md`.

## 0.103.0 — 25.10.2026

### Changed — may break callers

- **memo works on the shared store from cli-core 0.420.0, which carries store versions 30 to 33.** Notes folders are now accounts of provider `obsidian` or `local`: `--account obsidian:<id>` and `local:<id>` name one, and `folder:<id>` still does. Google Drive's documents live in drive's `google-drive` account instead of a stand-in folder; `memo folders list` still marks it "kept by drive", `memo folders update` still refuses it, `search all` names it among the accounts it read, and `notes:<id>` names it as a source. `vocabulary inspect` now answers `coverage.apply_supported: true`, cli-core's value: cli-core can apply the preview, memo has no command that does. Once this memo has migrated the store, an older memo, and any CLI on an older cli-core, refuses it and says to upgrade.

## 0.102.0 — 25.10.2026

Only the version number changed from 0.101.0.

## 0.101.0 — 25.10.2026

### Added

- **`memo projects evidence` reads the project's confirmed members by default.** Every person confirmed as a member of the project (`memo relationships add person:<id> project:<id>`) now has what their stored identities wrote read, as `--contact person:<id>` does, without naming them; before, a member who never wrote the project's name was missing from the result and from `people`. Suggested members are not read, and a person also passed with `--contact` is read once. Members' aliases are not searched. At most 16 lanes run in all, so members that do not fit are listed as not read (`member`, `member-limit`) in a fixed order, never dropped silently. MCP `project_evidence` returns the same.

## 0.100.0 — 25.10.2026

### Added

- **`memo projects evidence` says who is involved.** The result has `people`: who wrote the run's messages and emails, person by person from your stored contacts, with how many items each wrote. A person's linked accounts in several messengers and mail count as one; your own messages are left out; at most 20 people, `people_omitted` counts the rest. It never guesses from names in the text. Text output adds one "people who wrote these" line. MCP `project_evidence` returns the same. Uses cli-core 0.418.0, which also brings 0.417.0's fix: `--discover` treats a "?" ending a question as punctuation.

## 0.99.0 — 25.10.2026

### Added

- Every time memo opens the shared store to write, it tells cli-core its name and version. When another WireCat CLI (tg, max) upgrades the store in a way that locks older CLIs out, it can now name memo and say to run `memo upgrade`, instead of a generic line.

## 0.98.0 — 25.10.2026

### Fixed

- **`memo projects evidence --cursor` drains a busy linked chat at full speed once the other chats are done.** A chat's share of a run's items now counts only the linked chats that still have something to read, so on a project with ten linked chats the last busy one takes about 10 runs instead of about 45. Uses cli-core 0.416.0 and cli-base 0.53.0.

## 0.97.0 — 25.10.2026

### Added

- `memo mcp --http --public-url <https-origin>` serves the same three MCP tools through cli-core’s authenticated HTTP transport, on loopback port 8767 by default. The shared access-code OAuth login, token hashing and `--revoke` work with the same per-call permissions and stricter server overrides as stdio. `--port` selects another local port; HTTP-only options without `--http` are refused. The remote connection guide covers tunnels, app login and revocation.

### Fixed

- MCP note creation supplies text once through Core’s generated runner, rather than passing both the positional argument and `--text`. The shared correction applies to stdio and HTTP.

## 0.96.0 — 25.10.2026

### Changed — may break callers

- `mail rules list <account> protected:true` replaces `--filter is:protected`. The removed option has no alias.

### Added

- Organization, project, reminder, key-document, mail-rule and cleanup-run lists declare schema-derived queries and select records at their native readers before list bounds.
- **`memo search people <name>` finds a person across every account.** It matches the name, username or your
  alias, whatever the case or accents, Cyrillic included, and gives the `person:<id>` that
  `memo projects evidence --contact` takes, with each identity. `--source` narrows the accounts; the answer names
  those it read.
- **`memo projects evidence` reads only a share of each linked chat per run.** One busy chat no longer fills the
  run: each linked chat gives at most its share of the item limit (50 for one chat at the default 100, 20 from four
  chats up), the output names the chats it capped, and `--cursor` reads the rest. JSON `linked_chats` entries gain
  `items` and `capped`. Needs cli-core 0.413.0.

## 0.94.0 — 24.10.2026

### Changed — may break callers

- **Shared command contracts require explicit source overrides.** Discovery includes schemas, declared reasons and exact before/after differences. Stored meeting topic labels use `--topic-name` in the CLI and `topic_name` in MCP continuations.

### Added

- **`memo context` lists the person's Google Drive files.** Files they own or last edited show under "Files, as Google reports", with the Google link and Google's edit time. Links that a program guessed still wait for your review.
- **`models list` and verified downloads use Core’s catalogue.** Model selection is a native query, and `models download --offline` refuses before network work. Project task updates retain priority and parent fields; source tasks retain their explicit account and assignee handling.

### Security

- **Dependency resolutions exclude vulnerable Zod, Vite and postal-mime versions.** Release checks reject high production findings in locked and fresh package resolutions.

## 0.93.0 — 24.10.2026

### Changed — may break callers

- **MCP uses cli-core's discovery/read/write tools.** Reconnect saved clients, find commands with
  `memo_tools_search`, and run CLI paths with `memo_read` or `memo_write`. Individual tool names are removed.
  Command input and execution come from the CLI, including snake_case options, permission rechecks and
  read locks. Discovery retains denied commands with their current availability and reason. Search inputs use `query`; `facts add` uses `statement`. The MCP guide maps saved calls to
  their replacements. Cited meeting/project proposals keep their inline JSON `input`; annotation checks
  take the existing snapshot and bindings file paths used by the CLI.
- **Account selection uses only canonical flags.** Reads use `--source`; account-scoped writes use explicit
  `--account provider:account`. Retired `--provider` and read-side `--account` flags are refused before the command runs.

- **Commands use the shared vocabulary without aliases.** Rename saved calls and permission keys:

  | Previous command | Current command |
  |---|---|
  | `agents log` | `agents list` |
  | `auto start/stop/status` | `jobs start/stop/status` |
  | `ask` | `answers create` |
  | `note <identity> [path]`, `note --clear` | `notes links show/add/clear` |
  | `folders attach` | `folders update` |
  | `mail trash` | `mail delete` |
  | `mail runs` | `mail runs list` |
  | `mail rules import-filters` | `mail rules import --format gmail` |
  | `memories stale` | `memories invalidate` |
  | `relationships suggest` | `relationships scan` |
  | `reminders poll`, `reminders ack` | `reminders claim`, `reminders acknowledge` |
  | `tasks relations` | `tasks links` |

  Moved permission keys stop with `configuration_error` naming the replacement, so saved denials cannot
  silently stop applying. Note links have separate read and write commands with standard JSON answers.
  Meeting searches select tags/topics with native `tag:` and `topic:` query terms; the old `--tag` and
  `--topic` flags are removed. Memo rules imports keep their existing default format and behavior.
- **Agent facts require cited evidence through both CLI and MCP.** The owner may still record an uncited
  fact; proposed agent facts cannot bypass the evidence requirement by using the command runner.

### Added

- **`projects annotations show` reads selected annotations without creating a file**, through the same
  snapshot service as export. It remains available under the read lock.

### Fixed

- **Supported commands remain discoverable with current availability and a reason**, including under the
  read lock. Calls enforce the current permissions. CLI help and discovery also show the read lock.
  Uses published cli-core 0.410.0 and cli-base 0.50.4.

## 0.92.0 — 24.10.2026

### Changed — may break callers

- **Commands use cli-core 0.406.0's canonical names, with no aliases.** `tasks plan` is now part of
  `tasks update`: one command sets the title and description of any task, `--due` and `--remind-time`, priority
  and parent for a project task, and category and assignee for a task from a source, which names its `--account`.
  `tasks update` is refused under `MEMO_READ_ONLY`, so a read-only agent no longer sets due dates or categories.
  `models text download` is `models download`. The MCP tools follow: `tasks_plan` and `models_text_download` are
  gone. Shared commands use cli-core's new names, and a saved permission key with an old path, such as
  `tasks.plan`, stops with `configuration_error` naming its replacement.

## 0.91.0 — 24.10.2026

### Added

- **The agent skill asks for two or three searches in other words before reporting no answer**, covering
  paraphrases and language changes without a separate query-expansion model.

- **Meeting search exposes every shared selector**, including meeting/person/identity/event/series ids,
  tags and topics. The guide explains Memo's explicit stored-account scope and why calendar verification
  and zm's extra semantic-search flags differ.

- **`memo mail add <account> <address>` checks the explicit Himalaya account and matching configured email**
  before saving it. `mail check <account>` repeats the local checks; neither command chooses a default account
  or opens the mailbox. Use `--kind imap` and repeated `--folder` for other IMAP providers.

- **`memo models text download <model>` downloads and checks the shared search model**, through cli-core's
  downloader. Sync, search and setup instructions now point to `memo models text download e5-small`.

- **MCP exposes the command tree, including writes**, with generated command names alongside all 37 existing
  tools. Open cited notes with `notes_show`, stored messages and emails with `messages_show`, and tags with `tags_list`.
  Source-folder and mail-rule changes need `mcp.authority` (denied by default). Meeting findings decisions
  and selected annotation restore each need their own explicit permission. `agent_decisions` still applies.
- **Saved dotted `permissions` and `mcp --permission key=level` limit tools.** Server overrides can only tighten
  saved levels; locks and permissions are checked before every call. `MEMO_READ_ONLY` removes writing tools.

### Fixed

- **The shared mail-import hint names `--only mail`**, included with cli-core 0.404.0.
- **cli-base is pinned at 0.50.3**, matching cli-core's required vocabulary. MCP server/client are pinned at 2.3.0.
- **Install instructions name npm 11.17's `allowScripts` warning and npm 12's blocked scripts**, explain the
  package-specific approval command, and keep `memo skill install --for all` explicit.
- **The introduction describes file writes accurately:** `notes edit` can change a source note, `notes export`
  writes files, and explicit Gmail Trash and restore commands need `--yes`.

## 0.90.0 — 24.10.2026

### Added

- **The first command at a terminal asks three questions once for every WireCat tool** (cli-core 0.404.0): which
  languages you write and speak, which other WireCat tools to install, and whether commands and agents may only read.
  Answered in any tool, they hold in all of them; "read only" stops every `memo` change, as `MEMO_READ_ONLY` does.
  `tg setup`, `max setup` or `wa setup` asks again. Agents, `--json`, `--no-input`, `CI` and `MEMO_READ_ONLY` are
  never asked.

### Fixed

- **The introduction shows the current notes-search output and names all six WireCat tools.** The example
  uses fictional notes and explains the diagnostic when the local meaning model is missing.

## 0.89.0 — 22.10.2026

### Added

- **`sync`, `mail inspect`, `mail trash`, `mail rules apply` and `projects evidence` name the zone they read a
  date in and give the window in UTC.** In `--json` (and over MCP for `project_evidence`), `meta.timezone` appears
  when `--since-time` was a date without a zone, and `meta.window.since` is the start it used.
  `projects evidence` also gives `meta.window.until`, its exclusive end.

### Fixed

- **An mbox email whose only date is a `Date:` header without a zone is refused**, instead of being read in this
  computer's zone without a word. A `From ` line date without a zone is still UTC, as the mbox format defines it.

## 0.88.0 — 22.10.2026

### Added

- **`search meetings --json` names the zone it read a date in and gives the window in UTC.** `meta.timezone` appears
  when `--since-time` or `--until-time` had no zone, and `meta.window` holds the `since`/`until` bounds it used. The
  MCP tool `search_meetings` gives only `meta.window`, since its times always carry a zone. cli-core 0.384.0 and
  cli-base 0.49.0.

### Fixed

- **A store the pre-rename `cli-messaging` wrote is refused again, and left untouched** (cli-core 0.385.0). Since
  cli-core 0.382.0 such a file was opened and failed with `internal_error`; it now fails with `configuration_error`.

## 0.87.0 — 21.10.2026

### Changed — may break callers

- **A date you type covers your whole local day, and a time without a zone is read in your computer's zone.**
  `mail inspect`, `mail trash`, `mail rules apply` and `sync` `--since-time`, and `projects gather --since-time`, read
  `2026-09-01` as midnight UTC and `2026-09-01T10:00` in whatever zone the process ran in. They now start at local
  midnight of the computer's zone (cli-core 0.379.0, cli-base `WC-TIME-3`/`WC-TIME-5`). What to watch for: a window
  given as a date alone now starts a few hours earlier or later than before, by your offset from UTC.
- **`reminders add --timezone` defaults to the computer's zone, not UTC.** The reminder's time is unchanged; only the
  zone kept with it is.
- **A mail rule's `decided_at` without a zone is read in the computer's zone** when rules are imported; a date alone
  was UTC midnight.
- **cli-core 0.379.0 and cli-base 0.48.0**; the shared CI runs the tests in `Asia/Vladivostok`.

## 0.86.0 — 21.10.2026

### Fixed

- **`memo projects evidence --contact person:<id>` found nothing for a person with a messenger display name.** It
  searched the stored name as words, and a name such as «Степа Stefan Grachev AVITO M A» is spelled out in no
  message. It now reads every message and mail the person's stored identities wrote in `--source`, labelled
  `sender` (`[sent by contact]` in text), and searches only the aliases you gave them; a person with neither is
  refused. A literal `--contact "<name>"` is searched as before.

## 0.85.0 — 21.10.2026

### Fixed

- **`memo projects evidence` no longer fails on a project with a confirmed meeting link.** Reading linked chats
  parsed every confirmed member-of link as a reference and stopped at `meeting:…` with `input.invalid`; it now skips
  links that are not chats. Broken in 0.84.0.

## 0.84.0 — 20.10.2026

### Added

- **`memo projects evidence` reads the project's linked chats** (MCP `project_evidence` too, on by default). Every
  message of a chat confirmed as the project's is read, at most 16 chats, oldest link first, when `--source` holds
  the chat's account. Those items have `context: "linked-chat"` (text output `[linked chat]`): they name nothing.
  A suggested link is not read. A linked chat outside `--source`, or past the 16th, is listed in `unread_sources`
  with `kind: "linked-chat"` and `reason` `out-of-scope` or `linked-chat-limit`. The result also carries
  `linked_chats` with each chat's state.
- **`memo relationships add chat:<provider>/<account>/<chat> project:<id>`** makes a chat a project's
  (`member-of` only). The reference names the chat's account, so no account is chosen for you. An agent's link
  waits for the owner's `memo relationships confirm`.

### Changed — may break callers

- Needs `@wirecat/cli-core` 0.377.0. A project evidence lane's `query` is `null` for a linked chat; its `chat`
  holds the chat reference.

### Fixed

- **A document hit's `around` is centred on the first paragraph that names a searched word**, in document order,
  not on the paragraph the first lane found. A document item also carries `moreMatches`: how many later paragraphs
  name a searched word too (`@wirecat/cli-core` 0.377.0).
- **`projects evidence` help no longer says "literal search".** Each name, alias, `--context-query` and
  `--contact` is a search where every word must appear in one text, in any order, as whole words; it is not a
  phrase search.

## 0.83.0 — 20.10.2026

### Added

- `memo projects evidence --contact person:<id>` (MCP `project_evidence` `contact`) searches the person's stored name and
  keeps the `person:<id>` reference on the lane; an unknown id is refused with `not_found` instead of searched as text,
  and a person with no stored name is refused with `validation_error` rather than searched under an identity's name.
- **`projects annotations export|check|restore`** retains selected project aliases, facts and generic
  links, with explicit external bindings and historical state. Export writes a new private file from
  read-only source access; preview checks an existing explicit target; owner-only restore requires its
  exact fingerprint and refuses populated/conflicting targets. Notes, meeting memberships, tasks,
  memories, labels and findings remain omitted, so this selected format is not a full project backup.
- **`project_annotations_snapshot` and `project_annotations_preview` MCP tools** read the same bounded
  selected graph and destination conflicts. Restore is not exposed through MCP. Calls keep the normal
  audit record, and schema, file reading, reference policy and transactions come from shared Core.

### Fixed

- MCP connection instructions distinguish direct proposed records, configurable project decisions and
  owner-only meeting findings and annotation restoration.
- Guides consistently distinguish proposed memories and direct facts from project proposals that an
  agent can decide with a recorded reason, and explain the owner decision setting and meeting boundary.
- **`sync --retry-attachments` help no longer says to install an extraction engine.** The PDF and Word
  readers ship with memo; the option is for attachments an older memo or a broken install left unread.

## 0.82.0 — 20.10.2026

### Fixed

- The MCP guide describes project-decision permissions and the accepted facts and numbered tasks that
  confirming a proposal can create, alongside the owner-only review of meeting findings.
- Key-document suggestions report `state: "untracked"` because no source fingerprint was saved with
  the suggestion. They no longer incorrectly report unchanged text; reread the document before deciding.
- **Project proposal review includes document paragraphs**, using the shared Core passage helper around
  the finding's words. `projects actions list`, its MCP counterpart and key-document review now show this
  context; `--brief` or zero before/after counts still omit it. The guides also explain oversized evidence
  and accepting unchanged findings from a partly stale batch.

## 0.81.0 — 20.10.2026

### Fixed

- **The `person-brief` and `decision-trail` scenario titles start with a capital**, like every other scenario:
  "One person across every tool", "What did we decide about X, across every source". tg, max, zm and drive list
  them under "Works with" from the same text in cli-core 0.370.0, and memo's tests hold its files to it.

## 0.80.0 — 20.10.2026

### Fixed

- **`memo projects evidence` reads a large document once**, not once per search that matches it: a 95 KB document
  matched by five searches charged about 476 KB of the read budget. Needs `@wirecat/cli-core` 0.369.0.

## 0.79.0 — 20.10.2026

### Added

- **`memo projects evidence` gives a document hit the paragraphs around it** and lists a document too large to
  read under `oversized` (text: "too large to read here"), with its reference to open by `memo notes show`.

### Fixed

- **`memo projects evidence` no longer stalls on large documents.** A large document no longer leaves its search
  read-limited, with every `--cursor` continuation retrying the same page and charging the read budget again. Needs `@wirecat/cli-core` 0.367.0.
- **`memo projects actions confirm` accepts the findings whose own cited text is unchanged**, even when another
  finding in the batch cites a changed text; before, the whole batch had to be staged again.
- Guides describe incomplete search results and local record/file export effects without promising
  complete retrieval or unchanged files.
- Guides explain gathering project evidence, reviewing proposed facts and follow-ups, and the
  `agent_decisions` setting, with the separate review path for meeting transcript findings.

## 0.78.0 — 19.10.2026

### Fixed

- **A proposed findings batch whose cited text changed can be rejected** with `memo projects actions reject`; before,
  it could be neither confirmed nor rejected and stayed in the list. Needs `@wirecat/cli-core` 0.365.0.

### Added

- **`memo projects actions` — an agent's proposals for a project, with the evidence to decide them.** `add` stages
  cited facts and follow-ups (references and fingerprints from `projects evidence`; a changed text refuses as
  stale). `list` pages through suggested key documents and findings batches, each cited text shown with whether it
  changed, the text and the messages around it (`--brief` drops them, `--before-n`/`--after-n`). `confirm` creates
  the named findings or confirms a key document, `reject` turns them down. An agent in your terminal, or over MCP
  (`project_actions_*`), decides for you only with `--reason`, kept with the decision; set `agent_decisions: false`
  in the config to keep every decision yours. `projects key-documents list` items carry their `id`. Needs
  `@wirecat/cli-core` 0.363.0.

## 0.77.0 — 19.10.2026

### Added

- **Repeat a project-evidence time window** with `--before-time` (MCP `before_time`), an ISO timestamp with a UTC
  offset used as the exclusive end. Days back are counted from that instant; explicit start dates also
  keep that end. Text output prints the exact cutoff. Reusing a cutoff does not freeze archive contents,
  registered aliases or account scope.

### Fixed

- **Project evidence documentation** distinguishes local search-index catch-up from creating facts,
  tasks or project links; it no longer claims that every evidence call writes nothing.

## 0.76.0 — 19.10.2026

### Added

- **Project evidence includes stored meeting transcripts** when `--source` selects a meeting account,
  its recorded profile or `all`. CLI and MCP return cited transcript cue references dated by the meeting
  start. Superseded/deleted transcripts stay out; missing or pending indexes remain visible. This reads
  existing indexed text and does not fetch recordings or confirm project membership.
- **Shared SDK update:** pins Core 0.358.0 for transcript context reads, retaining Base 0.47.1.
  The store schema and compatibility boundary are unchanged. Intervening messenger chat-membership
  contract changes require no Memo adapter changes; shared consumer compatibility remains checked.

### Fixed

- **A failed timer run no longer keeps its error text in `last.json`** (privacy). That text can name a folder, a
  sender or a subject, and it reached the file, the "scheduled sync failing" line and `memo auto status`. They now
  keep the error code, its reason id and the kind of source (`notes: configuration_error (folder.unbound)`); the
  full message stays on stderr and in the timer's journal, which `memo auto status` names (`log`).
- **A failing source in `memo sync --json` names its reason id** (`failed[].reason_id`, additive), the fixed id
  that `last.json` and `memo auto status` now show beside the error code, as a run that stopped already did.

## 0.75.0 — 19.10.2026

### Added

- **`memo projects evidence` names the other projects, tags and topics its texts mention** (`mentions`, and an
  "also names" line in the text): words found in the excerpts and their context, each cited, never membership. A
  mail hit now shows the emails before and after it in its thread as context.

## 0.74.0 — 19.10.2026

### Added

- **`memo projects evidence` indexes new mail and imported documents for search before it reads**, so a store
  just synced no longer misses them; `--no-catch-up` (MCP `catch_up: false`) reads the index as it is. The
  project's key is searched too, and `--alias` (MCP `alias`) adds more names. The text output says when the index
  could not be brought up to date. `--since-time` also takes a start date (`2026-09-01`); a continued run keeps its end. Each message hit shows the messages next to it in its
  chat as context (`--before-n`, `--after-n`, default 2, MCP `before_n`/`after_n`), never as more hits.

## 0.73.0 — 19.10.2026

### Changed — may break callers

- **`npm install -g` installs the agent skill only when asked.** It wrote the skill into `~/.claude/skills` and
  `~/.agents/skills` by default, and npm hides a lifecycle script's output, so nobody was told. Now
  `MEMO_INSTALL_AGENT=all` (or an agent's name) installs it at install time; otherwise run
  `memo skill install --for all`.
- **`memo commands` without `--json` prints the commands as text, by section** (Read, Write, Organise, Automate,
  Set up), one line each with `(writes)` on a command that changes something, instead of the JSON document. A
  path lists one group: `memo commands mail rules`. `memo commands --json` is unchanged, contract 4.
- **A bare `memo`, or a group without its command (`memo tags`), exits 2 instead of 1**, as the other WireCat tools
  do: it prints the first screen or the group's help, and a missing command is a usage mistake.
- **Adopt Core 0.348.0 and Base 0.47.0**, which move together: a next step in `--json` output may carry `line`, the
  whole command to type. Core 0.348.0 changes no store schema from the 0.347.0 tg and max pin. An SDK consumer that
  pins Core or Base beside memo moves with them.

### Added

- **`memo projects evidence <project> --source <accounts|all>` and MCP `project_evidence`: cited references about a
  project** from stored messages, mail and imported notes folders. An existing project brings its name and aliases;
  each name, `--context-query` and `--contact` is its own literal search, and the hits are joined, each with the
  searches that found it. `--since-time` takes days back (default `60d`). An item found only through a person's
  name is marked `person-only`. A source that failed or has no reader yet (your own notes, meetings) is listed,
  never read as empty, and so is one whose new text still waits for the search index. `--limit` and `--max-pages`
  bound a run, and `--cursor` continues a stopped one with the same window. Nothing is written.

### Fixed

- **`--help` works on the 13 commands that take a query**: `notes list`, `folders list`, `tags list`, `tasks list`,
  `tasks agenda`, `projects meetings list`, `relationships list`, `vocabulary list`, `memories list`, `facts list`,
  `meetings actions list`, `actions list` and `agents log` exited 2 on `--help` as an unknown option (Core 0.347.0). A test now runs `--help`
  on every command.
- **A search that skips meaning for a missing model names the tools that download it** (tg, max or wa), from Core
  itself; memo no longer rewrites a `tg models text download` hint it was handed.
- **`memo commands | head` no longer crashes** with an unhandled `EPIPE` when the reader stops early; memo ignores
  the closed pipe, as the tools built on Core do.

## 0.72.0 — 18.10.2026

### Changed — may break callers

- **`memo --help` and a bare `memo` show a short first screen instead of every command**: what memo is for, eight
  things it does, the other WireCat tools, and where to go next (`memo commands`, `memo guide`, `memo help options`,
  `memo skill show`). A script that read a command or an option from the root help reads `memo --help-all`, which
  prints the old help, or `memo help options`.
- **A command's `--help` ends with Returns, Next usually and Example** in place of its Examples block, worked out
  from the command's definition. `docs/commands.md` shows the same lines.
- **A list command refuses an unknown `--option` before it reads anything**, with commander's message
  (`unknown option '--project'`). `memo tasks list --project HRB` used to answer with a pointer to `project:HRB`.

### Added

- **`memo guide [name]`: scenarios, the commands for a common task in order and why each**, with `--json` for agents.
  `person-brief` gathers one person across tg, MAX, mail, notes, meetings and Drive before a call;
  `decision-trail` finds what was decided about a topic across every source; `start-the-day`, `prepare-meeting` and
  `set-up` stay within memo. Every memo step is checked against the command tree in CI.

### Security

- **`MEMO_READ_ONLY=1` refuses every change with `permission_error` (exit 5)** before the command runs: writes to
  the store and your files, mail trash and restore, the timer, the skill files, `upgrade` and `ask --allow-remote`.
  Reads and `memo sync` still run, and so do `tasks plan` and `tasks link`, which cli-core marks as safe for a
  scheduled agent. `memo mcp` leaves its writing tools out under the lock.

## 0.71.0 — 18.10.2026

### Added

- MCP tools `meeting_actions_add`, `meeting_actions_show` and `meeting_actions_list` stage and inspect
  cited meeting follow-ups for owner review. Exact retries reuse their batch; no confirmation tool is exposed.
- `memo projects context` and MCP `project_context` bring pending key documents, relationships, facts and
  meeting findings together, alongside open numbered tasks. Bounded previews report continuation and source scope.

## 0.70.0 — 18.10.2026

### Changed — may break callers

- **`memo sync --ignore` leaves a file or folder alone for that run.** Notes already imported from it stay in Memo;
  before, the run removed them and the next run imported them again. `notes.ignore` in the config still removes them.

### Fixed

- Project context, key-document commands and search key-document ordering accept an exact project name or alias,
  as meeting searches do. Ambiguous names list candidates; numeric IDs, `project:<id>` and keys still work.
- **`memo sync` reports the files it could not read on every run, also in the text report.** Each folder line counts
  them (`1 not read`) and a line names each file and why, such as a file over 50 MiB or an `.xls`. Before, only the
  first run's `--json` listed them, and the count of notes included them.
- **A notes folder that is gone is a normal error**, `not_found` with the way to fix it, not "this is a bug (ENOENT)".
  `memo doctor` names the same fix in place of a bare `memo folders`.
- `memo notes show` names a link that leads nowhere by its text, in place of an empty entry after a comma.
- The hint for search by meaning gives a command that works without installing tg:
  `npx -y @wirecat/tg-cli local models text download e5-small`.
- The docs: `.doc` files are read and need nothing extra (PDF and Word readers come with Memo); install leads with
  `memo skill install --for all` and explains npm 12's "install scripts blocked"; Himalaya 2.x and its config file;
  the cache folder and `MEMO_AUTO`; plain `memo tasks list` leaves out project tasks; tg and max commands show a
  profile; the README example is real output.

## 0.69.0 — 18.10.2026

### Added

- Prepare a cited packet of stored series history with `memo meetings prepare` or the MCP tool `meeting_prepare`.
  It includes linked people and projects, accepted facts, owner notes and source tasks. You can explicitly add
  a stored messenger profile or mailbox and a literal word query. Memo reports missing history, bounded output
  and continuation cursors; it does not contact a provider or verify the next meeting time.

### Changed — may break callers

- **Commands with no text view of their own print plain lines in place of JSON when `--json` is not given:** one line
  per record for a list (`organizations list`, `projects list`, `reminders list`, `tasks list`…) and `field: value`
  lines for one record (`projects add`, `tasks add`…). A script that read that JSON gets the same data, in the shared
  envelope, with `--json`.

### Fixed

- **A failed mail login no longer holds `memo sync` for a minute.** A read that fails is tried again after 15 s, and
  a refused login or keyring was too, twice per account; with two accounts that took 60 s. It now fails at once.
  A missing himalaya says it is not installed or not on PATH, not `failed (ENOENT): no error text`.
- The README and the installation page give the sizes: the search model is about 135 MB and the install about
  250 MB. The Windows steps say Windows is not tested yet.

## 0.68.0 — 18.10.2026

### Fixed

- **Tasks and reminders work in a store that holds only notes.** A notes folder is an account: `--account` and
  `--source` take it as `notes:<number>` (the `folder_id` search gives) or as the `folder:<id>` Memo's own errors
  show, and `--source notes` names your folder when you have one. Every spelling was refused before, so a task
  could not be made from a note and a reminder needed a mail account. `memo tasks add document:<id>` takes the
  file's folder as its account without `--account`.
- `memo tasks list` and `memo reminders list` without `--source` read every stored account and name them in
  `meta.accounts`, as a search does; they refused before. `memo tasks agenda` still reads one account; the README
  said it covered every account.
- A reminder for a task in a project is refused with the reason: such a task belongs to no account. The message
  said the task was not open. A read given `--account provider:account` is told to use `--source` with that value.

## 0.67.0 — 18.10.2026

### Fixed

- **A store with notes only gets a plain answer from `tasks` and `reminders`.** `tasks list`, `tasks agenda`,
  `reminders list` and `reminders poll` offered a `folder:<id>` value that then failed, and `notes:1` failed with
  "the account is not in the local store". They now list only the accounts that can hold tasks, and with none say
  that a task from a message, email or note, and a reminder, need a tg, max or mail account, and that a project's
  tasks need none.
- `memo search notes` labels a note found by its title as a plain hit, not "(by meaning)".
- `memo tasks list --project SYNT` says to write `memo tasks list project:SYNT`; it failed with a bare syntax error.
- `memo tasks add --project` with an unknown project names `memo projects add`; it pointed to a `vocabulary
  resolve` command that does not exist.
- The README names `vocabulary show` and `vocabulary check`, and the MCP tool `vocabulary_check`; it named
  `resolve` and `preflight`, which do not exist. It links memo's own pages on wirecat.dev, says that search by
  meaning needs tg-cli or max-cli to download the model, and that macOS and Windows are not tested yet.

### Added

- `search meetings` and `meetings passage`, with MCP `search_meetings` and `meeting_passage`, read
  archived meeting evidence through shared Core readers. Explicit source selection, project/label
  aliases, dates and scoped cursors keep searches bounded; MCP also has label, participant, event and
  series selectors. Passages
  include fingerprints for reviewed findings; unknown speakers and archive coverage stay explicit.
  `search all` continues to combine messages, mail and notes.

## 0.66.0 — 18.10.2026

### Added

- `vocabulary inspect <source> <survivor>` and MCP `vocabulary_inspect` preview two explicit tag IDs
  before consolidation. They report assignments, overlaps, aliases, automatic claims and links,
  with bounded samples and a fingerprint of the inspected state. A current unfiltered vocabulary
  fingerprint is required. They merge nothing; coverage names the four inspected dependency tables.

### Fixed

- The README, the MCP page and `memo mcp --help` say what an MCP app can read: your stored messages, mail and notes,
  and a person's context. They said search and context were not served over MCP. Only `memories_add`, `facts_add`
  and `actions_add` write, and what they add waits for you.
- The security page says mail sync looks up sender domain ages by itself, at most once a day, and that Memo asks npm
  once a day for a newer version. It said only `memo mail inspect --domain-age` asked domain registries.

## 0.65.2 — 18.10.2026

### Changed — may break scripts

- **memo's MCP tools name accounts as the CLI does.** `actions_add` takes `account` as `provider:account`
  (`telegram:1`) in place of `provider` and a bare `account`; `search_mail` takes `source` (`email:work`, several
  separated by commas) in place of `account`; `person_context` takes `source` (`telegram:1`) in place of `account`.
  An old argument is refused, as any argument a tool does not take.

## 0.65.1 — 18.10.2026

### Documentation

- The command reference lists `--plain-order` on `memo search mail` and `memo search all`; 0.65.0 shipped it
  without, as the reference had not been generated again.
- The command reference's opening says reads take `--source` and writes take `--account provider:account`; it
  still named `--provider` and `--account`.

## 0.65.0 — 18.10.2026

### Fixed

- **A sync step that fails unexpectedly says why.** The timer's log showed only "the command failed; this is a bug";
  it now adds the error's first line, such as `TypeError: fetch failed`, so a dropped network can be told from a
  real fault. `--debug` still shows the whole message.
- **`memo search mail` fills a page past mail it moves down.** It reads 20 more results than asked, so mail from
  senders with signs of fraud gives its place to the next best result instead of only moving to the end.

## 0.64.0 — 18.10.2026

### Changed — may change search results

- **Mail from senders with signs of fraud comes after the rest of the page** in `memo search mail` and
  `memo search all`: a sender whose fraud signals add up to 3 or more, such as a brand name from another domain or a
  domain under 180 days old. Your own are never moved: a domain you wrote to anyone at, your mailbox's domain, a
  sender a protect rule keeps. `--plain-order` keeps the plain order, to find such mail. The sync log says how many
  senders are ranked lower.

### Changed

- **A read names its accounts with `--source`**, as `memo mentions` and `memo search mail` already do:
  `provider:account` (`telegram:1`, `email:personal`), a provider, a kind or `group:<name>`. `memo tasks list`,
  `memo reminders list`, `memo tags list` and `memo ask` read every account named and say which in
  `meta.accounts`. A read bound to one account (`tasks agenda|show`, `stats tasks show`, `relationships suggest`,
  `context`, `meetings actions list|show`, `projects meetings list`) takes a `--source` that names exactly one.
  `memo sync --source email:work,email:personal` names mailboxes.
- **A write names the one account it acts as with `--account provider:account`**: `memo tasks add|close|plan|link`,
  `memo reminders add|poll|ack|cancel|update`, `memo tags add|remove`, `memo notes add --meeting`,
  `memo actions add`, `memo meetings actions add|confirm|reject`, `memo projects meetings link`. A bare
  `--account 1` without `--provider` is refused. No account, or one that names several, is an error listing the
  choices.

### Deprecated

- `--provider` with a bare `--account` keeps working for one release and prints the new spelling on stderr:
  `--source telegram:1` on a read, `--account telegram:1` on a write. Giving both spellings is an error.
  `memo context --account 1` is `--source telegram:1`; `memo sync --account work` is `--source email:work`.

### Changed — may break scripts

- The `search all` step that lists a hit's tasks carries `args.source` (`telegram:1`) instead of `args.provider`
  and `args.account`; `meetings actions list` and `projects meetings list` name `source` in their page args too.
- `memo ask` takes `--source notes` where it took `--provider notes`.

## 0.63.0 — 17.10.2026

### Changed — may change scores and rules

- **A new domain counts most, and a failed DMARC check only beside another sign of fraud.** `young_domain` adds 5
  (was 3); `dmarc_fail` counts only with `brand_spoof`, `young_domain` or `disposable_domain`, since alone it
  more often marks a real sender's broken setup or a forwarded mail; `reply_to_elsewhere` adds 1 (was 2), as many
  companies answer from a help-desk domain. A `score:` rule can match other senders than before. Every sender is
  scored again on the next sync.
- **Each sync's sender scoring looks up the domain ages it lacks**, for senders you never wrote to and heard from in
  the last two years, so `young_domain` works without running `memo mail inspect --domain-age`. Each lookup tells
  that domain's registry its name.

### Fixed

- **A domain registered again after an email came no longer makes that email's sender young.** The registry gives
  the newest registration, so an old sender whose domain lapsed and was taken by someone else looked new.

## 0.62.0 — 17.10.2026

### Changed

- **cli-core 0.323.0.** An address keeps its city in its value, so the same street in two cities is two places; a
  word of a contact's name counts alone only as a first name or a surname, so a contact named like a company no
  longer turns ordinary words into names; the owner's own accounts belong to the owner. After the upgrade,
  `tg <profile> mentions rebuild person-name place` reads the old texts again.
- memo reads `--source` lists and mention queries through cli-core instead of its own copies.

## 0.61.0 — 17.10.2026

The same code as 0.60.0, published again under a new number. Nothing changed for callers.

## 0.60.0 — 17.10.2026

### Fixed

- **The sync timer no longer stops when a sync takes longer than its interval.** The interval counted from when a
  sync started, so a 6-minute sync on a 5-minute timer left no next run. It now counts from when a sync ends.
  The first sync after updating rewrites the timer.
- **`memo tasks show HRB-12` shows a project's task without `--provider` and `--account`** (cli-core 0.320.0),
  with its evidence links — a task made from reviewed meeting findings, for example. A task of a messenger account
  still needs its account; a bare number is never taken for a project task.
- **memo's MCP tools refuse an argument they do not take**, as every other CLI's tools do: all 22 answer
  `validation_error` (reason `input.invalid`, `param` naming the argument) instead of dropping it, so a misspelled
  filter no longer runs unfiltered. Their advertised input schemas now say `additionalProperties: false`.
- **`memo mcp` is listed as `lifetime: "persistent"`** in `memo commands --json`, like `tg mcp` and `max mcp`: it
  serves until stdin closes. No other command's entry changes.

### Documentation

- **How to read a sender score** in the mail guide: which signals point at a forged sender and which bills share
  with newsletters, and why a platform passing on other names is not a spoof.

### Changed — may break scripts

- **cli-core 0.320.0, the version tg and max pin.** `tasks plan --assignee` names who does a task. Tasks open
  only for questions asked of the owner: every unanswered one in a one-to-one chat, in a group only a reply to the
  owner or a mention.
- **`memo mentions` names what it reads with `--source`, as every WireCat tool does.** `memo mentions list kind:phone
  --source email:personal,email:work`; `--source mail` reads every mailbox and the answer lists them in
  `meta.accounts`; `notes`, `documents` and `group:<name>` work too. The kind argument (`email`, `note`, `document`)
  and `--account` are gone: `memo mentions list email --account personal` is now `--source email:personal`.
  `show`, `confirm` and `reject` take `--source email:<account>` for a mail mention.

### Deprecated

- **`memo search mail --account <account>` is now `--source email:<account>`**, which also takes several mailboxes
  and groups. `--account` still works in this version and prints the new spelling.

## 0.59.0 — 17.10.2026

### Added

- **Mail stored before memo kept Reply-To and Gmail's SPF, DKIM and DMARC verdicts gets them.** Each sync reads
  the header lines of up to 2,000 such emails from Gmail, newest first, until none is left; the text is not read
  again. The sender score then sees these signals on all mail, not only on mail stored since memo began keeping them.

## 0.58.0 — 17.10.2026

### Added

- `memo meetings actions` stages cited meeting facts and project tasks for owner review. Confirmation creates selected records atomically, keeps review receipts and prevents exact retries from duplicating accepted work. Missing dates and assignees stay unknown; stale evidence is refused.
- **Every sender gets its spam score in the store, and search shows it.** Each sync scores the account's senders
  from the stored mail, at most once a day, as `memo mail inspect` scores a group; a hit from a scored sender
  carries `sender_score` (score and signals) in `--json`. Results are not reordered by it. cli-core 0.311.0 (store version 19).
- **`memo mentions list|show|confirm|reject`: phones, e-mail addresses, links, documents, names and street addresses in
  documents, notes and mail.** `memo mentions list note kind:phone`; mail is read only from the accounts named by
  `--account` (repeatable), never every mailbox by default. `show` names the senders of received mail that may own a
  phone or an address (`candidates`), offered and never linked.

## 0.57.0 — 17.10.2026

### Fixed

- **The sender score counts a failed DMARC check only on mail from 2022 on.** Before that, senders often published a
  policy their own mail did not meet yet, so an early failure is no sign of fraud.
- **A broken config file is reported in one line** (cli-core 0.304.0, 0.307.0): the first bad key, a fixed reason
  and a count of the rest, never a value — `config.json: updateCheck is an unknown setting; rename it to
  update_check (and 1 more problem)`. An old camelCase key is named with its new name first.
- **`memo mail status` finishes on a large mailbox** (cli-core 0.307.0): the per-folder count read every email
  again for each one, minutes on a few hundred thousand emails; now seconds.

### Changed — may break scripts

- **The daily "a newer memo exists" line now comes from cli-core, shared with tg and max, and is quieter.** It
  needs stdout to be a terminal as well as stderr: `memo … | less` no longer shows it. Any quiet option written
  with `=` silences it (`--help=…`, `--quiet=…`), not only `--json=…`. `MEMO_AUTO` with any value silences it, not
  only `1`. `--json`, `--jsonl` and `--quiet` silence it anywhere in the command, also after `--`. `--jsonl` is new
  among them.
- cli-core 0.307.0.

## 0.56.0 — 17.10.2026

### Fixed

- **The sender score in `memo mail inspect` no longer flags LinkedIn, Coursera, Quora or Dropbox Sign as brand
  spoofs, nor senders whose DMARC failed only because they signed for another domain.** "Google via LinkedIn" from
  LinkedIn's own domain is LinkedIn passing a page on; Coursera and Quora name courses and spaces after companies;
  hellosign, dropboxmail, onedrive and microsoftadvertising are the brands' own domains. A DMARC failure counts only
  without a valid DKIM signature, and not for a sender that passes DMARC on other mail.

### Documentation

- Distinguish read-only imports from explicit Gmail cleanup and restore throughout the guides and README.

## 0.55.0 — 17.10.2026

### Fixed

- **Import, `memo mail inspect` and `memo mail rules apply` find Gmail's All Mail by its role**, as cleanup already
  did: Gmail names it in the account's language (`[Gmail]/Todos` in Spanish), so an account not in English failed
  with a missing folder. A `folders` list in the config still wins.

## 0.54.0 — 16.10.2026

### Changed — may break scripts

- **`memo search notes` takes the note's source in the query: `'budget source:internal'`, not `--type internal`.**
  `source:file` keeps the notes from folders. `--type` is gone, with no alias. The field is named `source:` as in
  `memo notes list` and the note's `source` in `--json`. It works under OR and NOT and in `--filter` too. The
  `--source notes:<folder id>` option still chooses which folders are read. 0.53.0 on npm still has `--type`: it was
  published before this change.
- cli-core 0.303.0.

### Fixed

- **`bin/release` restarts itself once when the release brings a newer `bin/release`**: folding the changelog and
  raising the version both fast-forward `main`, and the shell went on reading the old script from the byte it had
  reached, so the rest of the run was a mix of old and new text. It now starts the new script over with the same
  arguments; a second change during that run stops it with `run it again`. The restart also works when
  `bin/release` was started from another folder by a relative path. Only the repository's own release is affected;
  the published package does not change.

## 0.53.0 — 16.10.2026

### Changed — may break scripts

- **`memo search notes` takes the note type in the query: `'budget type:internal'`, not `--type internal`.**
  `type:file` keeps the notes from folders. `--type` is gone, with no alias. The field works under OR and NOT and
  in `--filter` too.
- cli-core 0.302.0.

### Fixed

- **`memo mail restore` counts the mail it brings back in the store again.** It left the mail marked deleted, so the
  next `memo mail trash` could not see it and picked other mail, and a new protect rule did not apply to it. Restore
  now also counts again a run's mail found back in All Mail, so a run restored by an older memo or by hand in Gmail
  is set right by running restore once more.
- cli-core 0.301.0.

## 0.52.1 — 16.10.2026

### Changed

- **memo starts about a fifth faster after its first run.** It keeps Node's compiled code in a cache, in the
  system's temporary folder (`NODE_COMPILE_CACHE` moves it): `memo --help` went from about 0.70 to 0.54 seconds.
- cli-core 0.299.0.

## 0.52.0 — 16.10.2026

### Added

- **`memo mail trash --since-time <time>` leaves older mail in Gmail, whatever its rule says.** For keeping old
  years while newer junk is cleaned up; such mail is counted as kept `before_since`, and JSON adds `since`.

## 0.51.0 — 16.10.2026

### Fixed

- **`memo mail trash` and `restore` find Gmail's Trash by its role, not its English name.** Gmail names folders in
  the account's language, so in UK English Trash is `[Gmail]/Bin`; every move to `[Gmail]/Trash` failed and nothing
  moved. memo now asks Gmail which folders are All Mail and Trash (RFC 6154 `\All`, `\Trash`).
- **A missing folder is reported as missing, not as Gmail throttling.** Gmail adds `[THROTTLED]` to answers that
  fail for other reasons (`NO [NONEXISTENT] Unknown Mailbox … [THROTTLED]`), so memo said "try again in an hour"
  for a folder that does not exist.

## 0.50.0 — 16.10.2026

### Fixed

- **`memo mail trash` decides from the store and asks Gmail only about the emails it moves.** It re-read every
  header in All Mail first (about 260k emails), which took minutes and twice ran the account into Gmail's IMAP
  throttle before one email moved. Rules and replied-to senders now come from the store (cli-core
  `mail.emailFacts`); the picked emails' labels and stars are read again just before the move, and a batch is
  checked with one `UID SEARCH` instead of one lookup per email.
- **`memo mail restore` brings back a batch Gmail moved without confirming it.** It restored only batches whose
  move was answered OK; a move Gmail made but answered with a throttle could not be undone by memo.

## 0.49.0 — 16.10.2026

### Added

- **`memo messages show` gives each attachment's extracted text**, next to the name the email lists, so a bill's
  amount reads in one call. Each text is cut at the first 4,000 characters; `--full` gives the whole of it. JSON
  adds `text`, `text_chars` and `text_cut` to each attachment, or `extraction` (why there is no text: a scan
  `needs-agent`, `unsupported`, …).

### Fixed

- **`memo search mail` with `mailbox:` or `NOT mailbox:bulk` answers in under a second**: on a 257k-email store
  `London NOT mailbox:bulk` took 67 s and failed with `query.too-large` (cli-core 0.295.0).
- **An email address works unquoted**: `from:alice@example.com`, `to:` and `cc:` failed with
  `query.unsupported-operator`; cli-base 0.40.0 reads `user@host.tld` as one word.

## 0.48.0 — 16.10.2026

### Added

- **`memo mail trash <account>` moves envelope mail to Gmail's Trash**, after deciding each email again with today's
  rules and labels. It keeps mail a protected or keep rule matches, mail from senders you replied to, starred,
  important, sent and labelled mail, and mail under 30 days old. A preview unless `--yes`; a first run moves at most
  100, later runs 5,000; `--yes` needs a store backup under 8 days old (`backups/last.json` beside the store). Every
  moved email's labels go to a restore log first. **`memo mail restore <account> --run <id>`** moves a run back
  within Gmail's 30 days, and **`memo mail runs <account>`** lists runs. `memo doctor` shows the backup, whether a
  Takeout mbox is imported, and runs that stopped or are close to their 30 days.

### Fixed

- **Release scripts report observed lock holders separately from stale release labels.** Shared
  diagnostics no longer attribute a live lock to a previous run; wait for the holders to finish, then
  retry.

## 0.47.0 — 16.10.2026

### Added

- **`memo search mail` finds a letter by its whole link and by a part of a link**, also a tracking link that mail
  keeps only as its site: `url:"https://news.example.com/click?id=1"`, `link:"/click?id=1"`. Quote both: `?`, `/`
  and `=` mean something else in a query. cli-core 0.294.0.

## 0.46.0 — 16.10.2026

### Changed

- **`memo mail probe` is now `memo mail inspect`.** Same command and output; `inspect` is the shared word for
  looking at a source before taking anything from it, as `tg chats inspect` looks at a link before joining.
- **`memo search notes` names folders with `--source`, as `tg search notes` does.** `--source notes:<folder id>`
  (the id a hit shows), `notes:internal` for notes written in Memo, comma-separated for more. `--folder` is gone,
  and a folder path is no longer accepted: use its id from `memo folders list`. An entry naming no notes account
  is reported on stderr and the rest is still searched.
- **`memo search memories` narrows by scope in the query: `memo search memories friday scope:work`.** `--scope` is
  gone. The query is words and at most one `scope:`, joined by AND; `OR`, `NOT` and other fields are refused
  rather than filtered after the search. The MCP `search memories` tool lost its `scope` argument the same way.

### Fixed

- **A failed mail listing says why.** himalaya 2.2 prints its error on stdout, so memo reported "no error text"; the
  failed line now carries himalaya's `Error:` report, and a `[THROTTLED]` in it is `mail.throttled`.
- **A read that fails once is tried again** after 15 s (`MEMO_HIMALAYA_RETRY_MS`); IMAP commands that write are never
  repeated.

## 0.45.0 — 16.10.2026

### Fixed

- **The `memo auto` timer follows only a global install of memo.** A memo run from another tool's own
  `node_modules` (a docs build, a test tool) used to point the timer at that folder, and once the folder was
  deleted every timer run failed with `MODULE_NOT_FOUND`. A checkout and `npx` were already ignored.

## 0.44.0 — 15.10.2026

### Fixed

- **`memo sync --retry-attachments` reads again only the emails it has to.** It finds the stored emails whose
  attachment a missing reader left unread (`engine-missing`), looks them up by Gmail id and reads those, up to
  `--limit`. Before, it listed the whole window and re-read its newest `--limit` emails, so older unread
  attachments were never reached. `--json` reports `retried: {emails, extracted, still_failed, missing}`. Mail
  read from an mbox file or plain IMAP has no Gmail id, so the flag refuses there.
- cli-core 0.293.0 and cli-base 0.35.0.

## 0.43.0 — 15.10.2026

### Changed

- **`--json=<field>` is checked on memo's own lists too.** `tags list`, `vocabulary list`, `actions list`,
  `agents log`, `projects meetings list` and `folders list` refuse a field their rows lack
  (`output.unknown-field`, with the fields they have) instead of printing empty rows; known fields project as
  before.
- cli-core 0.292.0.

## 0.42.0 — 15.10.2026

### Documentation

- Correct the Takeout resume guidance: completed, unchanged snapshots are skipped; incomplete imports scan again. Replace the retired `tasks.id` search projection example with supported compact hit fields.

### Added

- **Mail rules match more than the sender.** `memo mail rules add|remove --filter <query>` takes `subject:<word>`
  (or bare words), `older:<n>d`, `larger:<size>`, `has:attachment`, `label:<name>`, `is:unread`, `is:bulk` and
  `score:<n>`; `--kind social|newsletters|developer|shopping|alerts` matches a built-in kind of mail. Every
  condition given must hold. `memo mail probe` ends with how much mail each kind would match.
- **`--do protect`** keeps mail whole and out of every cleanup, whatever else matches; `memo mail rules list
  --filter is:protected` lists those rules, and protected rules list first as `PROTECTED`. `rules apply` reports
  `protected_kept`.
- **`--do <action>,tag:<name>`** tags the mail a rule matches; a sync tags what it stores, `rules apply` tags what
  is stored (`tagged`).
- **`memo mail rules import-filters <account> <Filters.json>`** proposes rules from a Takeout export's Gmail
  filters; `--yes` adds them. It reads Takeout's `{"filter": [{query, labelsToAdd, labelsToRemove}]}`: each
  `from:` or `to:` term becomes its own rule, and words become subject words.
- **`--filter` takes `from:<address|domain|word>` and `to:<address>`**: `from:sample` matches a sender whose
  address or display name contains the word.
- **Two more spam signals in the sender score:** `never_opened` (+2, you opened none of a sender's mail) and
  `dkim_not_passed` (+2, Gmail's DKIM check did not pass on most of it)
  ([cli-testing](https://github.com/WireCatLabs/cli-testing/tree/main/performance/mail/spam-scoring)).

### Changed — may break scripts

- `memo mail rules add --do` takes a comma list: one of `skip`, `envelope`, `keep`, `protect`, plus any
  `tag:<name>`. A rules file may hold the new conditions; `rules remove` drops the rule with exactly the
  conditions given.
- **Mail sent to many is marked**: import puts mail with a List-Id, List-Unsubscribe or `Precedence: bulk`
  header in the mailbox `memo:bulk` (accounts with rules), so `memo search mail '… NOT mailbox:bulk'`
  leaves newsletters out. Search keeps them by default: bills and bookings carry the same headers.

### Fixed

- **A rule's tag never fails the mail sync.** A Gmail label the store refused as too similar to an existing label
  stopped the whole account's sync ("similar labels exist"). memo now puts the mail under the label the store
  points to and rewrites the rule to it (`tags_reused`), or skips a tag with nothing to reuse (`tags_skipped`,
  also shown by `memo mail rules list`). `memo mail rules import-filters` maps Gmail labels to existing memo labels
  before proposing, and lists the mapping. Labels stored with capitals or a slash need cli-core's matching fix.

- **An HTML page sent as the text part is read as text.** Some senders (airline itineraries among them) put HTML
  in text/plain, and memo stored the markup. The next `memo sync` converts mail already stored, once per account.
- HTML comments no longer leave their text and a stray `-->` in an email's text.
- `memo search mail --account` takes the account's name, as the rules and `memo mail status` do, or its address.

## 0.41.0 — 15.10.2026

### Changed — may break scripts

- **cli-core 0.288.0 and cli-base 0.33.0**, with no old names kept. Shared commands take the new names:
  `tasks agenda --due` → `--due-within`; `tasks agenda --tag`, `--category` and `--claimed` are gone — write the
  query fields `tag:`, `category:` and `claimed:` instead.
- `memo tasks add --attach <task>` → `--into <id>`, the name cli-core's `tasks add` and `tasks merge` use.
- `memo tags add|remove --chat` shows its value as `<chat>`, as every other `--chat` does; it still takes the
  chat's exact id.

## 0.40.0 — 15.10.2026

### Changed — may break scripts

- **cli-core 0.287.0 and cli-base 0.32.0**, with no old names kept. Shared commands take the new option names:
  `tasks plan --check` → `--remind-time`; `tasks agenda --within` takes a `<duration>`. Every `--json` answer is an
  envelope (`item`, or `items` and `page`).
- **memo's own option names follow cli-base 0.32.0's vocabulary**: `mail rules add|remove --from` → `--sender`;
  `mail rules add --skip|--envelope|--keep` → one `--do <actions>` (`skip`, `envelope` or `keep`; more than one is
  refused); `tags add|remove --path` → `--subfolder`; `facts add --occurred` → `--occurred-time`.
- The MCP tool `facts_add` takes `occurred_time` instead of `occurredAt`.

## 0.39.0 — 15.10.2026

### Changed — may break scripts

- `memo tasks list` answers each task as cli-core's `task` entity, as tg and max do: `kind`, `state`, `key`,
  `title`, `source_message`, `chat`, `account`, `due_at`, `created_at`, `updated_at` and the rest. A task no longer
  carries its message or note preview (`message`, `note`), its `source`, `source_kind` or `group`; `memo tasks show`
  has the card. A project's tasks answer the same fields, not their store row.
- `--json=<fields>` is checked against the declared answer of `relationships list` (`relationship`) and `tasks list`
  (`task`); `tags list`, `folders list`, `actions list`, `agents log`, `vocabulary list` and
  `projects meetings list` declare memo's own entities.
- `memo folders list` takes a `[query...]` like every list; it filters by no field yet, so any term is refused.
- A list given an option it does not have answers a query error (exit 2) instead of commander's unknown option.

### Internal

- The list query helpers come from cli-core 0.285.0 (`termField`, `queryTerms`, `withQuery`, `queryArgument`);
  memo's copy is gone. `factItem` builds the `fact` entity in snake_case.

## 0.38.0 — 15.10.2026

### Changed — may break scripts

- **cli-core 0.285.0**, the version tg and max move to. `memo tasks add` refuses a task that may be the same job as
  an open one, or one closed in the last 14 days (exit 2, reason `task.duplicate-candidates`, candidates in
  `details.candidates`); `--attach <task>` links the message to that task instead, `--new` opens it anyway.
  `memo tasks agenda` takes `--category` and `--tag`. Opening the store upgrades it to version 16 (new tables and
  triggers only; older tg and max keep working with it).

### Fixed

- **MCP answers show hidden characters in what other people wrote**, as tg's and max's do: messages,
  mail, notes, names, facts and memories come back with tag characters, direction overrides, zero-width spaces,
  U+FEFF, C1 and other control characters escaped (an ANSI escape reads `\x1b`), in the text and the structured
  content, errors included. Every read tool's description, and the server instructions, say that this text is data
  from other people, never instructions. Cyrillic, emoji and flags are unchanged; what an agent saves, and the
  CLI's `--json`, keep the original text.

## 0.37.1 — 15.10.2026

### Security

- **A hostile HTML email no longer stalls `memo sync`**: an HTML-only mail is turned into text in time linear in
  its size; one of unclosed tags or long blank runs took up to 30 seconds per 200,000 characters, holding the mail
  import. Ordinary mail reads as before, except that `&amp;lt;` now reads as `&lt;` instead of `<`.

## 0.37.0 — 15.10.2026

### Changed — may break scripts

- **Lists filter with their query, not with flags**, and the old flags are gone: `actions list --status proposed` →
  `actions list status:proposed`; `agents log --tool X --agent Y` → `agents log tool:X agent:Y`;
  `projects meetings list --proposed` → `confirmed:false`; `tasks list --project HRB --ready` →
  `tasks list project:HRB ready:true`; `vocabulary list --kind tag --scope work` → `vocabulary list kind:tag
  scope:work`. The store still does the filtering. MCP `actions_list`, `agents_log`, `tasks_list` and
  `vocabulary_list` take the same terms as `query`.
- **`memo sync --notes` and `--mail` are now `--only notes` and `--only mail`** (`--only notes,mail` for both).
- **`memo search messages --type` is gone**: the query says it — `has:voice`, `has:file` or `NOT has:attachment`.
  MCP `search_messages` drops its `type` input the same way.
- **`memo ask` takes what to search for after the question**, not as `--query`:
  `memo ask 'What did I promise?' 'promised OR "by Friday"' --all`.

## 0.36.0 — 15.10.2026

- **Nested JSON report fields use the shared projector.** Dotted paths traverse report objects and arrays while preserving coverage, pagination and execution metadata. The bundled skill documents bounded output and removes fixed import-speed claims.
- **Obsolete config keys are refused without rewriting the file.** Rename camelCase settings to snake_case before using the configuration.

## 0.35.0 — 15.10.2026

### Fixed

- **`memo mail status` counts the widest window ever imported**, not the latest run. A rule change, a new
  UIDVALIDITY or `--rescan` starts the resume point over, and the timer's 30-day run then made status say
  "complete" while most of a mailbox was still unread. The widest window and the last run are now shown apart;
  `--json` gains `folders[].since` and `folders[].last`.

## 0.34.0 — 15.10.2026

### Changed — may break scripts

- **Option names follow the shared vocabulary of cli-base 0.31.1**, with no old names kept:
  `notes add --about` → `--subject`; `notes add|edit --file` → `--text-file`; `notes export --to` → `--output-dir`;
  `ask --model` → `--analyze`; `mail probe --limit-groups` → `--limit`; `vocabulary create`, `vocabulary aliases
  add|remove` and `projects meetings link --expected` → `--fingerprint`; `projects meetings link --provenance` →
  `--reason`.
- **The config file is read only in snake_case**: a camelCase setting such as `mail.maxBodyChars` or a rule's
  `decidedAt` is refused, and old folders are no longer moved at start (cli-core 0.283.0).
- `@wirecat/cli-base` 0.31.1, `@wirecat/cli-core` 0.283.0.

## 0.33.0 — 15.10.2026

### Changed — may break scripts

- **`facts list` and `memories list` take a query, not filter flags**: `memo facts list kind:decision
  status:proposed project:HRB`, `memo memories list scope:work subject:"person:42"`. The store filters by the
  terms, joined by AND; `--type`, `--status`, `--kind`, `--scope`, `--project` and `--subject` are unknown options
  there now. MCP `facts_list` and `memories_list` take one `query` string instead of those arguments.
- **Facts and memories answer cli-core's `fact` and `memory` entities**: a fact's `type`, `statement` and `source`
  are `kind`, `text` and `origin`; a memory's `body` is `text`. `facts add` takes `--kind` instead of `--type`,
  and MCP `facts_add` takes `kind` and `text` instead of `type` and `statement`. `--json=<field>` on facts and
  memories refuses a field the entity lacks.
- **`tags list` and `relationships list` take a query**: `memo tags list tag:follow-up type:note`, `memo
  relationships list 'about:"project:1"'` instead of `--tag`, `--type` and `--reference`. `--provider` and
  `--account` stay on `tags list`: they pick the accounts, they do not filter rows.
- **`tasks list` and `notes list` take a query**: `memo tasks list state:done`, `memo tasks list kind:bug --project
  HRB`, `memo notes list source:internal text:budget`, `memo notes list 'about:"telegram:Kai Sample"'` instead of
  `--state`, `--about`, `--source` and `--search`. `about:` stands alone: the notes it finds through links are no
  longer narrowed further. `--project` and `--ready` stay on `tasks list`: they pick which tasks are read. A next
  page of `notes list` carries the query.
- **`notes show`, `notes add` and `notes edit` answer cli-core's `note` entity**: `labels` and `provenance` are
  gone from `notes show` (`tags` keeps the tag names); each of `links` is `{to, target_text, kind, anchor}` and each
  of `backlinks` is `{from, target_text, kind, anchor}`. `--json=<field>` refuses a field a note lacks.
- **`search all` answers cli-core's `hit` items**: `key` is gone (key documents still come first with
  `--project`), and a result's open `tasks` moved into `next`: a `tasks list source:"<ref>"` step for the account
  holding them. The `missing: tasks` entry is gone.
- **`search` over several accounts no longer runs as the first one**: it runs as memo and reads exactly the
  accounts selected. An account error lists the accounts to choose from.
- **cli-core 0.281.0**: a note whose title matches the query ranks first in `search notes` and `search all`, and
  lists `title` in `found_by`.
- **`memo tasks link` is cli-core's, the one tg and max have:** a `task:<id>` target links two project tasks as
  before (`--kind blocked-by`, `follow-up-of` or `related-to`, now `related-to` when not given); a message, chat,
  person or URL target links a messenger account's task to it, with `--provider` and `--account`. The old form
  keeps working: `memo tasks link HRB-2 HRB-1 --kind blocked-by` (a bare id with `blocked-by` or `follow-up-of` is a
  task; with `related-to`, when that task exists — otherwise it is refused with "write task:<id>"). `--json`
  answers `{ item: { relations } }`, the task's relations after the link, where it printed `{ relation, changed }`.
  `tasks unlink` and `tasks relations` are unchanged.

### Added

- **`tasks list source:"<ref>"`** keeps an account's tasks from one message, note or document.

### Added

- **`memo tasks agenda`, `tasks plan`, `tasks show` and `memo stats tasks show`**, the same commands tg and max
  have: cli-core's builders, mounted with `--provider --account`, so memo's agenda reads any messenger account the
  store holds. Without them a command fails and lists the accounts.

## 0.32.0 — 15.10.2026

### Changed

- **Mail rules live in the store**, beside the mail they decide, instead of `config.json`. `memo mail rules list`
  counts every rule's emails in one query (it took minutes with hundreds of rules), and each envelope email
  remembers the rule that recorded it. The first command that reads rules moves them from the config, checks
  they all arrived, then drops them from it; the old config stays as `config.json.<time>.before-rules-in-store`
  (mode 600) and stderr says so once. A keep rule whose reason says "never remove" becomes protected.

### Added

- **`memo mail rules export <account>`** prints the rules as JSON; **`memo mail rules import <account> <file>`**
  adds them, replacing a rule with the same match.

### Changed — may break scripts

- **Every `--json` answer, and every MCP answer, is the standard envelope.** One thing comes in `item`, a list in
  `items` with `page` (`mode`, `limit`, `has_more`, and `next_page` where the command takes `--page`), and each
  answer carries `meta` with its `run_id`. Before, most commands printed the bare record. `commands --json` reports
  contract 4.
- **`--offset` is now `--page`** in `notes list`, `search notes` and `projects meetings list`; MCP `search_notes`
  takes `page`. A list that only grows with `--limit` says `has_more` and names no next page.
- **`search notes`** lists its notes in `items`, not `hits`; why meaning was not searched is in `missing`. Its
  `linked` summary is no longer in JSON or MCP (the text view keeps it): ask `memo context <person>` instead.
- **`search all`** carries the open tasks that point at a hit on that hit, as `tasks`; the accounts read are
  `meta.accounts`, and a resource it could not read is a `meta.issues` entry.
- **`folders list`** puts the folders known only from another computer in the same list, with `path: null`;
  **`tags list`** puts labels on notes, people, projects and folders in the same list as source labels, one row
  per label with its `origin`, instead of a separate `knowledge` list.
- **`search all`, `search messages`, `search mail` and `search notes` answer cli-core's entities**, as tg and max
  do: `search all` items are `hit`s (`excerpt`, `sender_name`, `sender_ref`, no `text` or `from`), `search messages`
  and `search mail` items are the `message.hit` view (`ref`, not `locator`; no whole `text` — `messages show` has
  it). `--json=<field>` refuses a field the entity lacks, and a bare `--json` at a terminal asks which fields.
- **`search notes --tag` is gone**: `tag:work` goes in the query or in `--filter`; MCP `search_notes` takes
  `filter` instead of `tag`.
- **`notes add` and `notes edit`** answer the note itself as `item`, so `--json=id` works; with `--export` the
  file written is the note's `export_path`.
- **Search by meaning, when its model is missing,** says tg or max downloads it, not a `tg` command as memo's
  own.
- **`mail rules remove`** answers the rules left as `rules`; `relationships suggest` answers a list and no
  longer names its scope; `reminders list` and `reminders poll` answer lists.

## 0.31.0 — 14.10.2026

### Added

- **`memo doctor`** says where memo keeps its files and what needs attention, and connects to nothing: the settings
  file, the store and its schema, the notes folders and their ids, the mail accounts and Himalaya's version, the
  search model, the timer (including a program it runs that is gone, and its failing streak) and the agent skill's
  version. Each problem names the command that fixes it; the exit code is 1 while one is left. `--json` answers
  `{item, meta}`.
- **`memo upgrade`** updates memo with the package manager that installed it; `--check` only looks. Once a day memo
  asks npm for a newer version and says so in one stderr line, only to a person at a terminal — never with
  `--json`, in a pipe or on a timer run. `"update_check": false` or `MEMO_NO_UPDATE_CHECK=1` turns it off.
- **`memo mail probe` scores each sender group** for spam, scams and robots, with the signals behind it: Gmail's
  DMARC verdict, a brand in the display name sent from another domain, Reply-To on another domain, a
  throwaway-mail domain, bulk mail never replied to, Gmail's Spam, and replies from the owner (−5).
  `--domain-age` adds the sender domain's age from its registry (RDAP), asked once per domain and kept.
- **Gmail's SPF, DKIM and DMARC verdicts and Reply-To are kept** on new mail: in the headers of mail stored in
  full, and in the metadata of envelopes. Listing reads two more header fields, about 1 KB an email instead of
  300 bytes.

### Changed

- **Config settings are named in snake_case:** `mail.max_body_chars`, `mail.max_attachment_chars`, and `list_id`
  and `decided_at` in `mail.accounts[].rules[]`, which `memo mail rules` writes and prints that way. The camelCase
  names older versions wrote are still read, and the file is saved in snake_case; both spellings with different
  values are an error. Renaming inside `rules` needs the cli-core release carrying PR #1224.

### Fixed

- **A himalaya that exits before reading its input no longer crashes memo** with an unhandled `write EPIPE`; the
  failure is reported with how himalaya ended, as for any other himalaya error.
- **The timer follows the memo you run.** After a Node.js switch and an install under the new version, the next
  memo command points the `memo auto` unit at it, so removing the old Node.js no longer breaks the timer silently.
  A checkout or `npx` never moves it.
- **The timer keeps the places memo was started with.** `memo auto start` records `MEMO_CONFIG_DIR`,
  `MEMO_STATE_DIR`, `MEMO_CACHE_DIR`, `MESSAGING_STORE` and `WIRECAT_STATE_DIR` in `auto.places` and passes them to
  every timer run, which used the default places before.
- **A failed Himalaya call says why.** The message names the exit code or signal and Himalaya's last line, instead
  of repeating the command; `exit_code`, `signal` and the last five stderr lines, with passwords and tokens cut,
  are in the error's details. Gmail's `[THROTTLED]` is its own reason, `mail.throttled` (`rate_limited`), with the
  advice to wait an hour or more.

## 0.30.0 — 14.10.2026

### Added

- **A mail sync goes on where the last one stopped, without listing the mailbox again.** Each run keeps, in the
  store, the mailbox's UIDVALIDITY and the UIDs whose outcome is final (stored, recorded or skipped by a rule), so a
  rerun reads metadata only for mail not done: a large mailbox is no longer listed whole on every run. A whole listing — the only kind that marks deleted mail and refreshes labels and read state — still runs
  at least daily, whenever the rules change, when UIDVALIDITY changes, and with the new `memo sync --rescan`. A
  window under 5,000 emails, like the timer's 30 days, is listed whole every run. An mbox file read to the end is
  not read again until its size or time changes. `memo sync --json` adds `pass` (`full` or `resumed`) to each
  account.
- **`memo mail status <account>`** says how far an account's import is, from the store: stored in full, recorded
  as envelopes, and done of the mail in the widest window searched, as cli-core's progress line;
  `--json` answers the shared progress shape.
- **Mail stored in full keeps List-Id, List-Unsubscribe and Precedence** in its headers (`list-id`,
  `list-unsubscribe`, `precedence`), so a rule can later be matched from the store.

- **`--json=id,title` keeps only those fields** of an answer's item or items, read the way tg and max read it
  (cli-core 0.277.0's `liftJson` and `checkJson`). Adopts cli-core 0.277.0 and cli-base 0.28.2.

## 0.29.0 — 14.10.2026

### Added

- **A failing timer run is said on every command.** While the last `memo auto` run failed, every memo command
  writes one line to stderr — `memo: scheduled sync failing since 2026-10-14 00:58 (12 runs): notes … has no
  folder id — memo auto status` — until a timer run passes. `memo auto status` shows `failing` (`since`, `runs`,
  `reason`). Runs are kept in `<state>/auto/last.json` with cli-core's `recordRun`; the timer run itself and a sync
  started by hand do not print or count.
- **Mail stored in full keeps its size at the source** (RFC822.SIZE), as envelopes already did.

### Changed

- **On cli-core 0.274.0 and cli-base 0.28.1.** Every answer's `meta` has
  `complete`; `memo sync` answers `complete: false` with `issues` (`{ code, source }`) when a source failed, and
  each entry of its `failed` list carries `code`. Errors carry `retry: { safe, after_ms? }`.
- **Every command declares its effects** in `commands --json`, now contract 3: what it reads or writes on the mail
  server or a model, and on this machine. A failed read is marked safe to retry (`memo sync` while another sync
  runs, for one); before, nothing was, because a command with no effects counts as a write.

## 0.28.0 — 14.10.2026

### Added

- **`memo mail rules apply <account>`** cuts mail stored in full that an envelope rule matches down to its
  envelope: text, attachments and search entries go, sender, date, size, labels and the subject in metadata stay.
  A dry run by default that says per rule how many emails and how much text it would cut; `--yes` cuts them.
  Matching reads the headers from the mailbox, as `memo sync` does. Mail only a skip rule matches stays as
  stored. It takes the sync lock and refuses with `sync.running` while a sync runs.

## 0.27.0 — 14.10.2026

### Changed

- **Every JSON key memo prints is snake_case**, on the CLI and in MCP: `has_more`, `next_offset`, `key_documents`,
  `your_notes`, `not_read`, `from_them`, `proposed_by`, `creation_fingerprint`, `already_stored`,
  `deletions_skipped`, and the rest. A note's front matter, an email's headers and metadata keep their own keys.
  `memo commands --json` says contract 2.
- **`memo sync --json` prints the shared envelope:** `{"item": {"notes", "mail", "failed", …}, "meta": {"run_id",
  "duration_ms", "accounts"?}}`. What was the whole answer is now `item`.
- **Notes search uses cli-core's names:** a hit's line is `excerpt`, and `found_by`, `has_more`, `next_offset`,
  `meaning_skipped`, `links[].target_text`.
- **More registered reasons:** `folder.unbound` (with `path`), `folder.not-found`, `note.not-imported`,
  `mail.account-unknown` (with `account`), `mail.rule-not-found`, `mail.source-failed`, `mail.invalid-imap`,
  `project.not-found`, `person.not-found`, `identity.no-messenger`, `auto.systemctl-failed`.
- A missing embedding model is recognised by its reason, `model.not-downloaded`, not by its text.
- Moves to `@wirecat/cli-core` 0.268.0 and `@wirecat/cli-base` 0.27.2.

## 0.26.0 — 14.10.2026

### Changed

- **Errors are one object, the same on the CLI and in MCP:** `{"error": {"code", "reason", "message", "param"?,
  "details"?}}`. The CLI prints it as one JSON line on stderr in machine mode and `✗ message` at a terminal; MCP
  returns it as `structuredContent` with `isError`. A failure that is not memo's own is `internal_error` /
  `command.crashed` and its text is hidden. A bad option is `validation_error` with Commander's words, exit 2.
- **New global `--debug`** prints the whole error record after the object: the thrown text, cause and stack.
- **memo registers its own reasons** in `APP.errors`: `sync.running` (with `pid`) for a sync refused by the lock.
- A source that fails during `memo sync` shows its registered message; a crash's text shows only with `--debug`.

### Added

- **`memo mail rules add --envelope`** records matching mail without its text: sender, date, size, labels and
  the Gmail id, with the subject in metadata and out of search. `memo mail rules list` shows how many emails
  each envelope rule recorded and their size. A keep wins over an envelope, an envelope over a skip; removing
  an envelope rule or changing it to keep reads those emails in full on the next sync. `memo sync --json`
  reports `envelopes` beside `skipped`.

### Fixed

- **The `memo auto` timer no longer fails when a sync is still running.** A timer run that finds the lock held
  exits 0 and writes `memo sync skipped: …` to stderr (`skipped` in `--json`). A sync started by hand still
  refuses with `rate_limited` / `sync.running`.
- **The missing-model hint names the CLIs that download it** — memo has no `models` command: `tg or max
  downloads it: tg models text download e5-small`. MCP `search_notes` no longer suggests `memo models …`.

## 0.25.0 — 14.10.2026

### Added

- **`memo mail probe <account>`** groups an account's mail by sender and List-Id from headers only (about 300
  bytes an email): emails, size, unread and bulk shares, years, whether the owner ever wrote to the sender,
  and a `skip` suggestion for large, bulk, never-answered groups. `--json` for agents.
- **`memo mail rules list|add|remove <account>`** keep the owner's skip/keep decisions by sender, domain or
  List-Id in `mail.accounts[].rules`; a keep wins over a skip. `memo sync` never reads or stores an email a
  skip rule matches and reports it as `skipped`; mail stored before stays.
- **Google Takeout mbox accounts** (`"mode": "mbox", "path": "…"`, with the Gmail address) import old mail by
  Gmail's message and thread ids, so it joins the IMAP account's mail. The file is read in one streaming
  pass; it only adds mail, never marks any deleted, and syncs only when named with `--account`.

### Fixed

- **`memo sync` imports a mailbox of more than ~120,000 emails.** A long `--since-time` window failed with
  "Maximum call stack size exceeded" before saving anything.
- **`memo sync --mail` reads mail about ten times faster.** Emails are fetched raw, up to 50 (or 20 MB) per
  IMAP call instead of one himalaya call each, and parsed in-process with `postal-mime`. An email that cannot
  be read or parsed is listed under `unreadable` and tried again next run instead of failing the account.
- **Listing a mailbox of several hundred thousand emails no longer reads one huge answer.** All Mail is listed
  10,000 emails per himalaya call.
- **A whole-mailbox `memo sync` no longer loads every stored email's text.** The deletion check and the "already
  stored" check read only Message-IDs and mailboxes, in one query each, instead of every body and one lookup per
  listed email.
- **A mail marked deleted by mistake is saved again when IMAP lists it again.** It used to count as already
  stored and stayed without its text. An mbox archive still leaves mail that IMAP proved deleted alone.

### Changed

- **Depends on `@wirecat/cli-core` 0.265.0 and `@wirecat/cli-base` 0.27.1.** `@wirecat/cli-core` is the new name
  of `@wirecat/cli-messaging`; opening the store with it runs store migrations up to version 7. `memo commands
  <path> --json` says `inherited_options` instead of `inheritedOptions`, and its `contract` is 1.
- **`attachments[].part` and an attachment's `providerRef.part` count the email's attachments from 0** instead
  of being himalaya's MIME part index. Attachments stored earlier keep theirs.
- **Mail bodies are read from the raw message.** Text matches the old reader once whitespace is collapsed; blank
  lines, spaces at line ends and joined flowed lines may differ. HTML parts that the old reader filed as attachments are now the body, and attachments the old reader
  named `attachment-N` keep their real file names.
- **`memo sync --help` and the agent skill say how long a large first mail import takes**, and that Gmail caps
  IMAP downloads per day.

## 0.24.0 — 13.10.2026

### Added

- **An agent skill, as tg has.** `memo skill show` prints it and `memo skill install --for claude|agents|all`
  writes it where Claude Code, Codex and Gemini CLI look; a global npm install does that too, unless
  `MEMO_INSTALL_AGENT=none`. It starts with the traps agents fell into: choosing an account, `content:` and
  answer keys, starting project work with `memo projects context`, `--as-owner`, accepting their own proposals,
  writing message text to files, old versions and zsh word splitting.

- **Key documents of a project.** `memo projects key-documents add <project> <note:|document:|msg:> --reason
  <text>` marks what to read first about one project; `remove` and `list` go with it. `memo projects context`
  starts with them — title, path, why, who marked it — and keeps a mark whose source is gone as
  `available: false`. `memo search all` and `search notes` with `--project <project>` put the project's key
  documents first, labelled `key`, and leave nothing out. An agent's mark waits unconfirmed and names the agent.

- **Every command shows one to three examples** at the end of its `--help` and in `memo commands --json`
  (`examples`). A test runs each through memo's own parser, so an example never names a command, option or value
  memo does not take.

### Changed — may break scripts

- **The local store and the search models move to one WireCat folder** (cli-messaging 0.258.0):
  `~/.local/share/WireCat/` on Linux and macOS, `%LOCALAPPDATA%\WireCat\Data\` on Windows. The first start of
  memo, tg or max after the update moves `wirecat.db` and the models there, once; the old folders stay.
  `WIRECAT_STATE_DIR` moves the whole folder and replaces `CLI_COMMON_CACHE_DIR`.
- **An MCP tool failure that is not a memo error is `internal_error`**, the shared name; it was `generic_failure`.
- **`memo notes about` is gone; `memo notes list --about <subject>` returns what it did.** The list now holds the
  notes about the subject and the notes linking it, a note about it, or a name two people share, each with `via`
  (`about`, `link`, `through`, `name`), the headings it links under (`anchors`) and, for `name`, the name as written
  (`linkText`). It still pages and combines with `--source` and `--search`. A person's
  notes include those about any of their messenger identities.

- `memo context` tells you to run `messages sync <chat>` for chats not read in full; the hint said `store fetch <chat>`, which cli-messaging 0.256.0 renamed. Text read from a CSV attachment or note now comes as rows (`name: Bravo; value: 200`), not raw comma separated lines.
- **`memo commands --json` prints cli-base's commands document**, the shape tg and max print: `cli`, `version`,
  `contract`, `description`, `globalOptions`, `commands`, `exitCodes`. `items` is gone; `memo commands <path> --json`
  puts the one command under `commands` with `scope` and `inheritedOptions`.
- `memo import` is now `memo sync` (owner, 2026-10-12; WireCat glossary in cli-messaging). `memo import` stops working. `memo auto start` writes `memo sync` into the unit; a timer installed before runs `memo import` and fails until `memo auto start` is run.
- **A write from an agent's terminal is the agent's.** `memo facts add`, `memories add`, `relationships add`
  and `actions add` run with `AI_AGENT` or `CLAUDECODE` set record the agent as author (`claude-code`, the
  name before the version in `AI_AGENT`), as the MCP server does: the fact or memory waits as `proposed`, the
  relationship unconfirmed with `provenance: agent:<name>`. They were recorded as the owner's and accepted.
  `--as-owner` keeps a write yours inside an agent's terminal.

- **One meaning per flag (WireCat command standard).** A flag that takes several values is given once per value:
  `memo notes add --about a --about b`, `sync` and `search notes` `--folder a --folder b`.
  `reminders add` and `update` take `--at-time` instead of `--at`. `relationships add` takes `--reason <text>`
  instead of `--evidence`, which in `facts` and `memories` names references. `--project` takes a key or
  `project:<id>` in `facts add`, `facts list` and `tags add|remove`, as it does in `tasks`; `tags --folder` takes a
  folder's path as well as its id; `projects add --organization` takes a bare id as well as `organization:<id>`.

- **One way to bring notes and mail in: `memo sync` (WireCat command standard, no two commands overlap).**
  `memo notes import` and `memo mail <account> import` are gone. `memo sync --notes` and `--mail` take one side;
  `--folder` and `--ignore` narrow the notes, `--account <name>`, `--since-time <time>` (a date, ISO 8601 or
  `30d` ago), `--limit <n>` and `--retry-attachments` narrow the mail. Without `--account` it reads every account
  and names each. `memo mail <account> show <reference>` is `memo messages show <reference>`.
- **Verbs from the shared list.** `facts accept` and `actions approve` are `confirm`; `actions propose` is
  `actions add`; `tasks readiness` is `tasks status`; `tasks ready` is `tasks list --ready --project <project>`;
  `auto on` / `off` are `auto start` / `stop`; `reminders schedule` / `snooze` are `reminders add` / `update`;
  `vocabulary resolve` is `vocabulary show`; `vocabulary preflight <name>` and `vocabulary audit` are one
  `vocabulary check [name]`; `memories search` is `search memories`. The old names stop working.
- **MCP tools follow their commands:** `actions_add`, `search_memories`, `tasks_relations`, `tasks_status`,
  `tasks_list` (with `ready`), `vocabulary_check` (with or without `name`) and `vocabulary_show` replace
  `actions_propose`, `memories_search`, `task_relations`, `task_readiness`, `tasks_ready`, `vocabulary_audit`,
  `vocabulary_preflight` and `vocabulary_resolve`.

### Fixed

- **Mail hints name `memo sync --mail`.** `memo search mail` and its MCP tool named `memo mail <account> import`,
  which is gone.
- **`memo sync` keeps `mail.maxBodyChars` and `mail.maxAttachmentChars`.** Only `memo mail <account> import`
  read them; the timer stored mail with the defaults.
- **Every argument and option of memo is described in its help**, and every summary is lower case, at most 80
  characters.
- **A command path given as one argument is refused with the words to type.** `memo "projects add" --help` — what
  a zsh loop over `"$c"` passes — printed the root help; it now says `"projects add" was given as one argument;
  run: memo projects add`.
- **Search help says where file text and references are.** `search messages`, `search mail` and `search all` say
  `content:`, `transcript:` and `filename:` narrow a search to the text of files, voice transcripts or file names, and each search's `--help` and MCP
  tool names the list (`items` or `hits`) and the reference (`locator` or `ref`) of its `--json` answer. The usage and
  troubleshooting guides say the same, and to compare `memo --version` with npm before reporting a bug.
- **The search guide names `content:` for messages.** It narrows a search to the text of files, in
  `memo search messages` and `memo search all` as in tg; the guide listed it for mail only.
- **`memo projects context` and `memo organizations context` refuse what the store does not hold** with
  `not_found` instead of an empty answer, and `organizations context` takes `organization:<id>` as well as
  its id.
- **`memo folders attach` refuses drive-cli's `google-drive:` folder**, and `memo folders list` marks it "kept by
  drive" (`keptBy: "drive"` in JSON) instead of offering to attach it. Bound to a disk folder, the next import
  would have deleted the Drive documents missing from it.
- **`memo search all` no longer runs as the first stored account.** It searched every account before too, but
  picked one as its own; now it runs as memo's notes and its answer names every account it read, as `accounts`
  (`{ resource, provider, account }`) in JSON and a `searched:` line on stderr. `memo search messages` and
  `memo search mail` stop picking one as well.

## 0.23.0 — 12.10.2026

### Fixed

- **An MCP answer over 4 MiB is refused with `invalid_response`**, as cli-messaging's tools refuse one, instead of
  reaching the agent whole.
- **Memory, fact, action and agent-log lists say whether there are more** (`hasMore`, CLI and MCP), as the other
  lists do; asked for the whole 500, a full answer says it may have more. `tasks list` (of an account), `tasks
  ready` and `tasks_ready` give each task its `task:` reference.
- **Terminal answers name things by the references memo's commands take.** `notes list` and `context` printed a
  bare note id that `notes show` refuses; they print `note:`/`document:` references. `notes show` printed only the
  text; it starts with the reference, path or title, update time and tags, and ends with what it links and what
  links it. `context` names the person as `person:<id>` and each message by its `msg:` locator, and tasks as
  `task:<id>`. `tags list` names a chat as `chat:…`, a contact as `<messenger>:<id>` and every other label's
  target as `<type>:<id>`, not as JSON. `context --json` gives each of your notes its `ref`.

## 0.22.0 — 12.10.2026

### Changed

- **Built on `@wirecat/cli-base` 0.21.0, the framework's new name, and the shared library 0.254.0.** Nothing
  changes in memo's commands; `memo search` answers carry `nextOffset` where the shared search gives it, and
  `memo context person:<id>` takes the `person:` references search answers give.

### Added

- **`memo mail <account> show <reference>` opens one stored email whole**, by the `msg:email/…` reference search
  answers give: time, sender, To, Cc, labels, subject and the whole body; `--before-n`/`--after-n` add the emails
  of its thread either side, `--json` the same as data. The reference must be of the named account.
- **The MCP server searches every source.** `search_all`, `search_messages`, `search_mail`, `search_notes` and
  `person_context` read the same store as `memo search` and `memo context`. memo is where an agent searches across
  messengers, mail and notes; tg and max will search only their own messages
  ([which tool owns which command](https://github.com/WireCatLabs/cli-messaging/blob/main/docs/dev/TOOL-BOUNDARIES.md)).

### Fixed

- **`memo ask` gives coverage as counts per account, and its 64 KiB limit covers the whole answer.** Each
  messenger account had one row per chat, up to 500, which could fill most of an answer; now `chats` counts `checked`, `complete`, `partial`, `neverFetched`, `behind` and `withGaps`, and `more`
  says the 500-chat check was cut short. The size check measured the evidence only; it now measures what is printed.

## 0.21.0 — 11.10.2026

### Fixed

- The hint after a search without the meaning model names the command that downloads it,
  `tg models text download e5-small`; it named a `memo models` command that does not exist.
- `memo projects context` finds a project by its key (`HRB`) or `project:<id>` as well as its id;
  a key gave an empty answer.

### Changed — may break scripts

- **`memo search mail` and `memo search messages` show each hit as a reference, then who and when, then an
  excerpt.** For an email the second line names To, Cc and its Gmail labels, and the third its subject; the whole
  body comes back with `--full`. `--json` gives each email `email` (from, to, cc, bcc and reply-to with their
  `person:` references, labels, thread, read and starred) and an `excerpt` instead of the whole `text`; `--brief`
  keeps only reference, title, time, sender, excerpt and score. Mail search no longer answers `coverage`.
  Built on the shared library 0.251.0.

### Fixed

- **Mail import no longer files Cc addresses under To.** Mail imported before keeps them in both; search shows
  them in Cc only.

## 0.20.0 — 11.10.2026

### Added

- The guides in `docs/` follow the wirecat.dev tool layout: an overview, daily use, how memo works,
  recipes, troubleshooting, memories and a generated command reference (`pnpm generate`), written
  for readers who do not use a terminal every day.
- `memo commands [path] --json` lists the command tree and its options, as tg, max and drive do, so
  documentation and agents can check a command before running it.
- Every command has a description in `--help`, including organizations, projects, relationships,
  reminders and task listing.

## 0.19.0 — 11.10.2026

### Added

- `memo mcp` tells a connecting agent when to save: what happened is a fact (`facts_add`), what it
  concluded is a memory (`memories_add`), something to do is `actions_propose`, each with evidence,
  and only what will matter later. `memo search …` and `memo notes show` end their `--help` with
  the same hint for `memo facts add` and `memo memories add`.

### Changed

- **Mail meaning search finds the email that holds the answer.** Mail is cut into pieces email by email again,
  with re-quoted text, greetings and signatures still left out; before, a piece spanned several emails of a thread
  and a hit named the newest of them. The first index run after the upgrade cuts stored mail again once and embeds
  it again. Built on the shared library 0.249.0.

### Fixed

- Release preparation stops if another session advances main while its version PR or local
  checks are running. Review the new main before retrying; stale preparation cannot merge a
  redundant version heading or dispatch an unverified source.

## 0.18.0 — 11.10.2026

### Fixed

- The source changelog has one 0.17.0 heading after release preparation raced with its feature
  merge. Vocabulary commands and the shared-store pin remain the same as 0.17.0.

## 0.17.0 — 11.10.2026

### Added

- **Owner-reviewed label creation:** `memo vocabulary create` requires the current preflight
  creation fingerprint. Similar labels are checked in the shared store, including implicit
  tagging; stale approvals fail. Exact aliases continue to reuse their canonical label.
  `vocabulary audit` discovers existing lexical synonyms with explicit work/output budgets and
  incomplete-scan reporting; it never accepts or merges them.

- **Mail search filters by read and starred state, and takes `label:`.** `memo search mail` accepts `is:unread`,
  `is:read`, `is:starred` and `label:` (the same as `mailbox:`), and `date:>=2026-01-01` as well as
  `date>=2026-01-01`. Built on the shared library 0.246.0.

## 0.16.0 — 11.10.2026

### Added

- **Project meetings and task dependencies.** `projects meetings list|link` requires the exact
  meeting provider/account and accepts a canonical project key or explicit alias. `tasks link|unlink`
  manages reviewed blocked-by/follow-up-of/related-to edges; `relations`, `readiness` and `ready` expose
  the shared task graph. Ready discovery claims nothing. MCP `task_relations`, `task_readiness` and
  `tasks_ready` are read-only. Built on the actual published shared library 0.242.0; new project keys
  use 3–4 characters and existing keys remain valid.

- **Canonical vocabulary discovery and reviewed aliases.** `vocabulary list|resolve|preflight` shows
  stable project/tag/topic IDs, explicit aliases and likely lexical label duplicates. Owner
  `vocabulary aliases add|remove` requires the current preview fingerprint. Read-only MCP tools
  `vocabulary_list`, `vocabulary_resolve` and `vocabulary_preflight` let an agent reuse the catalog;
  they cannot accept or change aliases. `facts_add` can attach its proposed fact to a canonical project.



## 0.15.0 — 11.10.2026

### Changed — may break scripts

- **`memo mail <account> import` replaces `memo mail import --account <name>`; the old form is gone.** `<account>`
  is the name in `mail.accounts` and is required even when one account is configured: memo no longer falls back
  to the first. A missing or unknown name is an error that lists the configured ones. A mail import now takes the
  lock `memo import` and the timer take, so the two never run at once. `memo import` still imports every account.
- **`bin/mail-password <account>` requires the account**; without it the script prints its usage and the
  configured names instead of assuming `gmail`.

### Added

- **`memo search mail --account <address>`** searches one mail account; without it, every mail account. An
  address the store does not hold is `not_found` and lists the ones it does.

## 0.14.1 — 11.10.2026

### Fixed

- **npm installs the packages side by side again.** Built on `@wirecat/cli-messaging` 0.241.0, whose
  `@wirecat/cli-meetings` 0.4.2 accepts cli-core 0.20.0. With 0.240.0, npm put cli-messaging in a nested folder
  with a second copy of cli-core.

## 0.14.0 — 11.10.2026

### Changed — may break scripts

- **On macOS memo keeps its files where it does on Linux**: `~/.config/cli-memo`, `~/.local/share/cli-memo` and
  `~/.cache/cli-memo` instead of `~/Library/…`. The first run moves the old folders there, with the shared store.
  While a messenger `serve` or an MCP server is running it prints one warning, keeps using the old folders for that
  run and tries again next time. Linux and Windows are unchanged. Built on `@wirecat/cli-messaging` 0.240.0.

## 0.13.0 — 11.10.2026

### Added

- **`mail.maxBodyChars` and `mail.maxAttachmentChars`** in the config set how much of an email body (default
  1,000,000 characters) and of one attachment's text (default 200,000) `memo mail import` keeps.
- **`memo facts add|list|show|accept|reverse`: what happened, with its evidence.** A fact is a fact, statement,
  question, decision or promise. Yours is accepted at once; an agent's waits as proposed. A decision with
  `--supersedes` ends the one it replaces once accepted; `reverse` ends an accepted decision. `memo mcp` offers
  `facts_add`, `facts_list` and `facts_show`.
- **Tasks of your own in a project.** `memo tasks add --project <key> --title <title> --type bug|feature|chore`
  makes one with no source. `--priority`, `--parent`, `--description` and `--assignee` work on any task;
  `memo tasks update <id>` changes them, `memo tasks list --project <key>` lists a project's tasks and
  `memo tasks close` closes one.

### Changed — may break scripts

- **memo runs on `@wirecat/cli-messaging` 0.238.0**, store version 2: upgrading a store moves its kind-fact
  memories into facts and copies task assignments; older memo builds still open it.
- **Mail is searched by meaning thread by thread**, without re-quoted text: the first `memo mail import` after the
  upgrade cuts every thread again and embeds the mail once more. Search by words is unchanged.
- **A memory's kind `fact` is gone**: what happened is a fact now (`memo facts`). The store moved existing
  kind-fact memories into facts, evidence and links included.
- **`memo tasks assign` takes `--role` (assignee, reviewer or watcher) and no `--provider`/`--account`.** It
  writes the task's assignees, which `memo context` reads, instead of an `assigned-to` relation.

## 0.12.0 — 11.10.2026

### Added

- **`memo notes add --meeting <id> --provider <provider> --account <account>` writes a note about a meeting.**
  It takes the meeting's store id, as `memo tags add --meeting` does, and adds the same
  `meeting:<account id>/<meeting id>` subject beside any `--about`. A meeting the account does not hold is
  `not_found`.

### Changed — may break scripts

- **memo runs on `@wirecat/cli-messaging` 0.235.0.**
- **Read and starred stay current.** `memo mail import` updates read and starred on mail it stored earlier, as
  the mailbox shows them now, without reading the mail again.
- **Generic IMAP accounts get flags.** Their messages record read and flagged, and a flagged one carries the
  `Starred` label, as a starred Gmail message does, so `search mail mailbox:starred` finds both.
- **Long emails are kept whole.** A body was cut at 20,000 characters; it is now kept up to 1,000,000, and the
  store cuts it into pieces for search.

## 0.11.0 — 11.10.2026

### Changed — may break scripts

- **memo runs on `@wirecat/cli-messaging` 0.233.0.** An imported email's attachments are now found by meaning
  too: their text is cut into pieces and embedded after import, and tg/max `search conversations` answer a match
  in an attachment with its email.

## 0.10.0 — 11.10.2026

### Added

- **Gmail labels and stars reach the store.** `memo mail import` reads each message's labels (`X-GM-LABELS`) and
  flags: every label, Inbox, Important and Sent included, becomes a label mailbox with a plain name, a starred
  message also gets `Starred`, and new mail records read and starred. `search mail mailbox:important` finds them.
  Labels are replaced on every run, as Gmail's list is whole; folders keep the per-scan rule, and only folders
  decide whether missing mail was deleted. A label line the import cannot read leaves that message's labels as
  they were.

## 0.9.0 — 11.10.2026

### Added

- **A meeting can be tagged and written about.** `memo tags add|remove --meeting <id>` with `--provider` and
  `--account` labels a stored meeting, `memo tags list --type meeting` lists them, and `memo notes add --about
  meeting:<account id>/<meeting id>` writes a note about one.
- **`memo memories`** — `add`, `list`, `show`, `search`, `confirm` and `stale` for what you and agents
  concluded, each with its evidence and a `personal` or `work` scope. Yours are confirmed at once; an agent's
  wait as proposed.
- **`memo actions`** — `propose`, `list`, `show`, `approve` and `reject`. Approving makes the action a task
  in the account that would act; nothing is sent.
- **`memo agents log`** — what agents did through the MCP servers, by tool and agent, never the arguments.
- **`memo mcp`** — an MCP server on stdio with `memories_add|list|show|search`, `actions_propose|list|show` and
  `agents_log`. What an agent writes is authored by `memo-mcp` and waits for you; every call is logged.

### Changed — may break scripts

- **memo runs on `@wirecat/cli-messaging` 0.232.0.** `search mail` takes `to:`, `cc:`, `bcc:` (a person, as
  `from:`), `subject:` (words of the subject alone) and `mailbox:` (a folder or Gmail label).
- **`search` and `search all` help say what `search all` does not read** — people, memories, projects,
  organizations and decisions — and send a kind you know to its own search.
## 0.8.0 — 11.10.2026

### Changed — may break scripts

- **Mail goes into the store's mail tables.** `memo mail import` saves each email through cli-messaging's
  `store.mail` (0.231.0): threads, emails, To/CC/BCC, folders as mailboxes, and attachment text on its email.
  Ids stay the same, so a `msg:email/…` reference, tag or note made before still resolves. Mail saved as
  messages by earlier imports stays searchable and keeps its old deletion rule; it is read again into the
  mail tables as the window covers it. While both exist, `deleted` counts stored rows: a mail deleted at the
  source counts its email, its older message and any older attachment entry. An attachment is no longer its own
  entry: the import report drops `attachments[].locatorId`, and a note on an attachment entry stays on that older
  entry.
- **Tags, tasks and person context read the mail tables.** `tags list` keeps a tag on an email, `tasks add` takes an
  email's `msg:email/…` source, and a person's tasks and context include their mail.
- **Mail is embedded from the mail tables.** After saving, `memo mail import` embeds new mail's chunks (cli-messaging's
  `embedMail`), so tg and max `search conversations` keep finding mail by meaning. `--no-embed` and a missing model
  behave as before.

## 0.7.1 — 11.10.2026

### Fixed

- Mail search, evidence bundles and person context also read email stored in dedicated mail tables.
  Older mail imports remain supported; search results list each email locator once.

## 0.7.0 — 11.10.2026

### Changed

- **memo runs on `@wirecat/cli-messaging` 0.226.0.** The store prunes its growing logs on open, at most once a
  day: agent tool calls older than 90 days are deleted, and a handled bot update older than 30 days loses its
  payload. Upgrade tg-cli and max-cli first, as all three share the store.
- **`organizations add --kind`, `projects add --type` and `--scope` take their allowed values from the store**
  and refuse any other value before the store is opened, naming the allowed ones.

### Fixed

- **`memo --version` prints the package's version.** It printed 0.4.0 since 0.5.0: the number lived in a file the
  release did not update. A test now fails when that file and `package.json` disagree.
- Package references, documentation and fixtures use the WireCat namespace throughout.

### Security

- **The old `messages.db` is deleted** when the store opens at its default path: the unencrypted file used
  before `wirecat.db`, with its `-wal` and `-shm`. One line on stderr names it. It is kept when
  `MESSAGING_STORE` is set, and while another process still has it open.

## 0.6.1 — 11.10.2026

### Fixed

- Package references, documentation and fixtures use the WireCat namespace throughout.
- The printed Memo version matches the published package version.

### Changed

- **memo runs on `@wirecat/cli-messaging` 0.221.0.** The store prunes its growing logs on open, at most once a
  day: agent tool calls older than 90 days are deleted, and a handled bot update older than 30 days loses its
  payload. Upgrade tg-cli and max-cli first, as all three share the store.
- **`organizations add --kind`, `projects add --type` and `--scope` take their allowed values from the store**
  and refuse any other value before the store is opened, naming the allowed ones.

### Fixed

- **`memo --version` prints the package's version.** It printed 0.4.0 since 0.5.0: the number lived in a file the
  release did not update. A test now fails when that file and `package.json` disagree.

## 0.6.0 — 10.10.2026

### Changed — may break callers

- **memo runs on `@wirecat/cli-messaging` 0.218.0 and `@wirecat/cli-core` 0.19.3**, the store in `wirecat.db`.
  The old `messages.db` is left as it is and not read: import notes and mail again, and run
  `memo folders add <path>` for each folder, since a folder id from the old store is not in the new one.
- **`memo entities` is replaced by `memo organizations` and `memo projects`** (`add`, `list`, `context`),
  as the store now keeps them apart; `tags --entity` is `--organization` or `--project`, and `entity:`
  references are not found. An organization is a company, team, family or community; a project has a key.
- **A file in a notes folder is `document:<id>`, a note written in memo `note:<id>`.** `notes show`,
  `tags --note`, `tasks add` and `--about` take either; a bare id is a written note's. Search evidence and
  links name a file's note by `document:`.

### Security

- Fast secret checks remain on PRs; source, production dependency and workflow security checks run before publication. Automatic Socket checks are disabled.

## 0.5.1 — 10.10.2026

### Changed

- **The project is now licensed under Apache License 2.0.** See `LICENSE` for the terms.

## 0.5.0 — 10.10.2026

### Changed — may break callers

- **The package is `@wirecat/cli-memo` and its repository belongs to WireCatLabs.** Use this package for installations and updates.


## 0.4.0 — 09.10.2026

### Changed — may break scripts

- The shared store drops the copies kept for older versions (store version 28, cli-messaging 0.212.0).
  Notes, relations and entities written before the notes refactor are copied into their new tables once,
  during the upgrade. After it, an older tg, max or memo refuses the store with "upgrade this tool" —
  update all three together.

## 0.3.0 — 09.10.2026

### Changed — may break scripts

- Search commands now live under `search all|messages|mail|notes`, using the shared services and ranking.
  `search all` returns typed source hits and a separate `tasks` list for linked open work. The old
  `memo search <query>` and `memo notes search` paths are removed without aliases. Use `search notes --type`
  instead of `notes search --source`; `--all` and `--note-text` are no longer needed.

- Pin shared SDK 0.211.0 alongside Telegram/MAX. Legacy copied note task sources move to native note IDs
  without changing task IDs, account scope or closed states. Upgrade the coordinated tools together
  before opening the shared owner store.

### Fixed

- `search all` finds messages on a store that has not yet recorded the account it runs as, and asks the
  messenger's server the way `search messages` does. `search mail` with no mail imported answers an empty
  result with a note. Notes found by meaning must be as similar as conversations already have to be, so a
  rare word no longer returns every note.

### Added

- `tasks add note:<id> --provider <provider> --account <account>` creates tasks from native file or internal
  notes. Lists resolve the current note preview; deleted notes leave tasks intact. Confirmed note-about-person
  links and explicit assignments contribute to person context. Unified search includes tasks whose note matches.
  Repeated creation reuses the existing task of the same kind, including closed tasks.

## 0.2.1 — 08.10.2026

- Pin cli-messaging 0.205.0 to match the coordinated Telegram/MAX release. Native notes, links and
  source references retain the same schema and behavior.

## 0.2.0 — 08.10.2026

Notes are their own records in the shared store (cli-messaging 0.202.0, store versions 25–27), no longer
messages of a `notes` provider.

- `memo folders add|attach|list`: a folder of notes gets its id from the store, and each computer's
  config binds it to that computer's path and format (`obsidian` or `markdown`). `list` shows folders the
  store has from another computer. A folder imported before store version 25 moves its path into the
  config on the first run. Import refuses a folder with no id instead of inventing one.
- Import writes notes, their links and their file tags. A link to a note the folder has once is stored
  by the note's id; a name no note has stays as written and resolves to a person as soon as one by that
  name, alias or username exists. A moved file keeps its id, links and tags. A tag you added stays when
  the file stops stating it. What a computer last saw of
  each file is kept in memo's state folder, and only a changed file is opened — also to look for
  `memo-id`, which marks a file memo exported and keeps it out of the import.
- `memo notes add|edit|remove|list|show|export` for notes written here about messages, chats, contacts,
  people, entities, tasks and other notes; `--export [dir]` and `notes.export` write them as files that
  carry `memo-id` and are never overwritten once edited.
- `memo notes about`, `memo context` and `memo note` read saved links: notes about a person, notes
  linking them, notes linking a note about them. A full name found in a note's plain text is no longer
  listed as a guess. The old `people-notes.json` moves into the store as `about` links, once.
- `memo notes search` runs on the shared notes index: words and stems, the messages' query language,
  `--exact`, `--source`, `--folder` by path or id, and by meaning when e5-small is downloaded — `memo
  import` and `memo notes import` embed the notes (`--no-embed`, `notes.embed: false`). Each hit says what
  found it (`foundBy`), and a person a found note links is named. `memo search --all` covers notes;
  `--note-text` also retrieves authored note text.
- Entities and relationships are the owner's: `entities` and `relationships add|list|remove|confirm`
  no longer take `--provider`/`--account`. `memo tags add --note <id>` labels a note; `--person`,
  `--entity` and `--task` need no account. `--folder <id> [--path <subfolder>]` labels every note under a
  folder or subfolder, replacing `--chat` with `--provider notes`. `tags list` says whether a note's tag
  came from its file.
- Notes are read through a format: `obsidian` adds inline `#tags` and reads `[label](path.md)` links
  besides `[[wiki links]]`; `markdown` reads plain Markdown links. Links to `person:`, `msg:`, `note:`,
  `entity:`, `task:`, `chat:` and `contact:` references are recognised in both.

- Open tasks and explicit document-task assignments in person context; tasks add/list/close reuse the
  shared task service. Multiple matching accounts require explicit selection.
- CSV/TSV, PDF, DOCX, XLSX, ODT/ODS, PPTX and EPUB ingestion through shared extraction, with optional-engine and unsupported
  format reporting, file/text bounds, content hashes and page/row/cell provenance.
- Configurable Gmail/IMAP folder coverage, stable Message-ID identities, attachment text sources and
  bounded resumable email indexing. Partial listings never prove deletion; changed folder scopes skip deletion.
- Canonical-person/task/entity labels, manual organization/family/project relationships, selected-source
  unified retrieval, and cited evidence bundles/model proposals with explicit remote consent.
- Durable local task reminders with lease receipts, acknowledgement, stale-edit checks, snooze/cancel
  and automatic cancellation when a task closes. No outbound delivery or source-system mutation.

- `memo tags add|remove|list`: local labels on imported notes, emails, messages and folders/threads,
  addressed by note/folder IDs, message locators or an exact provider/account/chat. Labels are case-insensitive,
  shared with tg/MAX and preserve source files and mailboxes; deleted sources are hidden from listing.
- `memo notes search --tag <tag>` filters word and semantic results using shared tag eligibility,
  including labels on the note's folder.

## 0.1.2 — 07.10.2026

- cli-messaging 0.166.0, matching the final tg and max release pins, including protected conversation
  preparation during search and history fetch.

## 0.1.1 — 07.10.2026

- cli-messaging 0.164.0, matching tg and max source: person context now finds private dialogs with no
  recorded members, restoring the last message each way and direct messages in existing Telegram stores.

- The release workflow can dry-run a version already on npm, so packaging can be checked between
  releases. Publishing still refuses an existing version.

## 0.1.0 — 06.10.2026

- The `memo` command, with `--version` and `--help`.
- `memo notes about <name>` (was `memo notes <name>`): notes about a person, notes that link them, and weak plain-name mentions, from
  Markdown folders given with `--folder` or `notes.folders` in the config.
- `memo mail import`: a Gmail account's All Mail into the shared message store through Himalaya, read only;
  Gmail thread and message ids, resumable with `--max`, and deletions at the source drop the stored text.
- `memo note`: the note about a person, kept per person of the shared store. Linking identities is
  `tg|max contacts link`, not a memo command.
- `memo notes import`: Markdown and text notes into the shared store as provider `notes`; edits kept as
  revisions, deleted notes lose their text. `memo notes search <text>`: notes by their words, with the
  people they link and the known people whose full name they mention (a guess).
- `notes.ignore` in the config and `--ignore`: files, folders or globs never read or stored.
- `memo import`: notes and mail in one run, incremental — notes keep a manifest of size, change time and
  content hash in the store, so unchanged files are not read and identical ones not saved. A lock stops two
  runs at once; a failing source does not stop the others.
- `memo auto on [--every 5m] | off | status`: a systemd user timer for `memo import`. The config's
  `auto: { enabled, every }` is the source; the timer follows a hand edit at its next run.
- `memo context <messenger>:<person>`: one answer about a person — cli-messaging's person context across
  every linked identity (mail included), the note about them and the notes naming them, with what was not
  read and why. Needs cli-messaging 0.150.0, which tg and max pin.
- Notes are embedded for search by meaning: `memo import` and `memo notes import` build each changed folder
  and embed new chunks with the local e5-small model, at most 600 a run, resuming next run; `--no-embed` and
  `notes.embed: false` skip it. `memo notes search` ranks by meaning and words together (`by` on each hit) and
  falls back to words when the model is missing.
- cli-messaging 0.153.0, as tg and max pin: a long note or mail is embedded in overlapping pieces, whole.
