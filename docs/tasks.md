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
memo tasks assign TASK_ID PERSON_UID --provider telegram --account 1
memo tasks close TASK_ID --provider telegram --account 1 --as done
```

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
