# Configuration

This page lists every setting in memo's config file and the environment variables you can set. Most
settings are written for you: `memo folders add` adds a folder and `memo auto on` turns the timer on.
Edit the file by hand for what to skip, mail accounts and where exported notes go.

The file is `~/.config/cli-memo/config.json`. `MEMO_CONFIG_DIR` moves the folder it is in, and
`MEMO_STATE_DIR` moves memo's state folder.

```json
{
  "notes": {
    "folders": [{ "id": "3", "path": "/path/to/vault", "format": "obsidian" }],
    "ignore": ["Journal/Private.md", "Archive", "**/Private*"],
    "embed": true,
    "export": { "dir": "/path/to/vault/memo", "format": "obsidian" }
  },
  "mail": {
    "accounts": [{ "name": "work", "address": "you@example.com" }]
  },
  "auto": { "enabled": true, "every": "5m" }
}
```

## `notes`

| Key | Meaning |
| --- | --- |
| `folders` | Each folder's store `id`, its `path` on this computer and its `format`: `obsidian` (the default) or `markdown`. `memo folders add` writes an entry. A bare path is refused by import. See [folders and their format](notes.md#folders-and-their-format). |
| `ignore` | Paths inside a folder, or globs, that import skips. `--ignore` adds rules for one run. |
| `embed` | `false` keeps notes out of search by meaning: `memo import` does not embed them. |
| `export` | `dir` and `format` for `memo notes export` and `--export` when no folder is given. |

## `mail`

`accounts` lists the mail accounts to import, each with:

| Key | Meaning |
| --- | --- |
| `name` | The account's name in Himalaya's config, and the `<account>` in `memo mail <account> import`. |
| `address` | The mailbox address, which becomes the account in the store. |
| `mode` | `gmail` (the default) or `imap`. |
| `folders` | The folders an `imap` account imports, such as `["INBOX", "Archive"]`. |
| `embed` | `false` skips embedding this account's mail for search by meaning. |

Beside `accounts`, `maxBodyChars` (default 1,000,000) and `maxAttachmentChars` (default 200,000) set how many
characters of an email body and of one attachment's text are kept.

See [mail](mail.md).

## `auto`

`enabled` and `every` (`5m`, `90s`, `1h` — a minute or more) for the import timer. `memo auto on/off`
write them, and a hand edit takes effect at the next timer run. See
[keeping the store current](archive.md).

## Environment variables

| Variable | Meaning |
| --- | --- |
| `MEMO_CONFIG_DIR` | The folder of `config.json`. |
| `MEMO_STATE_DIR` | memo's state folder. |
| `MEMO_MODELS_ANALYSIS_PROVIDER`, `MEMO_MODELS_ANALYSIS_MODEL` | The model `memo ask --model` calls. |
| `MEMO_MODELS_ANALYSIS_BASE_URL` | Optional: the model's address. |
| `MEMO_MODEL_API_KEY` | The model's key. |

A remote model is called only with `--allow-remote` as well. See [evidence for an agent](search.md#evidence-for-an-agent).
