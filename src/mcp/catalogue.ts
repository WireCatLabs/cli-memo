import { captureStreams, type Streams } from "@wirecat/cli-base"
import { describeProgram, flatten } from "@wirecat/cli-base/commands"
import { changesAuthorityAt, provide } from "@wirecat/cli-core/cli"
import { type AgentProgram, runCommandForAgent, toolsFromCommands } from "@wirecat/cli-core/mcp"
import type { Level } from "@wirecat/cli-core/sends"
import type { Command } from "commander"
import { itemAnswer } from "../answer.js"
import { errorObject, throwParseFailures } from "../failure.js"

export type ProgramFactory = (options: { env: NodeJS.ProcessEnv; streams: Streams }) => Command

export const MCP_EXCLUSIONS = [
  { path: ["mcp"], reason: "starts another persistent MCP server" },
  { path: ["upgrade"], reason: "replaces the running executable" },
  { path: ["skill", "install"], reason: "installs instructions into other applications" },
  { path: ["auto", "start"], reason: "installs a background timer" },
  { path: ["auto", "stop"], reason: "removes a background timer" },
] as const

export const commandCatalogue = (env: NodeJS.ProcessEnv, createProgram: ProgramFactory) => {
  const program = createProgram({ env, streams: captureStreams() })
  const commands = describeProgram(program)
  const all = flatten(commands)
  const markedAuthority = changesAuthorityAt(program)
  const authority = (path: readonly string[]) =>
    markedAuthority(path) ||
    [
      "folders.add",
      "folders.attach",
      "folders.remove",
      "mail.rules.add",
      "mail.rules.remove",
      "mail.rules.import",
      "mail.rules.import-filters",
    ].includes(path.join("."))
  const keyOf = (path: readonly string[]) => path.join(".")
  const tools = toolsFromCommands(commands, {
    exclude: MCP_EXCLUSIONS.map(({ path }) => path),
    omit: ["as_owner", "debug", "json", "jsonl", "no_input"],
  })
  const runner: AgentProgram = {
    commands,
    run: async (argv, environment) => {
      const streams = captureStreams()
      const fresh = createProgram({ streams, env: environment.env ?? env })
      let rendered = false
      provide(fresh, {
        ...environment,
        streams,
        exit: {},
        ...(environment.agent
          ? {
              agent: {
                ...environment.agent,
                result: (value: unknown) => {
                  rendered = true
                  environment.agent?.result(value)
                },
              },
            }
          : {}),
      })
      throwParseFailures(fresh)
      try {
        const args = argv.slice(1)
        const info = all.find(
          (one) =>
            one.path.every((word, at) => args[at] === word) && (one.commands.length === 0 || one.effects !== undefined),
        )
        if (info && !info.options.some((option) => option.flags.includes("--json")))
          args.splice(args.indexOf("--json"), 1)
        await fresh.parseAsync(args, { from: "user" })
        const output = streams.stdout.join("").trim()
        let result: unknown
        try {
          result = output ? JSON.parse(output) : null
        } catch {
          result = itemAnswer({ text: output })
        }
        if (!rendered)
          environment.agent?.result(
            result && typeof result === "object" && ("item" in result || "items" in result)
              ? result
              : itemAnswer(result),
          )
        return 0
      } catch (error) {
        environment.agent?.failure(errorObject(error))
        return 1
      }
    },
  }
  return {
    tools,
    authority,
    keyOf,
    run: async (path: readonly string[], input: Record<string, unknown>, levels: Record<string, Level>) =>
      runCommandForAgent(runner, path, input, {
        profile: "",
        env: { ...env, AI_AGENT: "memo-mcp" },
        levels: () => levels,
        keyOf,
      }),
  }
}
