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
    reason: "findings.file-missing",
    code: "not_found",
    message: "no findings file {path}: give the findings JSON itself, a file that exists, or - for stdin",
    details: ["path"],
  },
  {
    reason: "records.not-stored",
    code: "not_found",
    message: "no record {record} from that source; memo records list shows them",
    details: ["record"],
  },
  {
    reason: "records.file-missing",
    code: "not_found",
    message: "no records file {path}: give a file that exists, or - for stdin",
    details: ["path"],
  },
  {
    reason: "records.file-unreadable",
    code: "validation_error",
    message: "the records file {path} cannot be read: {why}",
    details: ["path", "why"],
  },
  {
    reason: "findings.key-mismatch",
    code: "validation_error",
    message: "the batch's key {key} is not --key {given}; give the key once, as --key",
    details: ["key", "given"],
  },
  {
    reason: "findings.duplicate",
    code: "validation_error",
    message: "the order, invoice, payment, task or fact is stored or waits for the owner already; the answer names it",
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
    reason: "folder.delete-notes",
    code: "confirmation_required",
    message: "removing the folder deletes {notes} of its notes from the store; nothing was changed — add --yes",
    details: ["notes"],
  },
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
    reason: "events.account-unknown",
    code: "not_found",
    message: "account: names no calendar account in the store; the message lists the ones it holds",
    details: [],
  },
  {
    reason: "mail.account-unknown",
    code: "not_found",
    message: "no stored mailbox by that address; the mail CLI syncs one",
    details: ["account"],
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
  {
    reason: "evidence.quote-unmatched",
    code: "validation_error",
    message: "a --quote names none of the --evidence references, or one twice; write it as <ref>=<the words>",
    details: [],
  },
  { reason: "auto.systemctl-failed", code: "provider_error", message: "systemctl failed", details: [] },
])
