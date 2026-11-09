import { randomUUID } from "node:crypto"
import { captureStreams, type Streams } from "@wirecat/cli-base"
import { describeProgram, flatten } from "@wirecat/cli-base/commands"
import { changesAuthorityAt, environmentOf, inRun, provide } from "@wirecat/cli-core/cli"
import { type AgentProgram, callingAgent, runCommandForAgent, toolsFromCommands } from "@wirecat/cli-core/mcp"
import type { Level } from "@wirecat/cli-core/sends"
import type { Command } from "commander"
import * as v from "valibot"
import { itemAnswer } from "../answer.js"
import { errorObject, throwParseFailures } from "../failure.js"
import { grantLevels } from "./granted.js"

export type ProgramFactory = (options: { env: NodeJS.ProcessEnv; streams: Streams }) => Command

export const MCP_EXCLUSIONS = [
  { path: ["mcp"], reason: "starts another persistent MCP server" },
  { path: ["upgrade"], reason: "replaces the running executable" },
  { path: ["skill", "install"], reason: "installs instructions into other applications" },
  { path: ["jobs", "start"], reason: "installs a background timer" },
  { path: ["jobs", "stop"], reason: "removes a background timer" },
  { path: ["schedule"], reason: "installs timers that start memo or an agent later" },
  { path: ["config", "unset"], reason: "can remove a saved permission the server enforces" },
  { path: ["memories", "remove"], reason: "erases what the owner reviews; only the owner forgets" },
  { path: ["facts", "remove"], reason: "erases what the owner reviews; only the owner forgets" },
  { path: ["facts", "reject"], reason: "the owner's answer to an agent's proposal" },
  { path: ["records", "link"], reason: "only the owner says which entity a source's record is" },
  { path: ["sources", "preview"], reason: "fetches an address of the agent's choosing" },
  { path: ["sources", "remove"], reason: "erases what the owner added; only the owner removes it" },
  { path: ["sources", "suggest"], reason: "sends a source's text to a reader, which may be off this computer" },
  { path: ["sources", "readers", "set"], reason: "only the owner picks the reader a source's text goes to" },
  { path: ["models", "keys", "set"], reason: "keeps an API key; only the owner gives one" },
  { path: ["models", "keys", "remove"], reason: "forgets an API key; only the owner does" },
  { path: ["people", "unlink"], reason: "only the owner separates people" },
  { path: ["people", "unmerge"], reason: "only the owner separates people" },
] as const

/**
 * Commands whose input an agent hands over as stdin, never as a path: the argument that names the file is always `-`.
 * `sources add` is offered as text only, so an agent gets no way to make memo read a file of this computer or fetch
 * an address of its choosing; a path or a link is the owner's, on the command line.
 */
const STDIN_INPUT: Record<string, { argument: string; name: string; description: string; json?: true }> = {
  "meetings.actions.add": {
    argument: "file",
    name: "input",
    description: "the cited findings proposal as JSON",
    json: true,
  },
  "projects.actions.add": {
    argument: "file",
    name: "input",
    description: "the cited findings proposal as JSON",
    json: true,
  },
  "mail.findings.add": {
    argument: "file",
    name: "input",
    description: "the cited findings proposal as JSON",
    json: true,
  },
  "records.import": { argument: "file", name: "input", description: "the records envelope as JSON", json: true },
  "records.check": { argument: "file", name: "input", description: "the records envelope as JSON", json: true },
  "sources.add": { argument: "source", name: "text", description: "the text to keep as a source" },
}

export const commandCatalogue = (env: NodeJS.ProcessEnv, createProgram: ProgramFactory) => {
  const program = createProgram({ env, streams: captureStreams() })
  const commands = describeProgram(program)
  const all = flatten(commands)
  const authority = changesAuthorityAt(program)
  const keyOf = (path: readonly string[]) => path.join(".")
  const byPath = new Map(all.map((info) => [keyOf(info.path), info]))
  const stdinInput = (path: readonly string[]) => STDIN_INPUT[keyOf(path)]
  const stdin = (path: readonly string[]) => {
    const input = stdinInput(path)
    if (!input) return undefined
    const { argument: _, ...field } = input
    return field
  }
  const tools = toolsFromCommands(commands, {
    stdin,
    exclude: MCP_EXCLUSIONS.map(({ path }) => path),
    omit: ["as_owner", "compact", "debug", "from_app", "json", "jsonl", "no_input", "record", "text_file", "export"],
  })
  for (const tool of tools) {
    const input = stdinInput(tool.path)
    if (input) {
      const { [input.argument]: _, ...entries } = tool.input.entries
      tool.input = v.object(entries)
    }
  }
  const withStdin = (path: readonly string[], input: Record<string, unknown>) => {
    const named = stdinInput(path)
    return named ? { ...input, [named.argument]: "-" } : input
  }
  const runnerFor = (levels: Record<string, Level>): AgentProgram => ({
    commands,
    run: async (argv, environment) => {
      const streams = captureStreams()
      const fresh = createProgram({ streams, env: environment.env ?? env })
      grantLevels(fresh, levels)
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
  })
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
    run: async (
      path: readonly string[],
      input: Record<string, unknown>,
      levels: Record<string, Level>,
      overrides: readonly string[] = [],
    ) =>
      inRun({ runId: randomUUID(), command: path.join(" "), startedAt: Date.now() }, () =>
        runCommandForAgent(runnerFor(levels), path, withStdin(path, input), {
          stdin,
          authority,
          profile: "",
          env: { ...env, AI_AGENT: "memo-mcp", MEMO_MCP_CLIENT: callingAgent("memo-mcp") },
          levels: () => levels,
          // The server's own stricter levels reach the command too, so a read that leaves out denied kinds sees them.
          ...(overrides.length ? { overrides } : {}),
          keyOf,
        }),
      ),
  }
}
