# Configuration

This page lists every setting in Memo's config file and every environment variable Memo reads. Use
it to look up a setting; you rarely need to edit the file by hand. `memo folders add` adds a folder
and `memo auto start` turns the timer on for you. Edit the file yourself for files to skip, mail
accounts and where exported notes go.

The file is `~/.config/cli-memo/config.json`. It is a JSON file: keep the quotes, commas and braces
as in the example.

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
    "maxBodyChars": 1000000,
    "maxAttachmentChars": 200000
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
| `name` | The account's name in Himalaya, and the name `memo sync --account` takes. |
| `address` | The email address. |
| `mode` | `gmail` (the default), `imap`, or `mbox` for a Google Takeout file. |
| `path` | For `mbox`: the Takeout file, such as `~/Takeout/Mail/All mail Including Spam and Trash.mbox`. |
| `folders` | For `imap`: the mail folders to read, such as `["INBOX", "Archive"]`. |
| `embed` | `false` keeps this account's mail out of search by meaning. |
| `rules` | Which mail to skip or keep, written by `memo mail rules`. See [Mail](mail.md#choose-what-to-import). |

Next to `accounts`:

| Key | Meaning |
|---|---|
| `maxBodyChars` | How many characters of each email are kept. Default 1,000,000. |
| `maxAttachmentChars` | How many characters of each attachment's text are kept. Default 200,000. |

See [Mail](mail.md).

## `auto`

| Key | Meaning |
|---|---|
| `enabled` | `true` when the import timer is on. |
| `every` | How often it runs: `90s`, `5m`, `1h`; one minute or more. |

`memo auto start` and `memo auto stop` write these. If you edit them by hand, the timer follows at its
next run. See [importing on a timer](archive.md#import-on-a-timer-linux).

## Environment variables

| Variable | Meaning |
|---|---|
| `MEMO_CONFIG_DIR` | The folder that holds `config.json`. |
| `MEMO_STATE_DIR` | Memo's state folder: what each folder looked like at the last import. |
| `MEMO_MODELS_ANALYSIS_PROVIDER`, `MEMO_MODELS_ANALYSIS_MODEL` | The AI provider and the model identifier (the name the provider uses for it) that `memo ask --model` calls. |
| `MEMO_MODELS_ANALYSIS_BASE_URL` | Optional: the provider's address. |
| `MEMO_MODEL_API_KEY` | The provider's key. |

Memo calls a provider outside your computer only when `memo ask` has both `--model` and
`--allow-remote`. See [give your agent the sources](search.md#give-your-agent-the-sources).
