### Added

- **Base stages: `memo stages show|create|rename|move|remove|list|set|confirm`.** The owner's own stages
  of deals and of leads, the columns of a board across every pipeline and CRM, and every other stage mapped onto
  them, suggested by memo and confirmed by the owner. Each command takes `--json`. In a group they count and list only
  the group's pipelines and the owner's own. Editing the base set and `confirm` are the owner's own
  (`stage.owner-only`). An agent's `stages set` stays a suggestion. `deals move` and `leads move` take a base stage's
  `stage:<id>`: the owner's deal moves to the one stage of its pipeline mapped there. Several give
  `stage.choice-required` with `candidates`, none gives `stage.unmapped`, and a CRM's copy gives `stage.crm-copy`
  with its `writes_with`. Rows of `deals list` and `leads list` gain `base_stage`, `null` until confirmed. Needs the
  cli-core release with base stages (store version 60).
- **`writes_with` on CRM rows of `deals list`, `leads list` and `pipelines list`**: the CLI that changes the row on
  its CRM (`tool`), the row's `account`, and the `profile`, named only when exactly one profile of that CLI is on the
  account; otherwise `null`, with `profiles` and `why`. In a group, a profile on an account outside it is never named.
  The owner's own rows have `null`. WireCat Desktop's Clients board reads it to move a card's stage through b24.
- **`memo relationships roles list [list:<list>] | add <list> <role> [--label] | remove <list> <role>`**: the roles a
  relationship may take, built in and your own (cli-core's role lists). Only you change them; one still held is kept.
- **`memo search people` finds a person you added by name only.**
- **`memo relationships add --kind reports-to|customer-of|partner-of`, `--position` (the job title), `--start-date`,
  `--end-date`**, and `relationships update --position --start-date`. `memo relationships end <id> --end-date <date>` says
  a relationship ended; it stays, as `ended`.
- **`memo organizations context <ref>` is the organization's whole picture** (cli-core's `organizationContext`): its
  people by role, customers, suppliers and partners, projects, open deals and leads, invoices, payments and orders as
  stored, how much its people wrote, open tasks, categories and `coverage`, then its notes and tags.
- **`memo deals context <ref>` and `memo leads context <ref>`, `--brief` for an agent** (cli-core's `dealContext`):
  stages, client, people with roles and standing, owner, project, money reached by project or client, its people's
  messages, mail and meetings in its lifetime marked `proposed`, open tasks and `coverage`.
- **`memo deals update <ref> --project <key>`** (and `leads update`) sets the project a deal belongs to, a CRM's copy
  too; an empty value clears it.
- **`memo organizations list category:client`**, and `supplier`, `partner`, `employer`: read from relationships.
- **`memo relationships list` filters `kind:`, `role:`, `standing:`, `from:`, `to:`, `at:<day>`, `include:ended`**
  and pages with `--limit` and `--page`, the pending proposals with them (cli-core's `listRelations`). `about:` gives
  each row its `direction` (`outgoing` or `incoming`) and an incoming one its `inverse` (`manages` for `reports-to`). Every row shows its `standing` and the account that reported it; a role
  saved before the role lists is kept and marked `custom`.
- **`memo search all --only crm`** searches deals and leads alone; `search all` names them in its help.
- **Account groups: `memo <group> …`, `MEMO_GROUP` and `MEMO_GROUP_LOCK` (WC-ACCT-13).** Memo reads every account
  by default (`all`, also `memo all …`); a group is an opt-in list you save. A first word that is no command is a
  group: `memo work search all "renewal"` reads only its accounts. Without `--source` a read takes the group; a given
  one is narrowed to it, and an outside `--account` is refused. A command that reads one kind, such as `search mail`,
  takes the group's accounts of that kind. A word that is neither a command nor a group names the groups. What you
  made yourself (notes, projects, tasks, invoices, memories, facts) shows in every group. `MEMO_GROUP_LOCK=work` pins
  the process, `memo mcp serve` included, and fails closed: only the commands that keep to a group run, and a
  reference or a bare id of account data outside it, another group, `all` and every group change are
  `permission_error`. Under the lock, evidence, sources, proposals and actions of an outside account are left out
  and counted, never shown or decided, and a context counts the accounts it kept out instead of naming them.
  `pipelines list` and `pipelines show` keep to the group too: in a group, a name means the group's pipeline of that
  name. Needs cli-core with the group lock (cli-core#2632).
- **`memo groups list | add <group> <source> | remove <group> <source> | move <source> <from> <to>`.** The
  list shows each account with its profiles in every app, why it is in, `also_in`, the duplicates and the
  profile-name suggestions. `memo groups add work <provider>:<account>` is the command a CRM sync's `group_hint`
  names.

### Changed — may break callers

- **`memo context person:<id>` reads every account that saw the person** (cli-core's `canonicalPersonContext`): two
  accounts no longer ask for `--source`, and a CRM-only or name-only person answers too. Every context has
  `business` (organizations, reporting lines, deals, projects and categories, each relationship with its `standing`);
  `person:` answers carry `coverage`. `relationships` now holds a CRM's `reported` links beside yours, each with its
  `standing`, where before it held confirmed links only.
- **`memo relationships list` gives each row's `status` as its standing**: `confirmed`, `reported`, `proposed` or
  `ended`. A CRM's link said `proposed` before, though no proposal waited for it. `projects context` gives each
  relationship its `standing` too.
- **`memo organizations context` answers cli-core's organization context**: `people`, `customers` and the other
  sections replace `relationships`; `notes` and `tags` stay.
- **A role is one from the registry's lists** (cli-core#2629): `--role cto` is refused with the list.
  memo's own examples and tests now use list roles.

### Fixed

- **`memo search all` leaves deals and leads out when memo's permissions deny them**. It showed their
  titles under `search all`; now it names what it left out.
- **`memo projects status` help no longer promises "confirmed" deals**: a deal has no confirmation.
