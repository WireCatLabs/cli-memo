# Changelog

Notable changes to `@wirecat/cli-memo`, one section per version, newest
first. Versions follow [semantic versioning](https://semver.org/); before `1.0.0` a minor release may change
the API.

## 0.67.0 — 18.10.2026

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
  again. The sender score then sees these signals on all mail: on the owner's mailbox 57,000 of 92,000 emails
  stored in full had none.

## 0.58.0 — 17.10.2026

### Added

- `memo meetings actions` stages cited meeting facts and project tasks for owner review. Confirmation creates selected records atomically, keeps review receipts and prevents exact retries from duplicating accepted work. Missing dates and assignees stay unknown; stale evidence is refused.
- **Every sender gets its spam score in the store, and search shows it.** Each sync scores the account's senders
  from the stored mail, at most once a day, as `memo mail inspect` scores a group; a hit from a scored sender
  carries `sender_score` (score and signals) in `--json`. Results are not reordered by it. On the owner's mailbox:
  5,789 senders in 15 seconds. cli-core 0.311.0 (store version 19).
- **`memo mentions list|show|confirm|reject`: phones, e-mail addresses, links, documents, names and street addresses in
  documents, notes and mail.** `memo mentions list note kind:phone`; mail is read only from the accounts named by
  `--account` (repeatable), never every mailbox by default. `show` names the senders of received mail that may own a
  phone or an address (`candidates`), offered and never linked.

## 0.57.0 — 17.10.2026

### Fixed

- **The sender score counts a failed DMARC check only on mail from 2022 on.** Before that, senders often published a
  policy their own mail did not meet yet; on the owner's mailbox every failure was from 2018 to March 2021, all from
  real senders. Senders at 3 or more on the strong signals: 20 → 2, both look-alike domains.
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
  without a valid DKIM signature, and not for a sender that passes DMARC on other mail. On the owner's mailbox the
  senders at 3 or more on these signals went from 71 to 20.

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
  `dkim_not_passed` (+2, Gmail's DKIM check did not pass on most of it). On the owner's mailbox they raised the
  share of Gmail Spam reaching score 3 from 22.9% to 84.2%, with the same 1 of 63 replied-to senders flagged
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
  rerun reads metadata only for mail not done: a 305,000-email mailbox no longer costs 15–25 minutes of listing
  per run. A whole listing — the only kind that marks deleted mail and refreshes labels and read state — still runs
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
  messenger account had one row per chat, up to 500, which made 95% of an answer (64 KB of 68 KB on one real
  store); now `chats` counts `checked`, `complete`, `partial`, `neverFetched`, `behind` and `withGaps`, and `more`
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
