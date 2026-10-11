# Notes

This page is for you once memo is installed and you want your notes in it: a folder of Markdown such
as an Obsidian vault, the documents in it, and notes you write in memo itself about messages, people
and projects. By the end, your notes are searchable, linked to the people and records they name, and
can be written back to a folder. Source files are only read: nothing is ever written to a notes folder
unless you export to it.

## Import a folder

```sh
memo folders add /path/to/vault            # once: gives the folder an id
memo notes import                          # load the notes into the shared store; run again after edits
memo search notes "lighthouse budget"      # notes by their words and meaning, and what they link
memo notes about telegram:"Rin Example"    # notes about a person, and the notes linking them
```

`import` stores each file as a note of its folder, named by its path inside the folder. An edited note
keeps its old text as a revision; a note deleted from the folder loses its text on the next import, and a
run that finds most notes missing at once deletes nothing and says so. A file moved inside the folder —
gone from one path, the same content at another — keeps its id, its links and its tags.

Import also stores what each note links, through the folder's format. A link to a note the folder has
once becomes a link to that note. A name no note has, such as `[[Kai Sample]]`, is kept as written and
becomes a link to the person the moment someone by that name, local alias or username is in the store —
or stays unresolved while two people share it. A file's `tags:` and `#tags` become the note's tags, and
a tag removed from the file is removed from the note — unless you added the same tag yourself.

Import then embeds the notes for search by meaning with the local e5-small model (shared with tg and
max: `tg models text download e5-small`), only what changed, at most 600 chunks a run — the next run
continues. `--no-embed`, or `notes.embed: false` in the config, skips it.

`about` takes `<messenger>:<name or id>` or a reference (`person:`, `organization:`, `project:`, `note:`,
`document:`) and lists the
notes about it, the notes that link it, the notes that link a note about it, and links written with the
person's name that two people share. Hidden folders such as `.obsidian` are skipped, and nothing is ever
written to a notes folder.

## Documents in a folder

Imports accept Markdown/TXT, CSV/TSV, text-layer PDF, DOCX, XLSX, ODT/ODS, PPTX and EPUB.
PDF/DOCX use optional `unpdf` and `mammoth` packages installed alongside the CLI; modern office
formats use the bounded built-in shared readers. Results report missing engines, unreadable files, unsupported legacy DOC/XLS, scanned
PDFs needing an agent, oversized inputs and truncation. PDF page spans, CSV row/column ranges and
XLSX sheet/cell addresses preserve source provenance. Files are capped at 50 MiB and stored text at
200,000 characters. Content hashes detect equal-size edits.

## Choose what to import

Folders and what to skip go in `~/.config/cli-memo/config.json`; `--folder` narrows a run to some of the
configured folders and `--ignore` adds rules for one run. An ignore rule is a path inside the folder — a file, or a folder and everything under it —
or a glob (`**/Private*`, `*.txt`):

```json
{ "notes": { "folders": [{ "id": "3", "path": "/path/to/vault" }], "ignore": ["Journal/Private.md", "Archive"] } }
```

## Folders and their format

```sh
memo folders add /path/to/vault                     # gives the folder an id and prints it
memo folders add /path/to/notes --format markdown   # a plain Markdown folder
memo folders attach FOLDER_ID /other/path/to/vault  # the same folder on another computer
memo folders list
```

A folder's id is the store's and is what notes and links use; its path is only where it is on this
computer, so the config differs between computers and the id does not. `folders list` also shows the
folders the store has from another computer, to attach. A path can belong to one id only. A bare path in
`notes.folders`, or a folder with no id, is refused by import with both commands named — memo never
invents an id, which would give every note a new identity. A folder id from a store older than
`wirecat.db` is not in the store: `memo folders add <path>` gives the folder a new one.

`format` says how the folder's notes are written. `obsidian` (the default) reads `[[Note|label]]` links
with `#heading` and `#^block` anchors, `aliases`, `tags:` and inline `#tags`. `markdown` reads
`[label](path.md)` links and `tags:`; a `#word` in its text is not a tag. Both read links to stored
records — `[Rin](person:…)`, or a bare `msg:…` in the text.

A Markdown file whose front matter carries `memo-id` was written by memo and is skipped by import.

## Your notes on messages, people and projects

```sh
memo notes add 'Prefers mornings' --about telegram:'Rin Example'
memo notes add --file review.md --about 'msg:telegram/1/77/42' --about project:PROJECT_ID --export
memo notes list --about telegram:'Rin Example' --json
memo notes edit NOTE_ID --revision 1 --text 'Prefers early mornings'
memo notes remove NOTE_ID
memo notes export --to /path/to/vault/memo --format obsidian
```

A note written here is the store's, not a file's, and is about whatever `--about` names: a person by
`<messenger>:<name or id>`, or any stored record by its reference — `msg:`, `chat:`, `contact:`,
`person:`, `organization:`, `project:`, `task:`, `note:`, `document:`. Several `--about` give it several
subjects. An edit names the
revision it changes, so an edit made meanwhile is never lost. tg and max `contacts notes` are the same
notes.

`export` writes them as files, in a folder's format, with `memo-id` and `memo-hash` in the front
matter: import skips such a file, so an export inside a vault never comes back as a second note. A
file edited since memo wrote it is left alone and reported; nothing is deleted. `--export [dir]` on `add`
and `edit` writes one; with no folder given, `notes.export: { "dir": "…", "format": "…" }` in the
config says where.

A note about a meeting takes the meeting's id in the store with its provider and account:
`memo notes add 'Send the agenda' --meeting <id> --provider <provider> --account <account>`.

## The note about a person

`memo` names the note that is about a person; who is who is decided in messaging (see
[People, organizations and projects](people.md#people)).

```sh
memo note telegram:"Rin Example" ~/Notes/people/Rin.md
memo note telegram:"Rin Example" --clear
```

An identity is `<messenger>:<name or id>`; a name two people share is refused, with their ids to
choose from. The note must be imported first; the link is an `about` link in the store. Entries of an
older `~/.config/cli-memo/people-notes.json` move into the store once their notes are imported; the file
itself is left as it is.

Next: [search your notes and gather evidence](search.md).
