import type { Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { LOCAL_READ, withQuery } from "@wirecat/cli-core/cli"
import type { Command } from "commander"
import { answers } from "../answer.js"
import { positive } from "../options.js"
import { AGENT_LOG_QUERY, listAgentActions } from "./log.js"

export const agentsCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const { run } = answers(program, streams, env)
  const agents = program.command("agents").description("what agents did through the MCP servers that share the store")
  withQuery(
    annotate(agents.command("log"), { effects: LOCAL_READ, output: { entity: "agent_action" } })
      .summary("one row per tool call, newest first: agent, tool, outcome and times")
      .description("one row per tool call, newest first: agent, tool, tier, outcome and times, never its arguments"),
    AGENT_LOG_QUERY,
  )
    .option("--limit <n>", "most rows, up to 500", positive, 100)
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((words: string[], options: { limit: number; json?: boolean }) =>
      run(options.json, (store) => listAgentActions(store, words, options.limit)),
    )
}
