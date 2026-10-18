import type { Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { addMeetingPreparationCommand, LOCAL_READ } from "@wirecat/cli-core/cli"
import type { Command } from "commander"
import { answers, withStore } from "../answer.js"
import { MEETING_ACCOUNT_HELP, type SourceOptions, sourceOf, sourceOptions } from "../store/source-list.js"
import { prepareStoredMeeting } from "./preparation.js"
import { preparationText } from "./preparation-text.js"

export const meetingPreparationCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const { print } = answers(program, streams, env)
  const command = addMeetingPreparationCommand(program, {
    communications: true,
    signal: () => undefined,
    read: (seriesId, request) => {
      const options = command.opts<SourceOptions>()
      const source = sourceOf(options, (text) => streams.diagnostic(text))
      return withStore(env, (store) => prepareStoredMeeting(store, env, source, seriesId, request))
    },
    output: (answer) => print(command.opts().json, answer, preparationText(answer.item)),
  })
  sourceOptions(command, MEETING_ACCOUNT_HELP).option("--json", "print the standard JSON answer")
  command.description("prepare cited stored context for a series; does not verify its next meeting time")
  const context = command.options.find((option) => option.long === "--context-source")
  if (context) context.description = "one stored app.profile or email.mailbox, optionally =cursor; repeat (tg.personal)"
  annotate(command, {
    effects: LOCAL_READ,
    examples: ["memo meetings prepare 123 --source zoom:personal --json"],
  })
}
