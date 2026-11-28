# Configuration

Look up any wcat setting or environment variable here, with what it does and its default. You rarely need to edit
the file by hand: `wcat jobs start` turns the timer on for you. Edit it yourself for what an agent may do. Notes
folders, the files to skip and where exported notes go are settings of the [files CLI](https://wirecat.dev/en/docs/files).

**On this page:**

1. `notes`
2. `auto`
3. `update_check`
4. `record`, `record_input` and `keep_runs_for_days`
5. `agent_decisions`
6. `agent_merges`
7. Environment variables
8. `permissions`

The file is `~/.config/wcat/config.json`. It is a JSON file: keep the quotes, commas and braces
as in the example.

`wcat config show` lists every setting with its value, its default, and whether the file sets it. `wcat config
migrate` writes each setting the file lacks at its default, so you see and edit them all in the file; your values,
their order and keys wcat does not know stay as they are. Any write wcat makes to the file, such as
`wcat jobs start`, adds them as well.

A file with a problem stops every command except `wcat doctor` and `wcat config unset`. The refusal names the first
problem and the command that removes it; `wcat doctor` lists them all, each with its line or its `wcat config unset
<key>`. `config unset` removes a setting by its dotted path, also one wcat does not know, such as
`wcat config unset auto.colour` or `wcat config unset permissions.facts.add`. A file that is not valid
JSON is fixed by hand at the line and column `wcat doctor` names.

```json
{
  "auto": { "enabled": true, "every": "5m" }
}
```

## `notes`

Moved to the files CLI, which keeps notes folders in its own config (`files folders add`). An old config that still
has `notes` loads, and wcat reads only its folder paths, to name a document's file in `wcat documents`.

## `auto`

| Key | Meaning |
|---|---|
| `enabled` | `true` when the import timer is on. |
| `every` | How often it runs: `90s`, `5m`, `1h`; one minute or more. |
| `places` | The variables that move wcat's folders and the store (`WCAT_CONFIG_DIR`, `MESSAGING_STORE`…), as they were at `wcat jobs start`; every timer run gets them. |

`wcat jobs start` and `wcat jobs stop` write these. If you edit them by hand, the timer follows at its
next run. See [importing on a timer](archive.md#import-on-a-timer-linux).

## `update_check`

`false` stops the once-a-day check for a newer wcat. `WCAT_NO_UPDATE_CHECK=1` does the same for one shell.

## `record`, `record_input` and `keep_runs_for_days`

wcat keeps a run of every command: the command as typed, how it ended, and the requests it made, with their
timings and status codes. A secret in the command (an option named for a token,
password or API key, a password in a URL, a long opaque string) and a phone number are written `[redacted]`.
What the command read or wrote is never kept: no note, mail text or folder name it reached.
`wcat runs list` shows them, `wcat runs show <run-id>` shows one.

| Key | Meaning |
|---|---|
| `record` | `false` keeps only failed runs. Unset or `true`: every run. `--record` keeps one command's run anyway, `--no-record` keeps nothing for it. `wcat mcp serve` and other commands that run until stopped keep a success only under `--record`. |
| `record_input` | `false` writes every typed value that may be content as `[redacted]`, keeping only command words, option names, numbers, dates and choices. `"failed"` does that in a successful run and keeps the words in a failed one. Default `true`: the command is kept as typed, secrets hidden. |
| `keep_runs_for_days` | How many days a failed run is kept. Default 30. |
| `keep_successful_runs_for_days` | How many days a successful run is kept. Default 7. |
| `runs_size_limit_mb` | The most the runs folder may hold; the oldest successful runs go first. Default 200. |

Change the keys in `config.json` by hand (`wcat config migrate` writes them in); `wcat config unset <key>` removes one.

## `agent_decisions`

By default only you confirm or reject a proposal (a fact, a memory, an action, a
[project proposal](recipes.md#review-project-facts-and-follow-ups)); an agent's attempt is refused. Set the top-level
`agent_decisions` key to `true` to let an agent decide them for you with a reason recorded in the decision, but never
one its own bot proposed:

```json
{
  "agent_decisions": true
}
```

Meeting findings keep their own permissions whatever this key says.

Add the key to your existing config rather than replacing your notes and timer settings with
this small example. When the key is missing or `false`, the CLI and MCP refuse every decision an agent makes; reading
and proposing still work.
Owner decisions remain available in the terminal. In an agent's terminal, `--as-owner` asks y/N at the terminal
before a decision counts as yours. The setting does not change the separate permission for confirmation of
meeting findings or replace the tool's other permission checks.

## `agent_merges`

`strong`, the default: an agent's `wcat people link` merges two people at once when wcat itself finds strong
evidence: one mobile number or personal address that no one else has, or that each holder has from a different
source, whatever their names, given by two different sources ([how](people.md#link-a-persons-accounts)). Anything weaker waits for you in `wcat people review`. `propose`: every
agent's link waits for you. `agent_decisions` does not change this, and matches stay yours to confirm.

```json
{
  "agent_merges": "propose"
}
```

## Environment variables

| Variable | Meaning |
|---|---|
| `WCAT_CONFIG_DIR` | The folder that holds `config.json`. |
| `WCAT_STATE_DIR` | wcat's state folder: what each folder looked like at the last import. |
| `WCAT_MODELS_ANALYSIS_PROVIDER`, `WCAT_MODELS_ANALYSIS_MODEL` | The AI provider and the model identifier (the name the provider uses for it) that `wcat answers create --analyze` calls. |
| `WCAT_MODELS_ANALYSIS_BASE_URL` | Optional: the provider's address. |
| `WCAT_MODEL_API_KEY` | The provider's key. |
| `WCAT_READ_ONLY` | Any value but `0` refuses every change with `permission_error` (exit 5): writes to the store, your files, mail at the provider, the timer, the skill files, `upgrade` and `answers create --allow-remote`. Reads, `wcat sync` and `tasks link` still run (a link is only suggested, and linking two tasks is refused); `reminders claim` is refused; `wcat mcp serve` marks writing commands unavailable. |

wcat calls a provider outside your computer only when `wcat answers create` has both `--analyze` and
`--allow-remote`. See [give your agent the sources](search.md#give-your-agent-the-sources).

## `permissions`

Dotted command paths limit MCP tools. A key covers that command and its children; the most specific saved key
wins. `deny` marks commands unavailable in discovery, `readonly` permits reads, and `ask` or `allow` permits writes. Over MCP a write
set to `ask` runs without asking you. Only the client app may still ask, depending on its own settings. Writes
without a saved level use `ask`, so over MCP they run too.

```json
{
  "permissions": {
    "notes": "readonly",
    "tasks": "readonly",
    "mcp.authority": "deny"
  }
}
```

`mcp.authority` defaults to `deny` for source-folder changes. `meetings.actions.confirm`,
`meetings.actions.reject`, `messages.reset` and `projects.annotations.restore` default to `deny` too; explicitly set the relevant
key to `ask` or `allow` to delegate one of these owner operations. Unless `agent_decisions` is `true`, project
proposal decisions stay refused. The shared WireCat read ceiling and `WCAT_READ_ONLY` cap every permission.

`search all` shows an agent business data only as far as its lists are allowed: with `"invoices": "deny"` (or
`invoices.list`, `payments.list`, `orders.list`) it leaves those hits out and says so in its issues.
`business.list`, a key that names no command, set to `deny` leaves all of it out: invoices, payments, orders,
contracts, subscriptions, products and wallets.
Deals and leads follow `deals.list` and `leads.list` the same way, and `crm.list` set to `deny` leaves the whole CRM
lane out. `events.list` set to `deny` refuses `wcat events list` and leaves calendar events and phone calls out of
`search all`. `tracker.list` set to `deny` leaves a tracker's issues, projects and comments (Linear) out of
`search all`.

`wcat show` refuses a reference whose own command a key denies: with `"invoices": "deny"` (or `invoices.show`) an
agent's `wcat show invoice:4` is a `permission_error`, the same as `wcat invoices show invoice:4`. The same holds for
notes, people (`context`), organizations, projects, tasks, facts, memories, messages, payments, orders, deals, leads,
pipelines, products, contracts, subscriptions, wallets, transactions and events (`events.show`).

Supported commands stay visible with their current availability. Saved permission changes take effect
on existing connections too. `wcat mcp serve --permission notes.edit=deny` tightens one key for that server
without changing the file; an override that loosens any saved key is refused.
