# People and projects

This page helps you answer "what do I know about this person?" before you reply or meet them, and
keep track of the companies, teams and projects they belong to. Memo gathers the person's messages,
mail and your notes into one answer, each item with its source. It never decides that two accounts
are one person because the names match: you link them.

## Everything about a person

**The easiest way: ask your agent.**

```text prompt
Use memo CLI to show what I know about Kai Sample on Telegram: recent messages, mail and my notes.
Tell me what is still open between us, with the source of each point.
```

**Or run it yourself:**

```sh
memo context telegram:'Kai Sample'
memo context email:kai@example.com
memo context max:'Kai Sample' --limit 50
```

Name the person by their account: `telegram:` or `max:` with a name or ID, or `email:` with an
address. The answer brings together:

- every account you linked to the person;
- the last message each way, recent messages in direct chats and groups, and the chats you share;
- their email, once the address is linked to them;
- the note about them, the notes that link to them, and the notes you wrote about them in Memo;
- open tasks that are about them or assigned to them.
- the Google Drive files they own or last edited, as Google reports it. You have not reviewed these links;
  they come from Google's own file record, not from a guess.

A note that only mentions the name in its text is not included; only links count
([why](how-it-works.md#links-between-notes-and-people)). If a part gave nothing, the answer says
why. `--limit` shows more than 20 items of each kind, and `--json` gives the answer to an agent.

If you have several accounts in the same messenger, add `--source`, for example
`memo context telegram:101 --source telegram:1`.

## Link a person's accounts

One person can have a Telegram account, a MAX account and an email address. Link them in tg or max,
so Memo treats them as one person:

```sh
tg personal contacts link 'Kai Sample' email:kai@example.com
```

After this, `memo context` for any of the accounts shows everything from all of them. A matching
name is never enough to link accounts.

To choose the main note about the person, see [the note about a person](notes.md#the-note-about-a-person).

## Organizations and projects

Organizations and projects are yours, not tied to one messenger account.

- An **organization** is a company, a team, a family or a community.
- A **project** has a name, a short key such as `HRB` (3 or 4 letters and digits), a type and,
  if you want, the organization it belongs to.

```sh
memo organizations add 'Synthetic Studio' --kind company
memo projects add 'Harbour' --key HRB --scope work --organization organization:1
memo projects list
memo projects context HRB
```

`--scope` is `personal` or `work`. `projects context` takes a key, number, `project:<id>`, exact name or alias.
`projects context` and `organizations context` show the people linked to the project or
organization, the notes about it or linking to it, and its tags. For a project, the view also groups pending key documents, relationships, facts and meeting follow-ups
under `review`, separate from existing open numbered tasks. It confirms nothing. The text view shows
proposal references; `--json` includes evidence, source scope and continuation commands. Fact/task
previews hold 20 records each. Meeting previews read at most five proposed batches per linked meeting
account, across eight accounts. Read a full batch before review because it can span projects.

A project's key is also used for its
tasks, such as `HRB-1` ([tasks](tasks.md#tasks-in-a-project)).

## Key documents of a project

A **key document** is a note, a file or a stored message to read first about a project, with a
short reason. It belongs to one project: the same file can be key to one and not to another.

```sh
memo projects key-documents add HRB document:3 --reason 'the plan everyone follows'
memo projects key-documents add HRB msg:telegram/1/77/42 --reason 'the agreed budget'
memo projects key-documents list HRB
memo projects key-documents remove HRB document:3
```

`projects context` starts with them: title, path and why. When the file or message is gone from
the store, the mark stays and says `available: false` until you remove it. `memo search all` and
`memo search notes` with `--project HRB` put the project's key documents first and leave out
nothing else; `search notes` also labels them `key`. A mark your agent adds waits unconfirmed and names the agent, as a
relationship does.

**Start work on a project with `memo projects context <key>`** — you, or your agent.

A global tag such as `key` (`memo tags add key --note document:3`) says nothing about the project.
Move it to a key document with `memo projects key-documents add`, then `memo tags remove key`.

## Who belongs where

A **relationship** says that a person belongs to an organization or works on a project:

```sh
memo relationships add person:PERSON_UID organization:1 --kind member-of
memo relationships add person:PERSON_UID project:1 --kind related-to --role author
memo relationships list 'about:"project:1"'
memo relationships remove 4
```

A chat can be a project's too, so `memo projects evidence` reads all of it, not only messages that name the
project. The reference names the chat's account, so no account is guessed:

```sh
memo relationships add chat:telegram/1/123 project:1
```

Only `member-of` a project is allowed for a chat.

Relationships are statements you make. They never link two accounts into one person. One an agent
adds in its terminal waits unconfirmed, with `provenance` naming the agent (`agent:claude-code`), until
you `memo relationships confirm` it; `--as-owner` makes it yours at once.

Memo can suggest relationships from email: people who write to you from the same company domain.

```sh
memo relationships scan --source email:you@example.com
memo relationships confirm 4
```

Suggestions wait until you confirm them, and they do not appear in a person's context before that.
Common free mail domains, such as Gmail, are never used for suggestions.

## Meetings in a project

If your meetings are saved in the local store, you can link a meeting to a project:

```sh
memo projects meetings link HRB 5 --account zoom:ACCOUNT
memo projects meetings list HRB --source zoom:ACCOUNT
```

Name the meeting's account exactly. `confirmed:false` lists the links an agent suggested; to confirm one,
repeat `link` with the `--fingerprint` value shown in that list.

## Other names for projects and tags

People call the same project by different names. You can give a project or a tag other names, so a
search or an agent finds it by any of them:

```sh
memo vocabulary list kind:project
memo vocabulary show 'Harbor' --kind project
memo vocabulary aliases add project:1 'Harbor' --fingerprint VALUE
```

`vocabulary list` shows each project, tag and topic with its other names and a check value. Pass
that value to `--fingerprint` when you add or remove a name; if the list changed in the meantime, Memo
refuses and you look again. `memo vocabulary check 'on-boarding'` shows similar existing tags
before you create a new one, so you do not end up with `onboarding` and `on-boarding`.

Next: [write a note about one of them](notes.md#write-your-own-notes).
