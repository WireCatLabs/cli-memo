import { CliError } from "@wirecat/cli-base"
import type { MessageStore } from "@wirecat/cli-core/store"

export const addFact = (store: MessageStore, input: Parameters<MessageStore["facts"]["add"]>[0]) => {
  if (input.by !== "owner" && !input.evidence?.length)
    throw new CliError("validation_error", "an agent's fact must cite at least one evidence reference", {
      param: "evidence",
    })
  return store.facts.add(input)
}
