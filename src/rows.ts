import { type RowShape, rowShapeOf, rowsOfEntity } from "@wirecat/cli-core/cli"
import type { Command } from "commander"

const sender = { field: ["sender_is_me", "sender_name"], tag: "me" } as const

const fact: RowShape = {
  columns: [
    { field: "ref" },
    { field: "kind" },
    { field: "status" },
    { field: "subject_name" },
    { field: "project_name" },
    { field: ["occurred_at", "created_at"], as: "day" },
  ],
  text: ["text"],
}

/**
 * memo's rows by command path. Most of memo's answers are cli-core's shared entities (note, memory, task, hit), whose
 * rows cli-core will not take from an app, so memo keys its own by the command that answers them.
 */
export const ROWS: Readonly<Record<string, RowShape>> = {
  "search all": {
    columns: [{ field: "ref" }, { field: "kind" }, { field: "timestamp", as: "time" }, { field: "title" }, sender],
    text: ["excerpt"],
  },
  "search notes": {
    columns: [{ field: "ref" }, { field: "updated_at", as: "day" }, { field: ["title", "path"] }],
    text: ["excerpt"],
  },
  "search memories": fact,
  "search people": { columns: [{ field: "ref" }, { field: "name" }] },
  "notes list": {
    columns: [
      { field: "ref" },
      { field: "updated_at", as: "day" },
      { field: "source" },
      { field: ["title", "path"] },
      { field: "via" },
    ],
    text: ["text"],
  },
  "facts list": fact,
  "invoices list": {
    columns: [{ field: "ref" }, { field: "project_name" }, { field: ["issue_date", "created_at"], as: "day" }],
    text: ["title"],
  },
  "payments list": {
    columns: [{ field: "ref" }, { field: "project_name" }, { field: "date", as: "day" }],
    text: ["title"],
  },
  "deals list": {
    columns: [{ field: "ref" }, { field: "project_name" }, { field: "close_date", as: "day" }],
    text: ["summary"],
  },
  "memories list": fact,
  "people list": {
    columns: [
      { field: "ref" },
      { field: "name" },
      { field: "owner", tag: "owner" },
      { field: "tasks", as: "count", tag: "tasks" },
    ],
  },
  "organizations list": { columns: [{ field: "ref" }, { field: "name" }, { field: "kind" }] },
  "projects list": { columns: [{ field: "ref" }, { field: "key" }, { field: "name" }, { field: "kind" }] },
  "relationships list": {
    columns: [
      { field: "id" },
      { field: "from" },
      { field: "kind" },
      { field: "to" },
      { field: "role" },
      { field: "purpose" },
      { field: "confirmed", tag: "confirmed" },
    ],
  },
  "tasks list": {
    columns: [
      { field: ["key", "ref", "id"] },
      { field: "state" },
      { field: "kind" },
      { field: "priority_label" },
      { field: "project_key" },
      { field: "due_at", as: "day" },
      { field: "source" },
    ],
    text: ["title", "message.text"],
  },
  "messages show": {
    columns: [
      { field: "ref" },
      { field: ["timestamp", "date"], as: "time" },
      { field: "chat_title" },
      { field: ["from", "sender_is_me", "sender_name"], tag: "me" },
      { field: "subject" },
      { field: "attachments", as: "files" },
    ],
    text: ["text", "excerpt"],
  },
  "projects evidence": {
    columns: [{ field: "project_ref" }],
    sections: { items: "memo_evidence_item", people: "memo_evidence_person", linked_chats: "linked_chat" },
  },
  show: {
    columns: [{ field: "ref" }, { field: "kind" }, { field: "state" }, { field: "title" }, { field: "open.line" }],
  },
}

/** Rows for the lists inside an item answer, by the entity its row's `sections` names. */
const SECTION_ROWS: Readonly<Record<string, RowShape>> = {
  memo_evidence_item: {
    columns: [{ field: "ref" }, { field: "context" }, { field: "kind" }, { field: "title" }],
    text: ["text"],
  },
  memo_finance: {
    columns: [
      { field: "direction" },
      { field: "currency" },
      { field: "billed" },
      { field: "paid" },
      { field: "owed" },
      { field: "invoices", as: "count", tag: "invoices" },
      { field: "payments", as: "count", tag: "payments" },
    ],
  },
  memo_deal: {
    columns: [
      { field: "ref" },
      { field: "stage" },
      { field: "amount" },
      { field: "currency" },
      { field: "close_date", as: "day" },
    ],
    text: ["title"],
  },
  memo_evidence_person: {
    columns: [{ field: "person" }, { field: "name" }, { field: "items", as: "count", tag: "items" }],
  },
}

const shared = rowsOfEntity()
export const sectionRowOf = (entity: string): RowShape => SECTION_ROWS[entity] ?? shared(entity)

const pathOf = (command: Command): string => {
  const words: string[] = []
  for (let at: Command | null = command; at?.parent; at = at.parent) words.unshift(at.name())
  return words.join(" ")
}

/** The row a memo answer is drawn with: memo's for this command, else cli-core's for its entity, else the generic one. */
export const rowOf = (command: Command | undefined): RowShape =>
  (command && ROWS[pathOf(command)]) || rowShapeOf(command)
