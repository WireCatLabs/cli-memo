import { createRenderer, type Streams } from "@wirecat/cli-base"
import { type Body, currentRun, itemOf, type ListInput, listOf, renderAnswer, rootOf } from "@wirecat/cli-core/cli"
import { type MessageStore, openStore } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { snakeKeys } from "./output.js"

export const itemAnswer = <T>(value: T, extra?: Parameters<typeof itemOf>[1]) => itemOf(snakeKeys(value), extra)

/**
 * A list. One that takes neither `--cursor` nor `--page` shows more only by a higher `--limit`, so it names no
 * next page and no `page.next` step: both would point at a flag the command does not have.
 */
export const listAnswer = <T>(command: string, input: ListInput<T>) => {
  const body = listOf(command, { ...input, items: snakeKeys(input.items) as unknown[] })
  if (input.cursor !== undefined || input.page !== undefined) return body
  if (body.page.mode === "page") delete body.page.next_page
  const next = body.next?.filter(({ step }) => step !== "page.next") ?? []
  if (next.length > 0) body.next = next
  else delete body.next
  return body
}

export const wholeList = (command: string, items: unknown[]) =>
  listAnswer(command, { items, limit: Math.max(1, items.length), has_more: false })

export const withStore = async <T>(env: NodeJS.ProcessEnv, work: (store: MessageStore) => Promise<T>): Promise<T> => {
  const store = await openStore({ env })
  try {
    return await work(store)
  } finally {
    await store.close()
  }
}

const running = new WeakMap<Command, Command>()

type Fields = Record<string, unknown>
const isFields = (value: unknown): value is Fields =>
  typeof value === "object" && value !== null && !Array.isArray(value)
const oneLine = (value: unknown, width = 100): string => {
  const text = String(value).replace(/\s+/g, " ").trim()
  return text.length > width ? `${text.slice(0, width - 1)}…` : text
}
const shown = (value: unknown) => value !== null && value !== undefined && value !== ""
const firstOf = (fields: Fields, names: readonly string[]) =>
  names.map((name) => fields[name]).find((value) => shown(value) && !isFields(value) && !Array.isArray(value))

/** One line for a listed record: what names it, what it says, what state it is in. */
const rowOf = (row: unknown): string => {
  if (!isFields(row)) return oneLine(row)
  const parts = [
    firstOf(row, ["key", "ref", "id"]),
    firstOf(row, ["title", "name", "text", "path", "excerpt"]),
    firstOf(row, ["state", "status", "due_at"]),
  ].filter(shown)
  return parts.length ? parts.map((part) => oneLine(part)).join("  ") : blockOf(row).replace(/\n\s*/g, "  ")
}

/** A record as `field: value` lines; a nested record is indented under its field, a list counted or joined. */
const blockOf = (fields: Fields, indent = ""): string =>
  Object.entries(fields)
    .filter(([, value]) => shown(value) && !(Array.isArray(value) && value.length === 0))
    .map(([name, value]) => {
      if (isFields(value)) return `${indent}${name}:\n${blockOf(value, `${indent}  `)}`
      if (Array.isArray(value))
        return value.every((one) => !isFields(one) && !Array.isArray(one))
          ? `${indent}${name}: ${oneLine(value.join(", "))}`
          : `${indent}${name}: ${value.length} — --json shows them`
      return `${indent}${name}: ${oneLine(value)}`
    })
    .join("\n")

/** Text for a command with no view of its own; `--json` keeps the whole answer for scripts and agents. */
export const plainText = (body: Body): string => {
  if ("items" in body) {
    const rows = (body.items as unknown[]).map(rowOf)
    return [...(rows.length ? rows : ["nothing found"]), ...(body.page.has_more ? ["more: raise --limit"] : [])].join(
      "\n",
    )
  }
  return isFields(body.item) ? blockOf(body.item) : oneLine(body.item)
}

/** The answer is judged by the command that ran — whether it may be partial — so the root remembers it. */
export const trackAnswers = (program: Command): void => {
  currentRun()
  program.hook("preAction", (root, leaf) => {
    running.set(root, leaf)
  })
}

/**
 * Prints answers through cli-core's renderer: the whole envelope for `--json`, otherwise `text`, or plain lines
 * where a command has no text view.
 */
export const answers = (program: Command, streams: Streams, env: NodeJS.ProcessEnv) => {
  const print = (json: boolean | undefined, body: Body, text?: string): void => {
    const format = json ? "json" : "pretty"
    const root = rootOf(program)
    renderAnswer(
      running.get(root) ?? root,
      { renderer: createRenderer({ format, color: false, streams }), format, streams },
      body,
      () => `${text ?? plainText(body)}\n`,
    )
  }
  return {
    print,
    run: async (json: boolean | undefined, work: (store: MessageStore) => Promise<Body>) =>
      print(json, await withStore(env, work)),
  }
}
