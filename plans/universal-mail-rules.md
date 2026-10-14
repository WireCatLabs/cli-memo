# Plan: universal mail rules

Status: proposed, waiting for the owner's approval. Nothing here is built yet.

## Why

memo's mail rules started as an import filter: three actions (`skip`, `envelope`, `keep`) matched by sender, domain or
List-Id, kept in `config.json`. They now have to serve more than that:

- **One real mailbox needs 429 rules.** Each rule is one sender or list, so the config file grows with every
  newsletter, and every memo process parses it.
- **`memo mail rules list` takes over 7 minutes with 467 rules.** It counts the emails of each rule one at a time.
- **`memo mail rules apply` re-lists the whole mailbox (38 minutes for 305,000 emails).** A fully stored email
  keeps no List-Id, so matching has to read the headers from the mail server again.
- **Some mail must never be cleaned,** whatever any rule or preset says: an example is government notices.
- **The same kinds of junk appear in every mailbox:** social notifications, newsletters, shops. A new user should not
  have to write 400 rules to get a clean mailbox.

## 1. The rule model

A rule is **conditions → actions**, like a mail filter.

**Conditions:** all are optional, and all given must match.

| Condition | Example |
|---|---|
| sender address | `alerts@shop.example` |
| sender domain (with subdomains) | `shop.example` |
| List-Id | `weekly.news.example` |
| subject words | `invoice`, `receipt` |
| age | older than 2 years |
| read state | never opened |
| size | over 5 MB |
| has attachments | yes / no |
| mail server label | `Promotions` |
| bulk signal | List-Unsubscribe present, `Precedence: bulk` |

**Actions in memo:**
- `full`: store the text and attachments (today's `keep`);
- `envelope`: store sender, subject, date, size, labels and id, without text;
- `skip`: store nothing;
- `tag <name>`: add a memo tag. A tag combines with any of the other three.

**Actions on the mail server.** These come later, in stage 3, and only after the local archive is verified:
- archive;
- add a label;
- mark read;
- move to Trash.

Each one runs only from an explicit `memo mail clean … --yes` after a dry run, never during sync.

**Precedence, from strongest:**
1. **protected:** a rule flag, not an action. Mail it matches is always stored in `full`, and no cleanup may archive,
   trash or cut it, whether it comes from a rule, a preset or a later `apply`. Use it for government notices, banks
   and tax mail. A protected match makes `memo mail clean` refuse that email and say why.
2. `full`, then `envelope`, then `skip` (as today: a keep for one sender beats an envelope for its domain).
3. An explicit rule beats a preset.

## 2. Storage: rules move into the shared store

- **Where:** a `mail_rules` table in the shared store. cli-core owns the table and its migration, as it does for
  emails and threads. memo reads and writes rules through a store port (`store.mail.rules`), and never through
  SQLite directly.
- **Columns:**
  - `account_id`;
  - `conditions` (JSON);
  - `actions` (JSON);
  - `protected`;
  - `source`: `owner`, `preset:<name>`, `probe` or `gmail-filter`;
  - `reason`;
  - `decided_at`.
- **Loading:** one query per account at the start of a process. A long-running process (`memo mcp`, a server) keeps
  the rules in memory and reloads them when the table's change counter moves, so a rule added from the CLI takes
  effect without a restart.
- **Migration (automatic, no command):** the first run of the new memo moves `mail.accounts[].rules` from `config.json` into the table, keeps
  a copy at `config.json.rules-backup`, and removes the key. The move happens once.
- **Review as a file:**
  - `memo mail rules export <account> > rules.json` writes them out;
  - `memo mail rules import <account> rules.json` reads them back, after a dry-run diff (added, changed, removed);
  - this way an owner or an agent can review hundreds of rules in an editor, and keep a copy in a private repository.

## 3. Built-in presets

A **preset** is a named, versioned rule shipped with memo, not a list of addresses: for example, "newsletters" = bulk
signal + List-Id present + the owner never replied. An owner turns a preset on per account (`memo mail rules preset
on <account> newsletters --action envelope`). Explicit rules still override it, in either direction.

| Preset | Matched by |
|---|---|
| social notifications | well-known social network senders, notification addresses |
| newsletters | List-Id + List-Unsubscribe, never replied to |
| developer notifications | code hosting, CI and error-tracker senders |
| shopping and promotions | shop senders, the mail server's Promotions label |
| alerts | monitoring and uptime senders |

**A preset compared with explicit rules:**
- A preset adapts to new senders of the same kind without a new rule.
- An explicit rule is exact and auditable.
- `memo mail rules list` shows both, with each preset's match count, so the owner sees what a preset caught.

**How an agent proposes rules:**
1. The agent runs `memo mail probe <account>` (headers only).
2. It suggests presets and explicit rules with counts and sizes.
3. The owner confirms, by category rather than rule by rule: "turn on newsletters as envelope, except these three".
4. Agents never add a rule unasked; a confirmed suggestion is saved with `source: probe`.

**Gmail filters as a starting point:** a Takeout export holds the owner's own filters in
`Mail/User settings/Filters.json`. `memo mail rules import-filters <account> Filters.json` turns each filter into a
suggested rule: "skip the inbox" and "delete" become `envelope`, a label becomes a tag. The owner confirms them like
probe suggestions.

## 4. Performance

- **Counts in one query:** `rules list` computes every rule's count and size with one grouped query over the envelope
  mailboxes and the stored headers, not one query per rule. The target is under 2 seconds for 500 rules.
- **Match from the store:** full emails also store the List-Id and the bulk signals (they already store sender and
  subject). `rules apply` and `rules list` then match locally, without listing the server. A server listing is needed
  only for mail not yet stored.
- **The sync resume point** (cli-core's resumable-sync standard, adopted by memo after cli-core's next release) means
  a sync after a rule change lists only new mail.

## 5. Not in scope

- Server-side actions (archive, label, trash): stage 3, a separate plan, after the archive is verified.
- Sharing rules between accounts or users.
- A rule editor UI.
- Any change to tg, max, drive or zoom.

## Order of pull requests

1. **cli-core:** the `mail_rules` table, its migration and the `store.mail.rules` port. Store List-Id and bulk flags
   on full emails. Released by the cli-core release owner.
2. **memo:**
   - read and write rules through the port, and migrate them from `config.json`;
   - add `export` and `import`;
   - fix the grouped counts.
3. **memo:** conditions beyond sender, domain and list; the `protected` flag; tags.
4. **memo:** presets and `import-filters`.

## Decisions (owner, 2026-10-14)

1. **Protected mail is a rule flag**, not a separate list. It blocks every cleanup, local and on the server.
2. **Presets are proposed after the first probe** of a mailbox. Nothing applies until the owner confirms.
3. **The move out of `config.json` is automatic** on the first run of the new memo, with a backup. There is no
   separate command for it.
