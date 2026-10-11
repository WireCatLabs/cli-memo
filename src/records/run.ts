import { createRenderer, type Streams } from "@wirecat/cli-base"
import { type MessageStore, openStore } from "@wirecat/cli-messaging/store"

/** Opens the store for one command, prints its answer as JSON or as indented text, and closes the store. */
export const answering =
  (streams: Streams, env: NodeJS.ProcessEnv) =>
  async (json: boolean | undefined, work: (store: MessageStore) => Promise<unknown>): Promise<void> => {
    const store = await openStore({ env })
    try {
      const answer = await work(store)
      if (json) createRenderer({ format: "json", color: false, streams }).result(answer)
      else streams.data(`${JSON.stringify(answer, null, 2)}\n`)
    } finally {
      await store.close()
    }
  }
