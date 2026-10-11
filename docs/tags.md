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
| Every note in a folder, or in one folder inside it | `--folder 1` or `--folder 1 --path Projects` |
| A message or an email | `--message 'msg:telegram/1/77/42'` (the full reference) |
| A chat or an email thread | `--chat 77 --provider telegram --account 1` |
| A contact in one account | `--contact 101 --provider telegram --account 1` |
| A person whose accounts you linked | `--person PERSON_UID` |
| An organization, a project or a task | `--organization 2`, `--project 1`, `--task HRB-1` |
| A meeting | `--meeting 5 --provider zoom --account ACCOUNT` |

The folder ID comes from `memo folders list`. A tag on a folder applies to every note in it, at any
depth, including notes you add later.

A chat, a contact and a meeting belong to one account, so they need `--provider` and `--account`. A
person, organization, project or task belongs to you, so it needs no account.

## Tags in your files

Tags written in your note files are imported with the notes:

- In both formats, the `tags:` field at the top of a file.
- In an Obsidian folder, also `#tags` in the text.

If you remove a tag from the file, it is removed from the note on the next import, unless you also
added the same tag in Memo. `memo tags list` shows `(file)` next to tags that came from a file.

## Find things by tag

```sh
memo tags list --tag follow-up              # everything with this tag
memo search notes 'budget' --tag work       # notes with the tag that contain a word
memo search all 'tag:follow-up'             # messages, mail and notes with the tag
memo tags list                              # every tag, up to 100
```

`memo tags list` shows 100 tags at a time; add `--limit 500` to see more. `--type note` or
`--type person` shows only one kind.

## Remove a tag

```sh
memo tags remove follow-up --note document:3
```

Removing a tag leaves the note, message or person as it is. Removing a tag that is not there changes
nothing. A tag that came from a file is removed by editing the file.

## Tags and tg or max

tg and max read the same tags: `tg search mail 'tag:follow-up'` finds tagged mail too. Tags on a
contact are also available through `tg tags` and `max tags`.

Next: [search by tag and by words](search.md).
