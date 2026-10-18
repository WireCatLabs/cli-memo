import { serveStdio } from "@modelcontextprotocol/server/stdio"
import type { Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { LOCAL_WRITE } from "@wirecat/cli-core/cli"
import type { Command } from "commander"
import { createMemoServer } from "./server.js"

export const mcpCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  annotate(program.command("mcp"), { effects: LOCAL_WRITE, lifetime: "persistent" })
    .description("serve search, person context, memories, facts and actions over MCP on stdio")
    .action(async () => {
      serveStdio(() => createMemoServer(env), { onerror: (error) => streams.diagnostic(`mcp: ${error.message}`) })
      await new Promise<void>((resolve) => {
        process.stdin.once("end", resolve)
        process.stdin.once("close", resolve)
        process.once("SIGINT", resolve)
        process.once("SIGTERM", resolve)
      })
    })
}
