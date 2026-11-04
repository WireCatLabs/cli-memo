import type { Streams } from "@wirecat/cli-base"
import type { Command } from "commander"
import { mailFindingsCommand } from "./findings-command.js"
import { movedToMailCommands } from "./moved.js"
import { mailReviewCommands } from "./review-command.js"

export const mailCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const mail = program
    .command("mail")
    .description("mail the mail CLI stored: review new mail for an agent, stage what it found")
    .summary("review new mail, stage findings")
  mailFindingsCommand(program, mail, streams, env)
  const messages = program.commands.find((command) => command.name() === "messages")
  if (!messages) throw new Error("memo messages is mounted before memo mail")
  mailReviewCommands(mail, messages, env)
  movedToMailCommands(mail)
}
