import type { Streams } from "@wirecat/cli-base"
import { overrideSharedContract } from "@wirecat/cli-core/cli"
import {
  createMeetingPassageCommand,
  createMeetingSearchCommand,
  type MeetingPassageFlags,
  type MeetingSearchFlags,
  meetingHitSearchRequest,
  meetingPassageRequest,
  meetingSearchArguments,
} from "@wirecat/cli-core/meetings/cli"
import type { Command } from "commander"
import { answers, itemAnswer, withStore } from "../answer.js"
import { MEETING_ACCOUNT_HELP, type SourceOptions, sourceOf, sourceOptions } from "../store/source-list.js"
import { readStoredMeetingPassage, searchStoredMeetings } from "./read.js"

export const meetingReadCommands = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const { print } = answers(program, streams, env)
  const source = (given: SourceOptions) => sourceOf(given, (text) => streams.diagnostic(text))
  const output = (command: Command) =>
    sourceOptions(command, MEETING_ACCOUNT_HELP).option("--json", "print the standard JSON answer")
  const grammar = createMeetingSearchCommand(program)
  const search = overrideSharedContract(
    grammar,
    "Memo reads an explicitly selected stored source and exposes command-local JSON output.",
    (command) => {
      output(command)
    },
  )
  search.action(async (query: string, given: MeetingSearchFlags & SourceOptions & { json?: boolean }) => {
    const input = meetingHitSearchRequest(query, given)
    const result = await withStore(env, (store) =>
      searchStoredMeetings(store, env, source(given), query, input, meetingSearchArguments(query, given), {
        ...given,
        timesReadIn: grammar.getOptionValue("timesReadIn"),
      }),
    )
    print(given.json, result)
  })
  overrideSharedContract(
    createMeetingPassageCommand(program),
    "Memo passage reads an explicitly selected stored source and exposes command-local JSON output.",
    (command) => {
      output(command)
    },
  ).action(async (reference: string, given: MeetingPassageFlags & SourceOptions & { json?: boolean }) => {
    const format = given.json ? "json" : (given.format ?? "text")
    const input = meetingPassageRequest(reference, { ...given, format })
    const result = await withStore(env, (store) =>
      readStoredMeetingPassage(store, env, source(given), reference, input),
    )
    print(given.json, itemAnswer(result.packet), result.content)
  })
}
