import { join } from "node:path"
import { CliError, resolvePaths, type Streams } from "@wirecat/cli-base"
import { annotate, customizeSharedCommand } from "@wirecat/cli-base/commands"
import { LOCAL_WRITE, mcpServerCommand, sharedCommandTemplate } from "@wirecat/cli-core/cli"
import { type Command, Option } from "commander"
import { answers, itemAnswer } from "../answer.js"
import { APP } from "../app.js"
import { SHELL_OVERRIDES } from "../contract-overrides.js"
import type { ProgramFactory } from "./catalogue.js"

const DEFAULT_PORT = 8767

export const httpTokenFile = (env: NodeJS.ProcessEnv): string =>
  join(resolvePaths({ appName: APP.appName, prefix: APP.envPrefix, env }).state, "mcp-http", "memo.json")

interface McpOptions {
  permission?: string[]
  http?: boolean
  port?: string
  publicUrl?: string
  revoke?: boolean
  json?: boolean
}

const mcpCommandDefinition = (
  program: Command,
  streams: Streams,
  env: NodeJS.ProcessEnv,
  createProgram: ProgramFactory,
): void => {
  const out = answers(program, streams, env)
  annotate(program.command("mcp"), { effects: LOCAL_WRITE, lifetime: "persistent", mcp: false })
    .summary("serve commands over stdio or authenticated HTTP")
    .description("serve memo commands over MCP on stdio or authenticated HTTP, limited by saved permissions")
    .option(
      "--permission <key=level>",
      "tighten one saved permission for this server; repeat for more keys",
      (value: string, previous: string[] = []) => [...previous, value],
    )
    .option("--json", "print the revocation receipt as JSON")
    .option("--http", "serve on 127.0.0.1 behind an HTTPS tunnel with an owner access-code login")
    .option("--port <port>", `local HTTP port (default ${DEFAULT_PORT}); requires --http`)
    .option(
      "--public-url <url>",
      "tunnel's HTTPS address without /mcp, or a path of it such as https://<name>.ts.net/memo; requires --http",
    )
    .addOption(
      new Option("--revoke", "log every browser app out of Memo").conflicts([
        "http",
        "port",
        "publicUrl",
        "permission",
      ]),
    )
    .addCommand(
      mcpServerCommand({
        example: "memo",
        defaultPort: DEFAULT_PORT,
        target: () => ({
          invocation: "memo",
          envPrefix: APP.envPrefix,
          env,
          tokenFile: httpTokenFile(env),
          argv: ["mcp", "--http"],
          version: APP.version,
        }),
        answer: (self, item, lines) =>
          out.print(self.optsWithGlobals<{ json?: boolean }>().json, itemAnswer(item), lines.join("\n")),
      }),
    )
    .action(async (options: McpOptions) => {
      if (!options.http && (options.port !== undefined || options.publicUrl !== undefined))
        throw new CliError("validation_error", "--port and --public-url require --http")
      if (options.revoke) {
        const { revokeAll } = await import("@wirecat/cli-core/mcp")
        revokeAll(httpTokenFile(env))
        out.print(options.json, itemAnswer({ revoked: true }))
        return
      }
      const { createMemoServer } = await import("./server.js")
      const build = () => createMemoServer(env, createProgram, options.permission)
      if (options.http) {
        const { httpLockFile, mcpUrlOf, portOf, publicUrlOf, serveOverHttp } = await import("@wirecat/cli-core/mcp")
        const publicUrl = publicUrlOf(options.publicUrl, {
          missing: "--http",
          reaches: "the browser apps reach memo",
          path: true,
        })
        const port = portOf(options.port, DEFAULT_PORT)
        // Fail closed before opening a socket, even when no client has asked for tools yet.
        await build().close()
        let stop!: () => void
        const stopped = new Promise<void>((resolve) => {
          stop = resolve
        })
        process.once("SIGINT", stop)
        process.once("SIGTERM", stop)
        try {
          const listening = await serveOverHttp(build, {
            publicUrl,
            port,
            tokenFile: httpTokenFile(env),
            lockFile: httpLockFile(httpTokenFile(env)),
            version: APP.version,
            appName: "memo",
            // Started by `mcp server start`, its log is a file: the code goes only to the lock that status reads.
            onCode: (code, expires) =>
              streams.diagnostic(
                env[`${APP.envPrefix}_MCP_HTTP`] === undefined
                  ? `login code for a new browser app: ${code} (until ${expires.toTimeString().slice(0, 5)})`
                  : "a new login code for a browser app: `memo mcp server status`",
              ),
            onError: (error) => streams.diagnostic(`mcp: ${error.message}`),
          }).catch((error: unknown) => {
            if ((error as NodeJS.ErrnoException).code === "EADDRINUSE")
              throw new CliError("configuration_error", `port ${port} is in use — pass another with --port`)
            throw error
          })
          try {
            streams.diagnostic(
              `serving on ${listening.url.href} — point your tunnel at it; connectors use ${mcpUrlOf(publicUrl).href}`,
            )
            await stopped
          } finally {
            await listening.close()
          }
        } finally {
          process.off("SIGINT", stop)
          process.off("SIGTERM", stop)
        }
        return
      }
      const { serveStdio } = await import("@modelcontextprotocol/server/stdio")
      serveStdio(build, { onerror: (error) => streams.diagnostic(`mcp: ${error.message}`) })
      await new Promise<void>((resolve) => {
        process.stdin.once("end", resolve)
        process.stdin.once("close", resolve)
        process.once("SIGINT", resolve)
        process.once("SIGTERM", resolve)
      })
    })
}

export const mcpCommand = (...args: Parameters<typeof mcpCommandDefinition>) =>
  customizeSharedCommand(
    sharedCommandTemplate(APP, "mcp"),
    "Memo uses Core's stdio/HTTP transport and login while binding its profile-free local store, saved permissions and token state; connector management remains in the client app.",
    () => {
      mcpCommandDefinition(...args)
      const command = args[0].commands.find((command) => command.name() === "mcp")
      if (!command) throw new Error("mcp builder did not install its command")
      return command
    },
    SHELL_OVERRIDES.mcp,
  )
