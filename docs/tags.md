# Tags

This page helps you label your notes, emails, messages, people and projects, then find everything
with a label. A tag is a short word you choose, such as `work`, `family` or `follow-up`. Tags live in
the local store: your files, your Gmail labels and your mailbox stay as they are.

## Add a tag

**The easiest way: ask your agent.**

```text prompt
Use memo CLI to tag the notes about the Harbour budget with follow-up.
Show me which notes you tagged.
```

**Or run the commands yourself.** First find the reference of what you want to tag, for example
with `memo search notes budget`. Then:

```sh
memo tags add follow-up --note document:3
memo tags add work follow-up --note note:12      # two tags at once
```

A tag has 1 to 32 characters: letters a–z, digits and hyphens. Capital letters are ignored, so
`Work` and `work` are the same tag. Adding a tag that is already there changes nothing.

## What you can tag

| What | How to name it |
|---|---|
| A note you wrote | `--note note:12` |
| A file from a note folder | `--note document:3` |
| Every note in a folder, or in one folder inside it | `--folder 1` or `--folder 1 --subfolder Projects` |
| A message or an email | `--message 'msg:telegram/1/77/42'` (the full reference) |
| A chat or an email thread | `--chat 77 --account telegram:1` |
| A contact in one account | `--contact 101 --account telegram:1` |
| A person whose accounts you linked | `--person PERSON_UID` |
| An organization, a project or a task | `--organization 2`, `--project 1`, `--task HRB-1` |
| A meeting | `--meeting 5 --account zoom:ACCOUNT` |

The folder ID comes from `memo folders list`. A tag on a folder applies to every note in it, at any
depth, including notes you add later.

A chat, a contact and a meeting belong to one account, so they need `--account`. A
person, organization, project or task belongs to you, so it needs no account.

## Tags in your files

Tags written in your note files are imported with the notes:

- In both formats, the `tags:` field at the top of a file.
- In an Obsidian folder, also `#tags` in the text.

If you remove a tag from the file, it is removed from the note on the next import, unless you also
added the same tag in Memo. `memo tags list` shows `(file)` next to tags that came from a file.

## Find things by tag

```sh
memo tags list tag:follow-up               # everything with this tag
memo search notes 'budget' --filter 'tag:work'  # notes with the tag that contain a word
memo search all 'tag:follow-up'             # messages, mail and notes with the tag
memo tags list                              # every tag, up to 100
```

`memo tags list` shows 100 tags at a time; add `--limit 500` to see more. `type:note` or
`type:person` shows only one kind.

## Remove a tag

```sh
memo tags remove follow-up --note document:3
```

Removing a tag leaves the note, message or person as it is. Removing a tag that is not there changes
nothing. A tag that came from a file is removed by editing the file.

## Review duplicate tags

Ask your agent to find likely duplicate tags and show the evidence before changing any labels:

```text prompt
Review our tags for likely synonyms. Show the canonical names and aliases first. For each pair
I select, inspect their assignments and overlaps. Do not create aliases or merge anything.
```

`memo vocabulary check --limit 20 --json` suggests lexical matches. Similar names are candidates
to review; they are not proof that two concepts are the same. Existing aliases are alternate names
for one canonical record, so reuse them before creating another tag.

Run `memo vocabulary list --json` to read the canonical IDs and current fingerprint. Then select
two **tag** entries explicitly. Replace `FINGERPRINT` below with the fingerprint from that unfiltered
list, `tag:1` with the duplicate you are reviewing, and `tag:2` with the name you would keep:

```sh
memo vocabulary inspect tag:1 tag:2 --fingerprint FINGERPRINT --limit 5 --json
```

This reports each tag's assignments by target type, overlapping targets, aliases, automatic claims
and shared chats, plus links in either direction. It includes source and author IDs in assignment
samples. It does not read transcript bodies or call a model. It changes no labels or aliases.
`--limit` bounds samples per table, not the complete counts. `coverage.samples_complete` says
whether samples were cut; `preview_fingerprint` covers all inspected rows even then.

The read defaults to 5,000 dependency rows and 1 MiB of input. `--max-rows` accepts up to 20,000;
`--max-read-bytes` accepts up to 16 MiB; `--limit` accepts up to 100 samples per table. The catalog
has a separate budget. Oversized dependencies fail the whole preview rather than returning a
partial count. A conservative byte estimate can refuse before the actual JSON limit is reached.
If the vocabulary changed, list it again and reselect the pair; do not reuse the stale fingerprint.

`coverage.inspected_tables` names the four covered tables: assignments, aliases, automatic claims
and links. Saved search text, proposal history and arbitrary serialized references are outside this
preview. `coverage.apply_supported` is true: cli-core can apply such a preview, but memo has no
command that does. Topics and projects are refused. A preview fingerprint grants no permission to
merge. Existing owner-reviewed alias commands remain separate.

## Tags and tg or max

tg and max read the same tags: `tg personal search messages 'tag:follow-up'` finds tagged Telegram messages, and
`memo search mail 'tag:follow-up'` finds tagged mail. Tags on a contact are also available through `tg personal tags` and
`max personal tags`.

Next: [search by tag and by words](search.md).
