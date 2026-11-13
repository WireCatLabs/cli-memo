# Import files and records

This page helps you bring data that no WireCat tool syncs into Memo: a folder of text files, transcripts, or the
records a small script of yours writes. After the import they are found by `memo search`, by an agent over MCP and by
everything else that reads Memo's store, next to your messages, mail and notes.

```sh
memo import ~/Documents/handbook --account import:handbook --dry-run
memo import ~/Documents/handbook --account import:handbook
memo import crm-notes.jsonl --account import:crm-notes
```

## The account

Every import names the account it belongs to as `--account <provider>:<account>`. Memo never picks one for you:
without `--account` the error lists the accounts that already hold imports. A new account is made the first time you
name it.

- **`import:<name>`** for documents, notes and exports: `import:handbook`, `import:crm-notes`.
- **`phone:<exchange>`** for call transcripts, next to that exchange's calls: `phone:office-pbx`.

Files go only to these two providers, which no sync owns. Any other, such as a messenger's or Drive's account, is
refused (`record.provider-not-imported`): its own sync owns it. Keep one account per source;
`memo search --source import:handbook` then finds only its documents.

## What a folder import reads

| File | Becomes |
|---|---|
| `.txt`, `.text` | A document; its title is the file name |
| `.md`, `.markdown` | A document; its title is the first heading, past any front matter, else the file name |
| `.pdf`, `.docx` | A document, read on this computer by the readers of [Files Memo can read](notes.md#files-memo-can-read); its title is the file's own, else its name. A scanned PDF holds no text and is skipped |
| `.vtt`, `.srt` | A transcript: one `Name: text` line per turn, as [Sources you add by hand](sources.md#add-a-source) keeps it. The timings and speakers go to `metadata.transcript` |
| `.wav`, `.mp3`, `.m4a`, `.ogg`, `.opus`, `.flac` | With `--transcribe`, what was said, heard on this computer ([Recordings](#recordings)); without it the recording is skipped |
| `.json`, `.jsonl` given on its own | Records, as `memo records import` reads them ([Custom integrations](#custom-integrations)) |

Memo walks the folder and its subfolders. It leaves out names that start with `.` (`.git`, `.obsidian`). The answer
lists every other file it did not import under `skipped`, with the reason: a file type it has no reader for, a file
that is not UTF-8 text, an empty file, or a symbolic link.

One `.txt` or `.md` file may be given instead of a folder. Its document is keyed by the file's name alone, so two
files of the same name from different folders are one document: import their folder instead.

## Recordings

```sh
memo import ./recordings --account import:voice-memos --transcribe
```

`--transcribe` hears each recording with the local speech model `parakeet-v3`, which understands 25 languages. The
recording never leaves this computer. Each passage the model heard is one line of the document's text, with where it
starts in the recording:

```text
[00:00] Depot, good morning.
[01:01] The crane is due Friday.
```

- **The model is not downloaded for you.** It is about 670 MB. Without it the import stops before it writes anything
  and names the command that downloads it once, such as `tg models download parakeet-v3`. Every WireCat tool on this
  computer shares it.
- **A recording is heard once.** Its document keeps the hash of the recording's bytes. The next import with
  `--transcribe` finds the same hash and sends the stored text again, so the recording is not heard again and the
  document stays `unchanged`. A changed recording is heard again.
- `--dry-run` does not transcribe: it lists new recordings under `skipped`.
- One recording plays as one voice: speakers are not told apart. A recording longer than an hour, or one the decoder
  cannot read, is listed under `skipped` and the rest of the folder is imported.
- MP3, Ogg, Opus and FLAC are read by Memo's own decoders. WAV, M4A and others need `ffmpeg` installed.

## Run it again at any time

- **The same folder twice changes nothing.** Each file is keyed by its path inside the folder, so the second run
  answers `unchanged` for every file.
- **An edited file updates its own document.** Its text, title and dates are replaced; the document keeps its
  reference, so links and facts that cite it still point at it.
- **A file gone from the folder stays.** Memo does not delete what you imported when the file disappears. To remove
  one, send a `delete` record for it ([Custom integrations](#custom-integrations)).
- **A renamed or moved file is a new document.** The path is its key.
- **A moved folder updates every document once.** The paths inside it stay the same, so no document is added, but
  each one's `url` names the new place.
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
| `metadata.audio` | For a recording: its length in `seconds`, the speech `model` and the number of `pieces` |
| `metadata.sha256` | The hash of the file's bytes |
| `metadata.size` | Its size in bytes |

The receipt says which run wrote it: its `source.batchId` names the time of the import, and an agent's run adds the
agent's name.

## Limits

- **10,000 files** in one folder import. A larger tree is refused whole: import its folders one by one.
- **32 folders deep.** Deeper folders are listed under `skipped`.
- **50 MiB** a file, **256 MiB** a recording. A larger file is skipped.
- **A million characters** of text a document, within 1 MiB. A longer text is cut: the answer lists the file under
  `cut`, and its `metadata.truncated` is `true`.

## Safety

- **Nothing leaves this computer.** Memo reads the files where they are and writes only to its local store.
- **Links are not followed.** A symbolic link inside the folder is skipped, so an import never reads a file outside the
  folder you named. The folder you name may itself be a link.
- **No credentials.** A file whose text holds something shaped like a credential, such as a private key or a
  `Bearer` token, is refused and listed under `skipped` (`record.secret-field`). The other files are imported.
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
{"schema_version":1,"source":{"provider":"import","account":"crm-notes","batch_id":"2026-11-13"}}
{"key":"p1","type":"person","external_id":"contact-17","operation":"upsert","fields":{"name":"Ana Example","email":"ana@example.com"}}
{"key":"n1","type":"document","external_id":"note-901","operation":"upsert","fields":{"title":"Delivery call","text":"The crane is due Friday.","created_at":"2026-11-10T09:02:00+01:00","metadata":{"manager":"reception"}},"relations":[{"role":"about","type":"person","external_id":"contact-17"}]}
```

- **`external_id` is the record's id at the source.** Keep it stable: the same id is the same record on every run, so
  running the script again updates what changed and leaves the rest. Never use a row number or the time of the run.
- **`operation`** is `upsert`, or `delete` to remove a record you sent before.
- **`fields`** hold the record's data; keys a type does not know are kept as sent. `metadata` keeps anything else
  worth knowing.
- **`relations`** link records of the same account, or a store entity by `ref`: a document `about` a person, an
  organization, a deal or a call event.
- `memo records templates show <type> --format json` prints an example record of each type. The full format, every
  type and every rule: [The records envelope](https://github.com/WireCatLabs/cli-core/blob/main/docs/storage/records-envelope.md).

Check a file before writing it, then import it:

```sh
memo import crm-notes.jsonl --account import:crm-notes --dry-run
memo import crm-notes.jsonl --account import:crm-notes
```

### A source adapter in 20 lines

This Node script turns a tab-separated export of CRM notes (`id`, `date`, client e-mail, `text`) into the envelope on
stdout: each client a person matched by e-mail, each note a document about that person. Memo reads it from stdin
with `-`:

```js
// notes-to-envelope.mjs: node notes-to-envelope.mjs notes.tsv | memo import - --account import:crm-notes
import { readFileSync } from "node:fs"

const [, ...rows] = readFileSync(process.argv[2], "utf8").trim().split("\n")
const line = (value) => process.stdout.write(`${JSON.stringify(value)}\n`)
const people = new Set()

line({ schema_version: 1, source: { provider: "import", account: "crm-notes", batch_id: new Date().toISOString() } })
for (const row of rows) {
  const [id, date, email, text] = row.split("\t")
  if (!people.has(email)) {
    people.add(email)
    line({ key: email, type: "person", external_id: email, operation: "upsert", fields: { name: email, email } })
  }
  line({
    key: id, type: "document", external_id: `note-${id}`, operation: "upsert",
    fields: { title: `Note ${id}`, text, created_at: date },
    relations: [{ role: "about", type: "person", external_id: email }],
  })
}
```

The dates must carry their offset (`2026-11-10T09:00:00+01:00`). A person is matched by an exact e-mail, never by
name; one no contact holds is made.

### Example: call history from Asterisk

An [Asterisk](https://www.asterisk.org/) exchange writes a call detail record (CDR) for every call, in
`/var/log/asterisk/cdr-csv/Master.csv`, and can record calls with MixMonitor. This script makes the calls searchable:
each call becomes a `call` event, and the transcript of its recording, when there is one, a document `about` that
call. Both go to the account `phone:office-pbx`.

The script takes the text of each recording from a `.txt` file beside it, which any local speech tool can write. Use
this path or `memo import /var/spool/asterisk/monitor --account phone:office-pbx --transcribe`, not both: that command
also imports the `.txt` files it finds there, and the same words would be kept twice. `memo import --transcribe` makes
a document per recording, but not linked to its call.

Turn the CDR into the envelope:

```js
// asterisk-cdr.mjs: node asterisk-cdr.mjs Master.csv +01:00 | memo import - --account phone:office-pbx
import { existsSync, readFileSync } from "node:fs"

const [file, offset] = process.argv.slice(2)
const cells = (row) => {
  const out = [""]
  let quoted = false
  for (let i = 0; i < row.length; i++) {
    if (row[i] === '"' && quoted && row[i + 1] === '"') out[out.length - 1] += row[i++]
    else if (row[i] === '"') quoted = !quoted
    else if (row[i] === "," && !quoted) out.push("")
    else out[out.length - 1] += row[i]
  }
  return out
}
const line = (value) => process.stdout.write(`${JSON.stringify(value)}\n`)

line({
  schema_version: 1,
  source: { provider: "phone", account: "office-pbx", batch_id: new Date().toISOString() },
  options: { phone_region: "es" },
})
for (const row of readFileSync(file, "utf8").trim().split("\n")) {
  const c = cells(row)
  const [src, dst, start, seconds, disposition, id, recording] = [c[1], c[2], c[9], c[13], c[14], c[16], c[17]]
  const inbound = dst.length <= 4
  const startedAt = `${start.replace(" ", "T")}${offset}`
  line({
    key: id, type: "event", external_id: id, operation: "upsert",
    fields: {
      kind: "call", phone: inbound ? src : dst, started_at: startedAt, duration: Number(seconds),
      direction: !inbound ? "out" : disposition === "ANSWERED" ? "in" : "missed",
    },
  })
  const transcript = recording && recording.replace(/\.\w+$/, ".txt")
  if (!transcript || !existsSync(transcript)) continue
  line({
    key: `t-${id}`, type: "document", external_id: `transcript-${id}`, operation: "upsert",
    fields: {
      title: `Call ${inbound ? "from" : "to"} ${inbound ? src : dst}`,
      text: readFileSync(transcript, "utf8"),
      created_at: startedAt,
      metadata: { recording, disposition },
    },
    relations: [{ role: "about", type: "event", external_id: id }],
  })
}
```

- **The CDR's `uniqueid` is the record's id.** It is stable, so running the script every night updates the calls that
  changed and adds the new ones.
- **The CDR has no time zone.** Pass the exchange's offset (`+01:00`), or `+00:00` when `cdr.conf` sets
  `usegmtime=yes`; the envelope refuses a time without one.
- **`phone_region`** reads local numbers without `+` as numbers of that country, so a call links to the person whose
  contact holds the number.
- The columns are those of `cdr_csv` with `loguniqueid` and `loguserfield` on: the `uniqueid` is column 17 and the
  `userfield` column 18. The script reads the recording's path from the `userfield`, which the dial plan fills with
  `Set(CDR(userfield)=${MIXMONITOR_FILENAME})`. A `cdr_custom` template needs its own order. Numbers of four digits or
  fewer are taken as internal extensions. Check the columns against your own `Master.csv` before the first run.
