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
`notes:<number>` or as the `obsidian:<id>` or `local:<id>` its messages show; `folder:<id>` names it too.
`--source notes` names your folder when you have one. `memo tasks list` and `memo reminders list` without `--source` read every account and name them in
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
memo tasks add --project HRB --title 'Book the venue' --priority high
memo tasks add --project HRB --title 'Export drops the last row' --type bug
memo tasks list project:HRB
memo tasks update HRB-1 --priority critical --description 'Call before Friday'
```

A plain `memo tasks list` shows the tasks of your accounts only; a project's tasks are listed with
`project:` and the project's key, its name or an alias, and every project's with `project:*`.

| Option | Meaning |
|---|---|
| `--type` | `chore` (the default), `bug` or `feature` |
| `--priority` | `low`, `medium`, `high` or `critical`; `none` clears it. 0 (urgent) to 4 (low) still work as before |
| `--parent` | a bigger task this one is part of, in the same project |
| `--description` | more detail, in Markdown |
| `--assignee` | who does it, by the person's ID |

To create the project first, see [organizations and projects](people.md#organizations-and-projects).

## Priority and order

A priority is a number from 0 to 1, higher first, and you see it as one of four labels by quarter: `low`
(below 0.25), `medium`, `high` and `critical` (0.75 and up). `--json` gives both, `priority` and
`priority_label`. The number also orders a project's tasks, so a board column keeps the order you give it:

```sh
memo tasks move HRB-3 --before HRB-1                      # HRB-3 goes just above HRB-1
memo tasks move HRB-3 --status in_progress --after HRB-2  # into another column, below HRB-2
```

`tasks move` gives the task a priority between its new neighbours. When that crosses a quarter, its label changes,
and the answer says so (`label.changed`). When two neighbours leave no room, Memo spreads that quarter of the
column out evenly and names the tasks it renumbered.

## States

A project task is `open` (new), `todo` (decided to do), `in_progress`, `done` or `dismissed`. Move it with
`tasks update --status`, back from `done` or `dismissed` too; every change is kept in its history. `todo` and
`in_progress` count as open work everywhere: a task that waits for one is not ready, and an agent may claim one.
A task from a message is only `open`, `done` or `dismissed`.

```sh
memo tasks update HRB-1 --status in_progress
memo tasks history HRB-1 --json      # who changed what, and when
```

## Find project tasks

`memo tasks list` with `project:` takes a query: fields joined by AND, OR inside a field, NOT, and plain words,
which search the title and description:

```sh
memo tasks list project:* 'assignee:"person:3"' priority:[high TO critical] invoice
memo tasks list project:(HRB OR OPS) state:(done OR dismissed) closed:>=14d
memo tasks list project:* overdue:true --sort due
memo tasks list project:* NOT due:* NOT priority:*
memo tasks counts project:* --json   # how many per project, assignee, priority and state
```

| Field | Meaning |
|---|---|
| `state:` | `open`, `todo`, `in_progress`, `done`, `dismissed`; without it, the three open states |
| `project:` | a key, a name, `project:<id>`, or `*` for every project |
| `assignee:` | `any`, `none`, or a person: `"person:3"` in quotes, or `3` |
| `priority:` | a label, `none`, or a range of labels or numbers |
| `agent:` | the agent working on it, `none` or `any` |
| `due:`, `closed:` | a date or a range: `due:[today TO 2026-12-31]`, `closed:>=14d` |
| `overdue:`, `ready:` | `true` or `false` |

`--sort` takes `priority` (the default), `due`, `created`, `updated`, `key` or `state`; `--desc` turns it round.
A list holds at most 500 tasks; `page.next_cursor` and `--cursor` read the next ones, and `page.total` says how
many match. Each task carries its `assignments`, `ready` and `blocked_by`, and its `revision`.

## Changed elsewhere

An agent may edit a task while you look at it. Give the `revision` you read, and Memo refuses the write when the
task changed since, with the reason `task.stale` and exit code 3:

```sh
memo tasks update HRB-1 --title 'Book the hall' --revision 4
```

`tasks update`, `close`, `assign` and `move` take `--revision`.

## Who works on it

```sh
memo tasks assign HRB-1 PERSON_UID
memo tasks assign HRB-1 PERSON_UID --role reviewer
memo tasks assign HRB-1 PERSON_UID --clear     # take them off it
memo people list                               # you, and everyone tasks already name
memo tasks update HRB-1 --agent hermes         # the agent working on it; --agent none clears it
```

An agent is not an assignee: `agent` names the agent on the work until someone changes it, while a claim
(`tasks claim`) is a lease that runs out on its own. The role is `assignee` (the default), `reviewer` or `watcher`. A person's ID comes from their
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
memo tasks links HRB-2
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
memo reminders claim --account telegram:1 --json
memo reminders acknowledge REMINDER_ID RECEIPT --account telegram:1
```

`claim` hands out the reminders that are due, each with a receipt. `acknowledge` with that receipt confirms
that the reminder was shown. A reminder that is not confirmed in time is handed out again with a new
receipt, so a crash does not lose it. Use the `deliveryId` in the answer to avoid showing the same
reminder twice. The import timer does not deliver reminders.

Next: [label tasks with tags](tags.md), or [see what your agent proposed](memories.md#proposed-actions).
