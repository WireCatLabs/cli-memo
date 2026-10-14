import { createRenderer, type Streams } from "@wirecat/cli-base"
import { type MessageStore, openStore } from "@wirecat/cli-core/store"
import { answerOf, processStart, snakeKeys } from "../output.js"

/** Prints an answer as JSON in the envelope, or for a person as `text`, or as indented JSON where it has no text view. */
export const printing =
  (streams: Streams) =>
  (json: boolean | undefined, answer: unknown, text?: string): void => {
    if (json) createRenderer({ format: "json", color: false, streams }).result(answerOf(answer, processStart()))
    else streams.data(`${text ?? JSON.stringify(snakeKeys(answer), null, 2)}\n`)
  }

/** Opens the store for one command, prints its answer as JSON or as indented text, and closes the store. */
export const answering = (streams: Streams, env: NodeJS.ProcessEnv) => {
  const print = printing(streams)
  return async (json: boolean | undefined, work: (store: MessageStore) => Promise<unknown>): Promise<void> => {
    const store = await openStore({ env })
    try {
      print(json, await work(store))
    } finally {
      await store.close()
    }
  }
}
