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

/** An order or an invoice, with a row per line under it. */
const LINED: RowShape = {
  columns: [{ field: "ref" }, { field: "title" }, { field: "status" }, { field: "review" }],
  sections: { lines: "memo_money_line" },
}

/** A proposal as `review` lists it. */
export const PROPOSAL_ROW: RowShape = {
  columns: [
    { field: "id" },
    { field: "kind" },
    { field: "title" },
    { field: "score" },
    { field: "proposer" },
    { field: "created_at", as: "day" },
  ],
  text: ["reason"],
}

/** A `review confirm` or `reject` answer: a line per proposal decided, then one per proposal refused. */
const DECISIONS: RowShape = {
  columns: [],
  sections: { decided: "memo_decided", refused: "memo_refused" },
  oneLine: true,
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
  "leads list": {
    columns: [{ field: "ref" }, { field: "project_name" }, { field: "created_at", as: "day" }],
    text: ["summary"],
  },
  "memories list": fact,
  "people list": {
    columns: [
      { field: "ref" },
      { field: "display_name" },
      { field: "contact" },
      { field: "owner", tag: "owner" },
      { field: "messages_from", as: "count", tag: "messages" },
      { field: "tasks", as: "count", tag: "tasks" },
      { field: "kind_signals" },
    ],
  },
  "people check": {
    columns: [
      { field: "ref" },
      { field: "display_name" },
      { field: "contact" },
      { field: "kind" },
      { field: "same_name", tag: "same name" },
    ],
  },
  "events list": {
    columns: [
      { field: "ref" },
      { field: ["starts_at", "ends_at"], as: "time" },
      { field: "event_type" },
      { field: "in" },
      { field: "title" },
    ],
    text: ["description"],
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
  "wallets list": {
    columns: [{ field: "ref" }, { field: "title" }, { field: "balance.amount" }, { field: "balance.currency" }],
  },
  "review show": { ...PROPOSAL_ROW, oneLine: true },
  "review confirm": DECISIONS,
  "review reject": DECISIONS,
  "orders show": LINED,
  "orders lines add": LINED,
  "orders lines remove": LINED,
  "invoices show": LINED,
  "invoices lines add": LINED,
  "invoices lines remove": LINED,
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
  memo_money_line: {
    columns: [
      { field: "position" },
      { field: "quantity" },
      { field: "unit_price" },
      { field: "amount" },
      { field: "product" },
    ],
    text: ["description"],
  },
  memo_decided: { columns: [{ field: "id" }, { field: "status" }, { field: "kind" }] },
  memo_refused: { columns: [{ field: "id" }, { field: "code" }, { field: "reason" }], text: ["message"] },
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
