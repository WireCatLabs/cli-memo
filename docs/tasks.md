# Tasks and reminders

This page helps you keep track of what you have to do: a request in a message, a promise in a note,
or work in one of your projects. A task made from a message or note points to it, so you can always
see why the task exists. Reminders stay on your computer: Memo never sends them to a messenger or a
mailbox.

## A task from a message or note

**The easiest way: ask your agent.**

```text prompt
Use memo CLI to find the messages from this week where someone asked me for something.
Show them to me first. Make a task only for the ones I choose.
```

**Or run it yourself.** Copy the message's reference from a search result:

```sh
memo tasks add 'msg:telegram/1/77/42' --type request
memo tasks add note:12 --account telegram:1 --type promise
memo tasks list --source telegram:1
```

A task from a source has a type: `request` (the default), `question`, `mention` or `promise`. It
belongs to one account. A message reference already names its account, and a file from a notes folder
(`document:<id>`) belongs to that folder. For a note you wrote with `memo notes add`, add `--account`, such
as `--account telegram:1` or a notes folder, `--account notes:1`. Adding the same task twice gives you the
existing one.

A notes folder is an account too: search results give its number as `folder_id`, and Memo accepts it as
`notes:<number>` or as the `folder:<id>` its messages show. `--source notes` names your folder when you have
one. `memo tasks list` and `memo reminders list` without `--source` read every account and name them in
`meta.accounts`.

## What needs a look today

The agenda and the card are the same commands tg and max have; `tasks update` sets a task's due date and next
check. Each reads or changes one account; name it:

```sh
memo tasks agenda --source telegram:1           # overdue, due, owed and waiting chats
memo tasks update 1a2b3c4d --due 2d --remind-time 1d --title 'Send the revised budget' --account telegram:1
memo tasks show 1a2b3c4d --source telegram:1
memo stats tasks show --source telegram:1       # open tasks per chat
memo tasks agenda --source notes                # tasks from your notes folder
```

A command without `--source` or `--account` lists the accounts the store holds. tg and max open these tasks
when they sync; memo reads the same store.

## Tasks in a project

A task in a project does not need a source. It gets a key made of the project's key and a number,
such as `HRB-1`:

```sh
memo tasks add --project HRB --title 'Book the venue' --priority 1
memo tasks add --project HRB --title 'Export drops the last row' --type bug
memo tasks list project:HRB
memo tasks update HRB-1 --priority 0 --description 'Call before Friday'
```

A plain `memo tasks list` shows the tasks of your accounts only; a project's tasks are listed with
`project:` and the project's key.

| Option | Meaning |
|---|---|
| `--type` | `chore` (the default), `bug` or `feature` |
| `--priority` | a number from 0 (urgent) to 4 (low) |
| `--parent` | a bigger task this one is part of, in the same project |
| `--description` | more detail, in Markdown |
| `--assignee` | who does it, by the person's ID |

To create the project first, see [organizations and projects](people.md#organizations-and-projects).

## Who works on it

```sh
memo tasks assign HRB-1 PERSON_UID
memo tasks assign HRB-1 PERSON_UID --role reviewer
```

The role is `assignee` (the default), `reviewer` or `watcher`. A person's ID comes from their
context (`memo context … --json`). Tasks assigned to someone appear in
[their context](people.md#everything-about-a-person).

## Close a task

```sh
memo tasks close HRB-1 --reason booked
memo tasks close 7 --account telegram:1 --as dismissed
```

Close a task with `--as done` (the default) or `--as dismissed`. `memo tasks list state:done` shows
closed tasks; with `project:`, `kind:bug` narrows by kind. `source:"note:12"` keeps an account's tasks
from one message, note or document — the step `memo search all` suggests for a result tasks point at.
Every change of status, priority or assignee is recorded with the task.

## What to do first

One task can wait for another. Link them, then ask Memo which tasks can start:

```sh
memo tasks link HRB-2 HRB-1 --kind blocked-by     # HRB-2 waits for HRB-1
memo tasks list project:HRB ready:true          # tasks with nothing left to wait for
memo tasks status HRB-2                           # why HRB-2 can or cannot start
memo tasks relations HRB-2
memo tasks unlink HRB-2 HRB-1 --kind blocked-by
```

`tasks link` takes the other task as `task:HRB-1` too. A target that is not a task — a message, a chat, a person,
a URL — links a messenger account's task to what it concerns, and needs `--account`:

```sh
memo tasks link 12 msg:telegram/500/7/101 --account telegram:500
```

A task becomes ready only when every task it waits for is done. If a task it waits for was
dismissed, Memo asks you to review the link. `follow-up-of` and `related-to` links are for information and do not block anything.

## Reminders

A reminder is a time when a task should be brought to your attention. Memo keeps it on your computer;
another program you choose, such as your agent or a script, asks Memo for reminders that are due and
shows them to you.

```sh
memo reminders add 7 --at-time 2026-10-20T09:00:00+02:00 --timezone Europe/Madrid --account telegram:1
memo reminders list --source telegram:1
memo reminders update 3 --revision 1 --at-time 2026-10-21T09:00:00+02:00 --account telegram:1
memo reminders cancel 3 --account telegram:1
```

Write the time with its offset from UTC, such as `+02:00` for Madrid in summer. A reminder belongs to
an account, so adding or changing one needs `--account`; for a task from a notes folder, that is the folder,
such as `--account notes:1`. Closing a task cancels its reminders.

A task in a project, such as `HRB-1`, belongs to no account, so it cannot have a reminder yet. Neither can a
task from a note you wrote with `memo notes add` when the store holds no account at all.

For the program that shows reminders:

```sh
memo reminders poll --account telegram:1 --json
memo reminders ack REMINDER_ID RECEIPT --account telegram:1
```

`poll` hands out the reminders that are due, each with a receipt. `ack` with that receipt confirms
that the reminder was shown. A reminder that is not confirmed in time is handed out again with a new
receipt, so a crash does not lose it. Use the `deliveryId` in the answer to avoid showing the same
reminder twice. The import timer does not deliver reminders.

Next: [label tasks with tags](tags.md), or [see what your agent proposed](memories.md#proposed-actions).
