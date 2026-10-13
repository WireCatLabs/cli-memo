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
memo tasks add note:12 --provider telegram --account 1 --type promise
memo tasks list --provider telegram --account 1
```

A task from a source has a type: `request` (the default), `question`, `mention` or `promise`. It
belongs to one messenger account. A message reference already names its account; for a note or a
file, add `--provider` and `--account`. Adding the same task twice gives you the existing one.

## Tasks in a project

A task in a project does not need a source. It gets a key made of the project's key and a number,
such as `HRB-1`:

```sh
memo tasks add --project HRB --title 'Book the venue' --priority 1
memo tasks add --project HRB --title 'Export drops the last row' --type bug
memo tasks list --project HRB
memo tasks update HRB-1 --priority 0 --description 'Call before Friday'
```

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
memo tasks close 7 --provider telegram --account 1 --as dismissed
```

Close a task with `--as done` (the default) or `--as dismissed`. `memo tasks list --state done` shows
closed tasks.
Every change of status, priority or assignee is recorded with the task.

## What to do first

One task can wait for another. Link them, then ask Memo which tasks can start:

```sh
memo tasks link HRB-2 HRB-1 --kind blocked-by     # HRB-2 waits for HRB-1
memo tasks ready --project HRB                    # tasks with nothing left to wait for
memo tasks readiness HRB-2                        # why HRB-2 can or cannot start
memo tasks relations HRB-2
memo tasks unlink HRB-2 HRB-1 --kind blocked-by
```

A task becomes ready only when every task it waits for is done. If a task it waits for was
dismissed, Memo asks you to review the link. `follow-up-of` and `related-to` links are for information and do not block anything.

## Reminders

A reminder is a time when a task should be brought to your attention. Memo keeps it on your computer;
another program you choose, such as your agent or a script, asks Memo for reminders that are due and
shows them to you.

```sh
memo reminders schedule 7 --at-time 2026-10-20T09:00:00+02:00 --timezone Europe/Madrid --provider telegram --account 1
memo reminders list --provider telegram --account 1
memo reminders snooze 3 --revision 1 --at-time 2026-10-21T09:00:00+02:00 --provider telegram --account 1
memo reminders cancel 3 --provider telegram --account 1
```

Write the time with its offset from UTC, such as `+02:00` for Madrid in summer. A reminder belongs to
an account, so it needs `--provider` and `--account`. Closing a task cancels its reminders.

For the program that shows reminders:

```sh
memo reminders poll --provider telegram --account 1 --json
memo reminders ack REMINDER_ID RECEIPT --provider telegram --account 1
```

`poll` hands out the reminders that are due, each with a receipt. `ack` with that receipt confirms
that the reminder was shown. A reminder that is not confirmed in time is handed out again with a new
receipt, so a crash does not lose it. Use the `deliveryId` in the answer to avoid showing the same
reminder twice. The import timer does not deliver reminders.

Next: [label tasks with tags](tags.md), or [see what your agent proposed](memories.md#proposed-actions).
