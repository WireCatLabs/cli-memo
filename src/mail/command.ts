import type { Streams } from "@wirecat/cli-base"
import type { Command } from "commander"
import { mailFindingsCommand } from "./findings-command.js"
import { mailReviewCommands } from "./review-command.js"
import { mailSubscriptionsCommand } from "./subscriptions-command.js"

/**
 * `review mail`, `review findings` and `review subscriptions`: the `mail` word is the mail CLI's in `wcat`, so wcat's
 * mail reads sit in review.
 */
export const reviewMailCommands = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const named = (name: string) => {
    const found = program.commands.find((command) => command.name() === name)
    if (!found) throw new Error(`wcat ${name} is mounted before wcat review mail`)
    return found
  }
  const review = named("review")
  mailFindingsCommand(program, review, streams, env)
  mailReviewCommands(review, named("messages"), env)
  mailSubscriptionsCommand(review, program, streams, env)
}
