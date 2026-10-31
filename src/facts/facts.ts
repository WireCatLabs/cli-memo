import { CliError } from "@wirecat/cli-base"
import type { MessageStore } from "@wirecat/cli-core/store"

export const addFact = async (store: MessageStore, input: Parameters<MessageStore["facts"]["add"]>[0]) => {
  if (input.by !== "owner" && !input.evidence?.length)
    throw new CliError("validation_error", "an agent's fact must cite at least one evidence reference", {
      param: "evidence",
    })
  // An agent may confirm its own proposal over MCP or in a terminal, which would push out what the owner accepted.
  if (input.by !== "owner" && input.supersedes !== undefined)
    if ((await store.facts.get(input.supersedes)).status === "accepted")
      throw new CliError("permission_error", "only the owner corrects an accepted fact; an agent adds a new one", {
        param: "supersedes",
      })
  return store.facts.add(input)
}
