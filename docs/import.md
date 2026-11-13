# Import files and records

This page helps you bring data that no WireCat tool syncs into Memo: a folder of text files, transcripts, or the
records a small script of yours writes. After the import they are found by `memo search`, by an agent over MCP and by
everything else that reads Memo's store, next to your messages, mail and notes.

```sh
memo import ./transcripts --account phone:office-pbx --dry-run
memo import ./transcripts --account phone:office-pbx
memo import calls.jsonl --account phone:office-pbx
```

## The account

Every import names the account it belongs to as `--account <provider>:<account>`, such as `phone:office-pbx` for an
office phone exchange. Memo never picks one for you: without `--account` the error lists the accounts that already
hold imports. A new account is made the first time you name it.

Keep one account per source. An import's documents sit next to that source's calls and contacts, and
`memo search --source phone:office-pbx` finds only them. Do not import into a messenger's or Drive's account: its
own sync owns it.

## What a folder import reads

| File | Becomes |
|---|---|
| `.txt`, `.text` | A document; its title is the file name |
| `.md`, `.markdown` | A document; its title is the first heading, past any front matter, else the file name |
| `.pdf`, `.docx` | A document, read on this computer by the readers of [Files Memo can read](notes.md#files-memo-can-read); its title is the file's own, else its name. A scanned PDF holds no text and is skipped |
| `.vtt`, `.srt` | A transcript: one `Name: text` line per turn, as [Sources you add by hand](sources.md#add-a-source) keeps it. The timings and speakers go to `metadata.transcript` |
| `.json`, `.jsonl` given on its own | Records, as `memo records import` reads them ([Custom integrations](#custom-integrations)) |

Memo walks the folder and its subfolders. It leaves out names that start with `.` (`.git`, `.obsidian`). The answer
lists every other file it did not import under `skipped`, with the reason: a file type it has no reader for, a file
that is not UTF-8 text, an empty file, or a symbolic link.

One `.txt` or `.md` file may be given instead of a folder. Its document is keyed by the file's name alone, so two
files of the same name from different folders are one document: import their folder instead.

## Run it again at any time

- **The same folder twice changes nothing.** Each file is keyed by its path inside the folder, so the second run
  answers `unchanged` for every file.
- **An edited file updates its own document.** Its text, title and dates are replaced; the document keeps its
  reference, so links and facts that cite it still point at it.
- **A file gone from the folder stays.** Memo does not delete what you imported when the file disappears. To remove
  one, send a `delete` record for it ([Custom integrations](#custom-integrations)).
- **A renamed or moved file is a new document.** The path is its key.
- A file whose modification time changed but whose text did not counts as `updated`.

`--dry-run` reads every file and plans the import without writing anything. It holds the store's write lock while it
runs. `--json` prints the receipt for a script.

## What is kept

Each file is a `document` record with:

| Field | Value |
|---|---|
| `title` | The first Markdown heading, or the file name without its extension |
| `text` | The file's text |
| `created_at` | When the file was created, where the file system says; else its modification time |
| `updated_at` | Its modification time |
| `url` | The file's `file://` address on this computer |
| `metadata.path` | Its path inside the folder |
| `metadata.format` | `text`, `markdown`, `pdf`, `docx`, `vtt` or `srt` |
| `metadata.extractor` | The reader of a PDF or Word file, with its version |
| `metadata.transcript` | For a transcript: `cues`, `start_seconds`, `end_seconds` and `speakers` |
| `metadata.sha256` | The hash of the file's bytes |
| `metadata.size` | Its size in bytes |

The receipt says which run wrote it: its `source.batchId` names the time of the import, and an agent's run adds the
agent's name.

## Limits

- **10,000 files** in one folder import. A larger tree is refused whole: import its folders one by one.
- **32 folders deep.** Deeper folders are listed under `skipped`.
- **50 MiB** a file. A larger file is skipped.
- **About 60 KiB of text** a document. A longer text is cut: the answer lists the file under `cut`, and its
  `metadata.truncated` is `true`.

## Safety

- **Nothing leaves this computer.** Memo reads the files where they are and writes only to its local store.
- **Links are not followed.** A symbolic link inside the folder is skipped, so an import never reads a file outside the
  folder you named. The folder you name may itself be a link.
- **The text is data.** Memo stores and searches it and runs nothing in it. An agent that reads an imported document
  reads it as a source, not as instructions.
- **An agent's import is recorded as the agent's.** Run from an agent's terminal, the receipt's `by` names the agent.
  Over MCP an agent cannot run `memo import` at all: it hands records over with `records import`.

## Custom integrations

A source with no WireCat tool reaches Memo through a records file: the **records envelope**, a versioned JSON format
that `memo import` and `memo records import` both read. A script fetches the data from the source's API or export,
writes the envelope, and gives it to Memo. You do not need to know Memo's database.

The envelope as JSONL: the first line names the format version and the source, each further line is one record.

```jsonl
{"schema_version":1,"source":{"provider":"phone","account":"office-pbx","batch_id":"2026-11-13"}}
{"key":"c1","type":"event","external_id":"1700000000.1","operation":"upsert","fields":{"kind":"call","direction":"in","phone":"+34600000001","started_at":"2026-11-10T09:00:00+01:00","duration":61}}
{"key":"n1","type":"document","external_id":"note-1700000000.1","operation":"upsert","fields":{"title":"Call about the delivery","text":"The crane is due Friday.","created_at":"2026-11-10T09:02:00+01:00","metadata":{"agent":"reception"}},"relations":[{"role":"about","type":"event","external_id":"1700000000.1"}]}
```

- **`external_id` is the record's id at the source.** Keep it stable: the same id is the same record on every run, so
  running the script again updates what changed and leaves the rest. Never use a row number or the time of the run.
- **`operation`** is `upsert`, or `delete` to remove a record you sent before.
- **`fields`** hold the record's data; keys a type does not know are kept as sent. `metadata` keeps anything else
  worth knowing.
- **`relations`** link records of the same account: a document `about` a call, a deal's `person`.
- `memo records templates show <type> --format json` prints an example record of each type. The full format, every
  type and every rule: [The records envelope](https://github.com/WireCatLabs/cli-core/blob/main/docs/storage/records-envelope.md).

Check a file before writing it, then import it:

```sh
memo import calls.jsonl --account phone:office-pbx --dry-run
memo import calls.jsonl --account phone:office-pbx
```

### A source adapter in 20 lines

This Node script turns a CSV export of calls (`id,date,number,direction,seconds`) into the envelope on stdout. Memo
reads it from stdin with `-`:

```js
// calls-to-envelope.mjs: node calls-to-envelope.mjs calls.csv | memo import - --account phone:office-pbx
import { readFileSync } from "node:fs"

const [, ...rows] = readFileSync(process.argv[2], "utf8").trim().split("\n")
const line = (value) => process.stdout.write(`${JSON.stringify(value)}\n`)

line({ schema_version: 1, source: { provider: "phone", account: "office-pbx", batch_id: new Date().toISOString() } })
for (const row of rows) {
  const [id, date, number, direction, seconds] = row.split(",")
  line({
    key: id,
    type: "event",
    external_id: id,
    operation: "upsert",
    fields: { kind: "call", direction, phone: number, started_at: date, duration: Number(seconds) },
  })
}
```

The dates in the CSV must carry their offset (`2026-11-10T09:00:00+01:00`). A number written without `+` matches a
person only when the header names `"options": { "phone_region": "es" }`.
