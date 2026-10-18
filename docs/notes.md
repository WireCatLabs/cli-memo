# Notes and folders

This page helps you bring your notes into Memo and keep your own notes there. You can add a folder of
Markdown files or an Obsidian vault, search its documents, and write notes about people, messages and
projects. Memo only reads your folders: it writes a file only when you export your notes.

There are two kinds of notes:

- **Notes from your files.** Memo reads them from a folder you choose. To change one, edit the file
  and import again. Their references look like `document:3`.
- **Notes you write in Memo.** They live in the local store and can be about a person, a message, a
  project or another note. Their references look like `note:12`.

## Add a folder

A folder can be any folder of notes on your computer: project notes, a folder of documents or an
Obsidian vault. Memo reads the folder and all the folders inside it.

**The easiest way: ask your agent.**

```text prompt
Use memo CLI to add my notes folder at /path/to/notes and import it.
Tell me how many notes it found and which files it could not read.
```

**Or run the commands yourself.** Replace `/path/to/notes` with the full path of your folder.

For a folder of ordinary Markdown files:

```sh
memo folders add /path/to/notes --format markdown
memo sync --only notes --no-embed
```

For an Obsidian vault:

```sh
memo folders add /path/to/vault --format obsidian
memo sync --only notes --no-embed
```

`memo folders add` prints the folder's ID, for example `1`. `memo sync --only notes` reads the notes and
reports how many it found:

```text
/path/to/notes: 24 notes, 24 changed, 0 moved, 0 gone
```

`--no-embed` skips the preparation for search by meaning, so you do not need the search model to
start. Run `memo sync --only notes` again after you add or edit files; only the changes are read.

You can add more than one folder. `memo folders list` shows them all.

### Markdown or Obsidian

The format tells Memo how links and tags are written in your notes. You do not need Obsidian to use
Memo, and Obsidian does not need to be open.

| | `markdown` | `obsidian` (the default) |
|---|---|---|
| Links to other notes | Markdown links to the file (below) | `[[Other note]]`, `[[Other note\|label]]`, also with `#heading` |
| Tags | the `tags:` field at the top of the file | the `tags:` field and `#tags` in the text |
| Other names for a note | | the `aliases:` field |

A link in a `markdown` folder looks like this:

```md
[label](other-note.md)
```

In a `markdown` folder, a `#word` in the text is not a tag. Both formats understand links written as
references, such as `[Kai](person:7)` or a bare `msg:telegram/1/77/42`.

An **Obsidian vault** is a folder of Markdown notes that Obsidian opens as one workspace. Memo skips
hidden folders such as `.obsidian`.

### Files Memo can read

| Files | Extensions | What Memo keeps |
|---|---|---|
| Text and Markdown | `.txt`, `.md`, `.markdown` | The text, links and tags |
| Tables | `.csv`, `.tsv`, `.xlsx`, `.ods` | Cell values, with the sheet, row and column |
| Documents, slides and e-books | `.odt`, `.pptx`, `.epub` | The text, without the layout |
| PDF and Word | `.pdf`, `.docx`, `.doc` | The text, with PDF page numbers |

Some files cannot be read: scanned PDFs (pictures of pages, with no text in them), old `.xls` files,
and files larger than 50 MiB. Memo keeps up to 200,000 characters of each file. The import report
lists every file it could not read, and why, on every run until the file changes:

```text
notes /home/you/Notes: 41 notes, 2 changed, 0 moved, 0 gone, 1 not read
  not read: Archive/2009 budget.xls — this file type cannot be read
```

The text report names the first 10; with `--json`, the whole list is `not_read` in each folder's report, with the reason as `status`:
`too-large`, `unsupported`, `needs-agent` (no text, such as a scan), `unreadable` (damaged or locked) or
`engine-missing`. The count of notes leaves out the files that were not read.

### Skip some files

To keep some files out of Memo, list them under `notes.ignore` in the
[config file](configuration.md#notes). A rule is a path inside the folder, a folder (everything in
it is skipped) or a pattern:

```json
{ "notes": { "ignore": ["Journal/Private.md", "Archive", "**/Private*"] } }
```

`memo sync --only notes --ignore Drafts` leaves a folder alone for one run: its notes are not read
again, and the ones already imported stay in Memo. `notes.ignore` is different: it removes notes
already imported from that place.

## Find your notes

```sh
memo search notes 'budget'
memo search notes 'budget' --filter 'tag:work'
memo notes show document:3
```

Each result shows the file and the first matching line. `memo notes show` shows one note with its
tags, the notes it links to and the notes that link to it. See [Search](search.md) for more search
words.

## Write your own notes

A note you write in Memo can be about a person, a message, a project or another note. Writing it
does not send anything to anyone and does not change the message it is about.

```text prompt
Use memo CLI to save a note that Kai Sample prefers morning meetings, linked to Kai on Telegram.
Show me the saved note.
```

Or yourself:

```sh
memo notes add 'Prefers morning meetings' --subject telegram:'Kai Sample'
memo notes list 'about:"telegram:Kai Sample"'
```

`notes list about:` lists the notes about a subject and the notes that link it: directly, through a note about it, or
by a name two people share. `via` in `--json` says which: `about`, `link`, `through` or `name`. It stands alone in
the query; `source:internal` and `text:budget` narrow the whole list.

`--subject` on `notes add` says what the note is about. Use it more than once for several subjects:

| About | Write |
|---|---|
| A person in a messenger | `telegram:'Kai Sample'`, `max:'Kai Sample'` or `email:kai@example.com` (a name or an ID) |
| One message | its reference, such as `msg:telegram/1/77/42` |
| A note or a file | `note:12` or `document:3` |
| A person, organization, project or task | `person:…`, `organization:…`, `project:…`, `task:…` |

Copy references from search results; do not type them from memory. The person, message or note must
already be in the local store.

### Read, edit and remove a note

```sh
memo notes show note:12
memo notes edit 12 --revision 1 --text 'Prefers early morning meetings'
memo notes remove 12
```

Each note has a **revision** number that goes up with every edit. `memo notes edit` asks for the
current revision, which `memo notes show note:12 --json` gives you. If someone or something edited
the note in the meantime, the numbers do not match and Memo refuses the edit, so no change is lost.
Read the note again and retry.

A note from a file is edited in the file, not with `memo notes edit`.

### Save your notes as files

```sh
memo notes export --output-dir /path/to/vault/memo --format obsidian
```

Export writes the notes you wrote in Memo as Markdown files in the folder you choose. Use
`--format markdown` for plain Markdown. Each file gets a `memo-id` and a `memo-hash` at the top, so
importing that folder does not create the same note twice. If you edited an exported file yourself,
Memo does not overwrite it and tells you. To export one note when you write it, add `--export` to
`memo notes add` or `memo notes edit`.

## The note about a person

You can tell Memo which file is the main note about a person, for example `People/Kai.md` in your
vault:

```sh
memo note telegram:'Kai Sample' /path/to/vault/People/Kai.md
memo note telegram:'Kai Sample'           # shows which note it is
memo note telegram:'Kai Sample' --clear   # forgets it
```

The file must be imported first. After this, the note and the notes that link to it appear in
[the person's context](people.md#everything-about-a-person). If two people share the name, Memo
refuses and lists their IDs so you can choose.

## Use the same notes on another computer

If your notes are synchronised to another computer, connect the same folder ID there instead of
adding a new folder:

```sh
memo folders list                                  # shows the folder IDs the local store has
memo folders attach 1 /other/path/to/notes
```

With the same ID, the notes keep their links and tags on both computers.

A folder named `google-drive:…` holds the Google Drive documents drive-cli saved. `memo folders list` marks it
"kept by drive", and `memo folders attach` refuses it: memo search reads it already.

Next: [label your notes with tags](tags.md), or [search them](search.md).
