import type { Streams } from "@wirecat/cli-base"
import { annotate, customizeSharedCommand } from "@wirecat/cli-base/commands"
import {
  addMeetingPreparationCommand,
  LOCAL_READ,
  overrideSharedContract,
  sharedCommandTemplate,
} from "@wirecat/cli-core/cli"
import type { Command } from "commander"
import { answers, withStore } from "../answer.js"
import { APP } from "../app.js"
import { SHELL_OVERRIDES } from "../contract-overrides.js"
import { MEETING_ACCOUNT_HELP, type SourceOptions, sourceOf, sourceOptions } from "../store/source-list.js"
import { prepareStoredMeeting } from "./preparation.js"
import { preparationText } from "./preparation-text.js"

const meetingPreparationCommandDefinition = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
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
  overrideSharedContract(
    command,
    "Memo prepares stored evidence only, names its stored accounts explicitly and cannot verify the next calendar meeting.",
    (one) => {
      sourceOptions(one, MEETING_ACCOUNT_HELP).option("--json", "print the standard JSON answer")
      one.description("prepare cited stored context for a series; does not verify its next meeting time")
      const context = one.options.find((option) => option.long === "--context-source")
      if (context)
        context.description = "one stored app.profile or email.mailbox, optionally =cursor; repeat (tg.personal)"
      annotate(one, {
        effects: LOCAL_READ,
        examples: ["memo meetings prepare 123 --source zoom:personal --json"],
      })
    },
  )
}

export const meetingPreparationCommand = (...args: Parameters<typeof meetingPreparationCommandDefinition>) => {
  customizeSharedCommand(
    sharedCommandTemplate(APP, "meetings"),
    "Memo exposes stored meeting evidence and preparation across explicitly named source accounts; provider import and sync commands are unsupported.",
    () => {
      meetingPreparationCommandDefinition(...args)
      const command = args[0].commands.find((command) => command.name() === "meetings")
      if (!command) throw new Error("meetings builder did not install its command")
      return command
    },
    SHELL_OVERRIDES.meetings,
  )
}
