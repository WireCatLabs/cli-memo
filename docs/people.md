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

A note that only mentions the name in its text is not included; only links count
([why](how-it-works.md#links-between-notes-and-people)). If a part gave nothing, the answer says
why. `--limit` shows more than 20 items of each kind, and `--json` gives the answer to an agent.

If you have several accounts in the same messenger, add `--account`, for example
`memo context telegram:101 --account 1`.

## Link a person's accounts

One person can have a Telegram account, a MAX account and an email address. Link them in tg or max,
so Memo treats them as one person:

```sh
tg contacts link 'Kai Sample' email:kai@example.com
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

`--scope` is `personal` or `work`. `projects context` takes the project's key or its number.
`projects context` and `organizations context` show the people linked to the project or
organization, the notes about it or linking to it, and its tags. A project's key is also used for its
tasks, such as `HRB-1` ([tasks](tasks.md#tasks-in-a-project)).

## Who belongs where

A **relationship** says that a person belongs to an organization or works on a project:

```sh
memo relationships add person:PERSON_UID organization:1 --kind member-of
memo relationships add person:PERSON_UID project:1 --kind related-to --role author
memo relationships list --reference project:1
memo relationships remove 4
```

Relationships are statements you make. They never link two accounts into one person. One an agent
adds in its terminal waits unconfirmed, with `provenance` naming the agent (`agent:claude-code`), until
you `memo relationships confirm` it; `--by owner` makes it yours at once.

Memo can suggest relationships from email: people who write to you from the same company domain.

```sh
memo relationships suggest --provider email --account you@example.com
memo relationships confirm 4
```

Suggestions wait until you confirm them, and they do not appear in a person's context before that.
Common free mail domains, such as Gmail, are never used for suggestions.

## Meetings in a project

If your meetings are saved in the local store, you can link a meeting to a project:

```sh
memo projects meetings link HRB 5 --provider zoom --account ACCOUNT
memo projects meetings list HRB --provider zoom --account ACCOUNT
```

Name the meeting's account exactly. `--proposed` lists the links an agent suggested; to confirm one,
repeat `link` with the `--expected` value shown in that list.

## Other names for projects and tags

People call the same project by different names. You can give a project or a tag other names, so a
search or an agent finds it by any of them:

```sh
memo vocabulary list --kind project
memo vocabulary resolve 'Harbor' --kind project
memo vocabulary aliases add project:1 'Harbor' --expected VALUE
```

`vocabulary list` shows each project, tag and topic with its other names and a check value. Pass
that value to `--expected` when you add or remove a name; if the list changed in the meantime, Memo
refuses and you look again. `memo vocabulary preflight 'on-boarding'` shows similar existing tags
before you create a new one, so you do not end up with `onboarding` and `on-boarding`.

Next: [write a note about one of them](notes.md#write-your-own-notes).
