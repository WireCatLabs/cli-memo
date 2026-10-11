# People, organizations and projects

This page is for asking "what do I need to know about this person" and for recording the companies,
teams and projects they belong to. The answer joins messages from tg and max, imported mail and your
notes, each item with a link to its source. memo never decides that two identities are one person
because a name matches: you link them.

## Context about a person

```sh
memo context telegram:"Rin Example"     # or max:<name or id>, email:<address>
```

One answer from the shared store: every identity linked to the person (`tg|max contacts link`), the
last message each way, recent messages in direct chats and groups, chats in common — mail included once
an address is linked — then the notes linked to them: the note about them (`memo note`), notes that link
them, notes that link the note about them, and the notes you wrote here about them. A name in a note's
plain text is not a link and is not listed. What gave nothing is listed with the reason. `--json` for
agents, `--limit` for more.

`context` includes directly related open tasks and explicit task assignments. A task in a shared group
belongs in a person's context only when they authored its source or you assigned it explicitly. If
several accounts of the requested provider exist, use `memo context telegram:101 --account 1`.

## People

Who is who is decided in messaging: `tg contacts link <person> email:<address>` (or `max contacts link`)
records that a messenger identity and a mail address are one person, in the shared store. A same name
is never enough. `memo` only names the note that is about the person — see
[the note about a person](notes.md#the-note-about-a-person).

## Organizations and projects

```sh
memo organizations add 'Synthetic Studio' --kind company
memo projects add 'Synthetic Harbour' --organization organization:ORGANIZATION_ID
memo relationships add person:PERSON_UID project:PROJECT_ID --role author
memo projects context PROJECT_ID --json
memo tags add client --organization ORGANIZATION_ID
memo tags add follow-up --task TASK_ID
```

Organizations (a company, team, family or community) and projects (with a short key, a type and the
organization they belong to) are yours, not one account's. Relationships use `member-of` or `related-to`;
`list`, `remove` and `confirm` manage them. They are manual statements and never merge identities because
names or domains match. `organizations context` and `projects context` list the relationships, the notes
about or linking it, and its tags. Tags on a task need no account; its
reminders name the account it waits on.

`memo relationships suggest --provider email --account owner@example.test` stores bounded weak
shared-domain proposals for direct email contacts. Proposals retain rule provenance and remain
unconfirmed; they do not enter confirmed person context. `relationships confirm <id>` records your
explicit acceptance. Common free-mail domains are excluded from this heuristic.

Next: [write a note about one of them](notes.md#your-notes-on-messages-people-and-projects).
