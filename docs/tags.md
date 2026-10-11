# Tags

This page is for putting your own labels on notes, emails, messages, chats, people, organizations,
projects, tasks and meetings, then finding everything with a label. Labels live in memo's local store:
your note files, Gmail labels and mailbox flags are never changed.

```sh
memo tags add work follow-up --note note:NOTE_ID
memo tags add project --folder FOLDER_ID --path Projects
memo search notes "budget" --tag work
memo tags add follow-up --message 'msg:email/you%40example.com/12345/67890'
memo tags add follow-up --chat 12345 --provider email --account you@example.com
memo tags list --tag follow-up --json
tg search mail 'tag:follow-up'
```

A note is labelled by its reference (`--note note:<id>`, or `document:<id>` for a file in a notes
folder), an email or messenger message by its full `msg:` locator, a mail thread or chat by its exact id
and account. A person, organization, project or task is labelled by `--person`, `--organization`,
`--project` or `--task`, with no account; a contact names its account, and so does a meeting:
`--meeting <id> --provider <provider> --account <account>`, the meeting's id in the store. `--folder` with an id from
`memo folders list`, and `--path` for one subfolder, labels every note under it at any depth. Tags use 1–32 letters a–z, digits or hyphens; case is ignored.
Adding an existing tag or removing an absent one leaves it unchanged.

Labels live in the shared local store. Tagging leaves note files, front matter, Gmail labels and mailbox
flags untouched. Labels survive edits and moves of the note; a deleted note disappears from search.
`tags list` shows up to 100 labels by default (`--limit` for more, `hasMore` in JSON); a note's tags
say whether its file or you stated them. Contact identity
tags remain available through `tg|max tags`.

Next: [search by tag](search.md).
