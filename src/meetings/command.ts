import type { Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { LOCAL_READ } from "@wirecat/cli-core/cli"
import {
  createMeetingPassageCommand,
  createMeetingSearchCommand,
  type MeetingPassageFlags,
  type MeetingSearchFlags,
  meetingHitSearchRequest,
  meetingPassageRequest,
  meetingSearchArguments,
} from "@wirecat/cli-core/meetings/cli"
import { Command } from "commander"
import { answers, itemAnswer, withStore } from "../answer.js"
import { MEETING_ACCOUNT_HELP, type SourceOptions, sourceOf, sourceOptions } from "../store/source-list.js"
import { readStoredMeetingPassage, searchStoredMeetings } from "./read.js"

export const meetingReadCommands = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const { print } = answers(program, streams, env)
  const source = (given: SourceOptions) => sourceOf(given, (text) => streams.diagnostic(text))
  const output = (command: Command) =>
    sourceOptions(command, MEETING_ACCOUNT_HELP).option("--json", "print the standard JSON answer")
  const grammar = createMeetingSearchCommand(new Command())
  const group = program.commands.find((command) => command.name() === "search") ?? program.command("search")
  const search = annotate(group.command("meetings"), { effects: LOCAL_READ, output: { entity: "meeting_hit" } })
    .description(grammar.description())
    .argument("<query>", "words to find; each also matches its other word forms")
  const supported = new Set(["project", "sinceTime", "untilTime", "limit", "cursor", "maxReadBytes"])
  // Reuse SDK parsers for Memo's registered flags; MCP exposes the richer selectors.
  for (const option of grammar.options) {
    if (!supported.has(option.attributeName())) continue
    if (option.long === "--project") option.flags = "--project <project>"
    search.addOption(option)
  }
  output(search).action(async (query: string, given: MeetingSearchFlags & SourceOptions & { json?: boolean }) => {
    const input = meetingHitSearchRequest(query, given)
    const result = await withStore(env, (store) =>
      searchStoredMeetings(store, env, source(given), query, input, meetingSearchArguments(query, given), {
        ...given,
        timesReadIn: grammar.getOptionValue("timesReadIn"),
      }),
    )
    print(given.json, result)
  })
  output(annotate(createMeetingPassageCommand(program), { output: { entity: "meeting_context" } })).action(
    async (reference: string, given: MeetingPassageFlags & SourceOptions & { json?: boolean }) => {
      const format = given.json ? "json" : (given.format ?? "text")
      const input = meetingPassageRequest(reference, { ...given, format })
      const result = await withStore(env, (store) =>
        readStoredMeetingPassage(store, env, source(given), reference, input),
      )
      print(given.json, itemAnswer(result.packet), result.content)
    },
  )
}
