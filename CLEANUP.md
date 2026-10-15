# Cleanup

Things to remove later: one line each — the path, why, and the date.

- Store data, not a file: the `email` account's chats and messages (and their `:attachment:` entries) and the
  `mail_message_folders:*` and `mail_attachments:*` sync-state keys that `memo mail import` wrote before 0.8.0 —
  mail now lives in the mail tables. **Before removing:** move every tagging and annotation on those message and
  chat rows to the matching `emails` / `email_threads` row (same thread and message ids); deleting a message fires
  `message_ad`, which deletes its taggings. Only after a re-import has covered the window wanted. 2026-10-11.
- 2026-10-14: `../cli-memo-wt-tasks-move`, branch `feat/tasks-from-source-tools` — memo task commands, rule pass, follow-ups skill; remove after its PR merges.
- 2026-10-14: `/home/leemour/Projects/AI/cli-memo-wt-tasks-link`, branch `feat/tasks-link-merged` — memo mounts cli-core's tasks link; remove after its PR merges.
