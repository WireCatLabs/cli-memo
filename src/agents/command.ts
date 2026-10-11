import type { Streams } from "@wirecat/cli-core"
import type { Command } from "commander"
import { positive } from "../options.js"
import { answering } from "../records/run.js"

export const agentsCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const run = answering(streams, env)
  program
    .command("agents")
    .description("What agents did through the MCP servers that share the store")
    .command("log")
    .description("One row per tool call, newest first: agent, tool, tier, outcome and times, never its arguments")
    .option("--tool <name>", "only this tool")
    .option("--agent <name>", "only this agent, such as tg-mcp or memo-mcp")
    .option("--limit <n>", "most rows, up to 500", positive, 100)
    .option("--json", "print JSON")
    .action((options: { tool?: string; agent?: string; limit: number; json?: boolean }) =>
      run(options.json, async (store) => ({
        items: await store.agentActions.list({
          ...(options.tool === undefined ? {} : { tool: options.tool }),
          ...(options.agent === undefined ? {} : { agent: options.agent }),
          limit: options.limit,
        }),
      })),
    )
}
