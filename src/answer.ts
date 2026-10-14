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

/** The answer is judged by the command that ran — whether it may be partial — so the root remembers it. */
export const trackAnswers = (program: Command): void => {
  currentRun()
  program.hook("preAction", (root, leaf) => {
    running.set(root, leaf)
  })
}

/**
 * Prints answers through cli-core's renderer: the whole envelope for `--json`, otherwise `text`, or the item or
 * items as indented JSON where a command has no text view.
 */
export const answers = (program: Command, streams: Streams, env: NodeJS.ProcessEnv) => {
  const print = (json: boolean | undefined, body: Body, text?: string): void => {
    const format = json ? "json" : "pretty"
    const root = rootOf(program)
    renderAnswer(
      running.get(root) ?? root,
      { renderer: createRenderer({ format, color: false, streams }), format, streams },
      body,
      () => `${text ?? JSON.stringify("items" in body ? body.items : body.item, null, 2)}\n`,
    )
  }
  return {
    print,
    run: async (json: boolean | undefined, work: (store: MessageStore) => Promise<Body>) =>
      print(json, await withStore(env, work)),
  }
}
