import { defineReasons, type ErrorReason } from "@wirecat/cli-base/standards"

/** The reasons memo raises itself; cli-base's and cli-core's are merged in by `failureContext`. */
export const REASONS: ErrorReason[] = defineReasons([
  {
    reason: "projects.agent-decisions-off",
    code: "permission_error",
    message: "the owner turned agent decisions off (agent_decisions: false); ask the owner to decide",
    details: [],
  },
  {
    reason: "sync.running",
    code: "rate_limited",
    message: "another memo sync is running (process {pid}); try again when it ends",
    details: ["pid"],
  },
  {
    reason: "folder.unbound",
    code: "configuration_error",
    message: "the notes folder {path} has no folder id; memo folders add or memo folders update gives it one",
    details: ["path"],
  },
  { reason: "folder.not-found", code: "not_found", message: "the store has no such folder of notes", details: [] },
  {
    reason: "notes.folder-missing",
    code: "not_found",
    message: "the notes folder {path} is missing — connect its disk; if it moved, memo folders update <id> <new path>",
    details: ["path"],
  },
  {
    reason: "note.not-imported",
    code: "not_found",
    message: "the note is not imported; memo sync --only notes",
    details: [],
  },
  {
    reason: "mail.account-unknown",
    code: "not_found",
    message: "no mail account by that name in mail.accounts",
    details: ["account"],
  },
  {
    reason: "mail.moved-to-mail-cli",
    code: "validation_error",
    message: "the command moved to the mail CLI; the message names the command to run there",
    details: ["cli", "alternative"],
  },
  {
    reason: "mail.throttled",
    code: "rate_limited",
    message: "Gmail is limiting this account's IMAP traffic; try again in an hour or more",
    details: [],
  },
  {
    reason: "mail.invalid-imap",
    code: "invalid_response",
    message: "the mail server's answer could not be read",
    details: [],
  },
  {
    reason: "project.not-found",
    code: "not_found",
    message: "no such project; memo projects list shows them",
    details: [],
  },
  { reason: "person.not-found", code: "not_found", message: "the store has no person by that name", details: [] },
  {
    reason: "identity.no-messenger",
    code: "validation_error",
    message: "the name has no messenger; write it as <messenger>:<name or id>",
    details: [],
  },
  { reason: "auto.systemctl-failed", code: "provider_error", message: "systemctl failed", details: [] },
])
