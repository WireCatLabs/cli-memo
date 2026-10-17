# Cleanup

Things to remove later: one line each — the path, why, and the date.

- Store data, not a file: the `email` account's chats and messages (and their `:attachment:` entries) and the
  `mail_message_folders:*` and `mail_attachments:*` sync-state keys that `memo mail import` wrote before 0.8.0 —
  mail now lives in the mail tables. **Before removing:** move every tagging and annotation on those message and
  chat rows to the matching `emails` / `email_threads` row (same thread and message ids); deleting a message fires
  `message_ad`, which deletes its taggings. Only after a re-import has covered the window wanted. 2026-10-11.
- `plans/gmail-cleanup.md` and `plans/universal-mail-rules.md`: CLAUDE.md says plans live in cli-private, never
  here. Copied unchanged to cli-private as `plans/2026-10-16-memo-gmail-cleanup.md` and
  `plans/2026-10-14-memo-universal-mail-rules.md` (commit 16b910b8); remove the `plans/` folder here. 2026-10-17.
