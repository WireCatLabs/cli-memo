import { randomUUID } from "node:crypto"
import { captureStreams, type Streams } from "@wirecat/cli-base"
import { describeProgram, flatten } from "@wirecat/cli-base/commands"
import { changesAuthorityAt, environmentOf, inRun, provide } from "@wirecat/cli-core/cli"
import { type AgentProgram, runCommandForAgent, toolsFromCommands } from "@wirecat/cli-core/mcp"
import type { Level } from "@wirecat/cli-core/sends"
import type { Command } from "commander"
import * as v from "valibot"
import { itemAnswer } from "../answer.js"
import { errorObject, throwParseFailures } from "../failure.js"

export type ProgramFactory = (options: { env: NodeJS.ProcessEnv; streams: Streams }) => Command

export const MCP_EXCLUSIONS = [
  { path: ["mcp"], reason: "starts another persistent MCP server" },
  { path: ["upgrade"], reason: "replaces the running executable" },
  { path: ["skill", "install"], reason: "installs instructions into other applications" },
  { path: ["jobs", "start"], reason: "installs a background timer" },
  { path: ["jobs", "stop"], reason: "removes a background timer" },
  { path: ["config", "unset"], reason: "can remove a saved permission the server enforces" },
  { path: ["memories", "remove"], reason: "erases what the owner reviews; only the owner forgets" },
  { path: ["facts", "remove"], reason: "erases what the owner reviews; only the owner forgets" },
  { path: ["facts", "reject"], reason: "the owner's answer to an agent's proposal" },
] as const

export const commandCatalogue = (env: NodeJS.ProcessEnv, createProgram: ProgramFactory) => {
  const program = createProgram({ env, streams: captureStreams() })
  const commands = describeProgram(program)
  const all = flatten(commands)
  const authority = changesAuthorityAt(program)
  const keyOf = (path: readonly string[]) => path.join(".")
  const byPath = new Map(all.map((info) => [keyOf(info.path), info]))
  const stdin = (path: readonly string[]) =>
    ["meetings.actions.add", "projects.actions.add"].includes(keyOf(path))
      ? { name: "input", description: "the cited findings proposal as JSON", json: true as const }
      : undefined
  const tools = toolsFromCommands(commands, {
    stdin,
    exclude: MCP_EXCLUSIONS.map(({ path }) => path),
    omit: ["as_owner", "debug", "json", "jsonl", "no_input", "record"],
  })
  for (const tool of tools)
    if (stdin(tool.path)) {
      const { file: _, ...entries } = tool.input.entries
      tool.input = v.object(entries)
    }
  const runner: AgentProgram = {
    commands,
    run: async (argv, environment) => {
      const streams = captureStreams()
      const fresh = createProgram({ streams, env: environment.env ?? env })
      let rendered = false
      provide(fresh, {
        ...environmentOf(fresh),
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
    availability: (path: readonly string[], levels: Record<string, Level>) => {
      const info = byPath.get(keyOf(path))
      const tool =
        info &&
        toolsFromCommands([info], { levels, keyOf, authority, includeUnavailable: true }).find(
          (one) => keyOf(one.path) === keyOf(path),
        )
      return tool?.availability?.() ?? { available: false, reason: "command is not available over MCP" }
    },
    authority,
    keyOf,
    program,
    run: async (path: readonly string[], input: Record<string, unknown>, levels: Record<string, Level>) =>
      inRun({ runId: randomUUID(), command: path.join(" "), startedAt: Date.now() }, () =>
        runCommandForAgent(runner, path, stdin(path) ? { ...input, file: "-" } : input, {
          stdin,
          authority,
          profile: "",
          env: { ...env, AI_AGENT: "memo-mcp" },
          levels: () => levels,
          keyOf,
        }),
      ),
  }
}
