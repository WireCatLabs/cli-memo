import { defineReasons, type ErrorReason } from "@wirecat/cli-base/standards"

/** The reasons memo raises itself; cli-base's and cli-core's are merged in by `failureContext`. */
export const REASONS: ErrorReason[] = defineReasons([
  {
    reason: "ref.bare-number",
    code: "validation_error",
    message: "{value} is a bare number, which names no one kind of record here; give a reference such as {suggestion}",
    details: ["value", "suggestion"],
  },
  {
    reason: "decision.owner-unconfirmed",
    code: "confirmation_required",
    message: "--as-owner asks at a terminal, and nobody is at one to answer; the owner runs it there, without --json",
    details: [],
  },
  {
    reason: "decision.decider-unknown",
    code: "confirmation_required",
    message: "nothing shows who decides; the owner decides at a terminal, an agent from its own session with --reason",
    details: [],
  },
  {
    reason: "proposal.kind-unsupported",
    code: "validation_error",
    message: "this memo cannot decide mail findings yet — memo upgrade",
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
    message: "no stored mailbox by that address; the mail CLI syncs one",
    details: ["account"],
  },
  {
    reason: "mail.mailbox-needed",
    code: "validation_error",
    message: "the store holds several mailboxes, or none; --source names the one to read",
    details: ["param"],
  },
  {
    reason: "mail.moved-to-mail-cli",
    code: "validation_error",
    message: "the command moved to the mail CLI; the message names the command to run there",
    details: ["cli", "alternative"],
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
