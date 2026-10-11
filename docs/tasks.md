# Open work and reminders

This page is for keeping track of what you owe people: a request in a message, a promise in a note, an
action an agent proposed. A task points at its source, so you can always see why it exists. Reminders
are local: memo schedules them and a caller you choose polls for them; nothing is sent to a messenger
or mailbox.

## Open work

```sh
memo tasks add 'msg:telegram/1/77/42' --type request
memo tasks add 'note:NOTE_ID' --provider telegram --account 1 --type request
memo tasks list --provider telegram --account 1 --json
memo tasks assign TASK_ID PERSON_UID --role reviewer
memo tasks close TASK_ID --provider telegram --account 1 --as done
memo tasks add --project RES --title 'Export drops the last row' --type bug --priority 1 --assignee PERSON_UID
memo tasks update RES-1 --priority 0 --description 'Seen on CSV export'
memo tasks list --project RES
memo tasks close RES-1 --reason fixed
```

A bug, feature or chore has no source: `--project` (its key or `project:<id>`) and `--title` make it there,
keyed `<project key>-<n>`. `--priority` (0 urgent … 4 low), `--parent`, `--description` and `--assignee` work
on any task, one from a message too; `tasks update` changes them later. `tasks assign` names an assignee,
reviewer or watcher. Every change of status, due date, priority or assignee is recorded as a task event.
New project keys have 3–4 characters; existing project and task keys remain valid.

## Dependencies and ready work

```sh
memo tasks add --project RES --title 'Research draft' --type feature
memo tasks add --project RES --title 'Review draft' --type chore
memo tasks link RES-2 RES-1 --kind blocked-by --json
memo tasks link RES-2 RES-1 --kind follow-up-of --json
memo tasks readiness RES-2 --json
memo tasks ready --project RES --json
```

Only completed prerequisites make a blocked task ready. Dismissed or deleted blockers need review. Follow-up and
related links are informational. `tasks relations` lists edges; `tasks unlink` removes a reviewed
edge with the same `--kind`. Parent hierarchy is separate.

MCP `task_relations`, `task_readiness` and `tasks_ready` expose bounded discovery to an agent. They
never claim, assign, execute or accept task relationships. Durable worker leases and the cited
meeting-findings batch workflow are separate follow-on work.

Native note tasks belong to the explicitly selected stored account. Their previews read current note
text; deleting a note keeps its task with an unavailable source. Repeated creation of the same kind
returns the existing task, including one already closed. Closed tasks stay closed on repeated creation.

A person's `memo context` lists the open tasks related to them — see
[context about a person](people.md#context-about-a-person).

## Local task reminders

```sh
memo reminders schedule TASK_ID --at 2026-10-09T09:00:00+02:00 --timezone Europe/Madrid --provider telegram --account 1
memo reminders poll --provider telegram --account 1 --json
memo reminders ack REMINDER_ID RECEIPT --provider telegram --account 1
memo reminders snooze REMINDER_ID --revision 1 --at 2026-10-10T09:00:00+02:00 --provider telegram --account 1
memo reminders cancel REMINDER_ID --provider telegram --account 1
```

Reminders are local deliveries for an explicitly scheduled open task. Poll leases due deliveries;
acknowledgement confirms consumption. Expired leases retry with a new receipt; integrations deduplicate
by `deliveryId` (reminder ID and revision). State survives restart. Snooze checks the current revision;
task closure cancels pending reminders. The import timer continues to import sources and does not
deliver reminders to messengers or email. A caller can schedule `poll` using its chosen local scheduler.

Next: [label tasks and sources with tags](tags.md).
