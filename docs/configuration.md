# Configuration

Use this reference to look up Memo's own configuration settings and environment variables. You
rarely need to edit the file by hand. `memo folders add` adds a folder
and `memo jobs start` turns the timer on for you. `memo mail add` adds an explicit Himalaya account. Edit the file yourself for files to skip and where
exported notes go.

The file is `~/.config/cli-memo/config.json`. It is a JSON file: keep the quotes, commas and braces
as in the example.

A file with a problem stops every command except `memo doctor` and `memo config unset`. The refusal names the first
problem and the command that removes it; `memo doctor` lists them all, each with its line or its `memo config unset
<key>`. `config unset` removes a setting by its dotted path, also one Memo does not know, such as
`memo config unset mail.accounts.0.colour` or `memo config unset permissions.notes.edit`. A file that is not valid
JSON is fixed by hand at the line and column `memo doctor` names.

```json
{
  "notes": {
    "folders": [{ "id": "1", "path": "/path/to/vault", "format": "obsidian" }],
    "ignore": ["Journal/Private.md", "Archive", "**/Private*"],
    "embed": true,
    "export": { "dir": "/path/to/vault/memo", "format": "obsidian" }
  },
  "mail": {
    "accounts": [{ "name": "work", "address": "you@example.com" }],
    "max_body_chars": 1000000,
    "max_attachment_chars": 200000
  },
  "auto": { "enabled": true, "every": "5m" }
}
```

## `notes`

| Key | Meaning |
|---|---|
| `folders` | Your note folders. Each has the `id` the local store gave it, its `path` on this computer and its `format`: `obsidian` (the default) or `markdown`. `memo folders add` writes an entry; an entry with no `id` is refused by import. See [Markdown or Obsidian](notes.md#markdown-or-obsidian). |
| `ignore` | Files and folders that import skips: a path inside the folder, a folder, or a pattern such as `**/Private*`. `--ignore` adds rules for one run. |
| `embed` | `false` keeps notes out of search by meaning. |
| `export` | `dir` and `format` for `memo notes export` and `--export` when you give no folder. |

The folder `id` is the same on every computer; the `path` is different on each. See
[use the same notes on another computer](notes.md#use-the-same-notes-on-another-computer).

## `mail`

`accounts` lists the mail accounts to import. Each account has:

| Key | Meaning |
|---|---|
| `name` | The account's name in Himalaya, and the name `memo sync --source email:<name>` takes. |
| `address` | The email address. |
| `mode` | `gmail` (the default), `imap`, or `mbox` for a Google Takeout file. |
| `path` | For `mbox`: the Takeout file, such as `~/Takeout/Mail/All mail Including Spam and Trash.mbox`. |
| `folders` | For `imap`: the mail folders to read, such as `["INBOX", "Archive"]`. |
| `embed` | `false` keeps this account's mail out of search by meaning. |
| `rules` | Read only to move them into the store: rules live there, managed by `memo mail rules`. See [Mail](mail.md#choose-what-to-import). |

Next to `accounts`:

| Key | Meaning |
|---|---|
| `max_body_chars` | How many characters of each email are kept. Default 1,000,000. |
| `max_attachment_chars` | How many characters of each attachment's text are kept. Default 200,000. |

Settings are named in snake_case; a camelCase name is refused.

See [Mail](mail.md).

## `auto`

| Key | Meaning |
|---|---|
| `enabled` | `true` when the import timer is on. |
| `every` | How often it runs: `90s`, `5m`, `1h`; one minute or more. |
| `places` | The variables that move memo's folders and the store (`MEMO_CONFIG_DIR`, `MESSAGING_STORE`…), as they were at `memo jobs start`; every timer run gets them. |

`memo jobs start` and `memo jobs stop` write these. If you edit them by hand, the timer follows at its
next run. See [importing on a timer](archive.md#import-on-a-timer-linux).

## `update_check`

`false` stops the once-a-day check for a newer memo. `MEMO_NO_UPDATE_CHECK=1` does the same for one shell.

## `record`, `record_input` and `keep_runs_for_days`

Memo keeps a run of every command: the command as typed, how it ended, and the mail and RDAP requests it made,
with their timings, status codes and, for a mail read tried again, the attempt and the wait before it. A secret in the command (an option named for a token,
password or API key, a password in a URL, a long opaque string) and a phone number are written `[redacted]`.
What the command read or wrote is never kept: no note, mail text or folder name it reached.
`memo runs list` shows them, `memo runs show <run-id>` shows one.

| Key | Meaning |
|---|---|
| `record` | `false` keeps only failed runs. Unset or `true`: every run. `--record` keeps one command's run anyway, `--no-record` keeps nothing for it. `memo mcp serve` and other commands that run until stopped keep a success only under `--record`. |
| `record_input` | `false` writes every typed value that may be content as `[redacted]`, keeping only command words, option names, numbers, dates and choices. `"failed"` does that in a successful run and keeps the words in a failed one. Unset: the command is kept as typed, secrets hidden. |
| `keep_runs_for_days` | How many days a failed run is kept. Default 30. |
| `keep_successful_runs_for_days` | How many days a successful run is kept. Default 7. |
| `runs_size_limit_mb` | The most the runs folder may hold; the oldest successful runs go first. Default 200. |

Add the keys to `config.json` by hand; `memo config unset <key>` removes one.

## `agent_decisions`

By default an agent may confirm or reject [project proposals](recipes.md#review-project-facts-and-follow-ups)
for you, with a reason recorded in the decision. Set the top-level `agent_decisions` key to `false`
to require owner decisions in this flow:

```json
{
  "agent_decisions": false
}
```

Add the key to your existing config rather than replacing your notes, mail and timer settings with
this small example. Both CLI and MCP then refuse an agent's `projects actions confirm` and `reject`;
reading and proposing still work. Owner decisions remain available in the terminal. The setting
controls Memo's agent mode; terminal access retains the permissions of the terminal user.
`--as-owner` labels a command as the owner's and must not be used by an agent to bypass this setting.
This setting applies to project proposals; it does not change the separate permission for confirmation
of meeting findings or replace the tool's other permission checks.

## Environment variables

| Variable | Meaning |
|---|---|
| `MEMO_CONFIG_DIR` | The folder that holds `config.json`. |
| `MEMO_STATE_DIR` | Memo's state folder: what each folder looked like at the last import. |
| `MEMO_MODELS_ANALYSIS_PROVIDER`, `MEMO_MODELS_ANALYSIS_MODEL` | The AI provider and the model identifier (the name the provider uses for it) that `memo answers create --analyze` calls. |
| `MEMO_MODELS_ANALYSIS_BASE_URL` | Optional: the provider's address. |
| `MEMO_MODEL_API_KEY` | The provider's key. |
| `MEMO_READ_ONLY` | Any value but `0` refuses every change with `permission_error` (exit 5): writes to the store, your files, mail at the provider, the timer, the skill files, `upgrade` and `answers create --allow-remote`. Reads, `memo sync` and `tasks link` still run (a link is only suggested, and linking two tasks is refused); `reminders claim` is refused; `memo mcp serve` marks writing commands unavailable. |

Memo calls a provider outside your computer only when `memo answers create` has both `--analyze` and
`--allow-remote`. See [give your agent the sources](search.md#give-your-agent-the-sources).

## `permissions`

Dotted command paths limit MCP tools. A key covers that command and its children; the most specific saved key
wins. `deny` marks commands unavailable in discovery, `readonly` permits reads, and `ask` or `allow` permits writes. Over MCP `ask` runs
without a terminal question; approval prompts depend on the client app. Writes without a saved level use `ask`.

```json
{
  "permissions": {
    "notes": "readonly",
    "mail.delete": "deny",
    "mcp.authority": "deny"
  }
}
```

`mcp.authority` defaults to `deny` for source-folder and mail-rule changes. `meetings.actions.confirm`,
`meetings.actions.reject` and `projects.annotations.restore` default to `deny` too; explicitly set the relevant
key to `ask` or `allow` to delegate one of these owner operations. `agent_decisions: false` continues to refuse
project proposal decisions. The shared WireCat read ceiling and `MEMO_READ_ONLY` cap every permission.

Supported commands stay visible with their current availability. Saved permission changes take effect
on existing connections too. `memo mcp serve --permission notes.edit=deny` tightens one key for that server
without changing the file; an override that loosens any saved key is refused.
