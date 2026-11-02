import { CliError, createRenderer, type Streams } from "@wirecat/cli-base"
import { COMPACT_FLAG } from "@wirecat/cli-base/standards"
import {
  type Body,
  compactText,
  currentRun,
  itemOf,
  type ListInput,
  listOf,
  renderAnswer,
  rootOf,
  sealed,
} from "@wirecat/cli-core/cli"
import { type MessageStore, openStore } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { STORE_CLIENT } from "./app.js"
import { decisionPolicy } from "./config.js"
import { snakeKeys } from "./output.js"
import { rowOf, sectionRowOf } from "./rows.js"

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
  const store = await openStore({ env, ...STORE_CLIENT, decisions: decisionPolicy(env) })
  try {
    return await work(store)
  } finally {
    await store.close()
  }
}

const running = new WeakMap<Command, Command>()

const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

/** A command's answer as lines, drawn by cli-core from the command's row; `next` steps are left to the renderer. */
export const plainText = (body: Body, command?: Command): string => {
  const { next: _, ...rest } = body
  return compactText(rest as Body, rowOf(command), { timezone: timezone() }, sectionRowOf)
}

/** `--compact`: the same lines, with each next step rerunning in the compact form, as cli-core draws them. */
const compactView = (command: Command, full: boolean) => (kept: Body) => {
  const whole = sealed(kept)
  const next = whole.next?.map((step) =>
    step.kind === "command" && step.line ? { ...step, line: `${step.line} ${COMPACT_FLAG}` } : step,
  )
  return compactText(
    next ? { ...whole, next } : whole,
    rowOf(command),
    {
      timezone: timezone(),
      ...(full ? { textChars: 0 } : {}),
    },
    sectionRowOf,
  )
}

/** The answer is judged by the command that ran — whether it may be partial — so the root remembers it. */
export const trackAnswers = (program: Command): void => {
  currentRun()
  program
    .option(
      COMPACT_FLAG,
      "one line per item for an agent: reference first, text last, paging and next steps as # lines",
    )
    .hook("preAction", (root, leaf) => {
      const { compact, json, brief } = leaf.optsWithGlobals()
      if (compact && (json || brief))
        throw new CliError(
          "validation_error",
          `${COMPACT_FLAG} and ${json ? "--json" : "--brief"} are two forms — pick one`,
        )
      running.set(root, leaf)
    })
}

/**
 * Prints answers through cli-core's renderer: the whole envelope for `--json`, one line per item for `--compact`,
 * otherwise `text`, or plain lines where a command has no text view.
 */
export const answers = (program: Command, streams: Streams, env: NodeJS.ProcessEnv) => {
  const print = (json: boolean | undefined, body: Body, text?: string): void => {
    const format = json ? "json" : "pretty"
    const root = rootOf(program)
    const leaf = running.get(root) ?? root
    const { compact, full } = leaf.optsWithGlobals<{ compact?: boolean; full?: boolean }>()
    const renderer = createRenderer({ format, color: false, streams })
    // In compact form the next steps are # lines on stdout; printing them again on stderr would say them twice.
    const drawn = compact === true && !json
    renderAnswer(
      leaf,
      { renderer: drawn ? { ...renderer, note: () => undefined } : renderer, format, streams },
      body,
      drawn ? compactView(leaf, full === true) : () => `${text ?? plainText(body, leaf)}\n`,
    )
  }
  return {
    print,
    run: async (json: boolean | undefined, work: (store: MessageStore) => Promise<Body>) =>
      print(json, await withStore(env, work)),
  }
}
