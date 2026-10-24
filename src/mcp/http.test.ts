import { createHash, randomBytes } from "node:crypto"
import { mkdtempSync, readFileSync, statSync } from "node:fs"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client"
import { captureStreams } from "@wirecat/cli-base"
import { afterEach, describe, expect, it } from "vitest"
import { updateConfig } from "../config.js"
import { throwParseFailures } from "../failure.js"
import { createProgram } from "../program.js"
import { httpTokenFile } from "./command.js"

const closers: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const close of closers.splice(0).reverse()) await close()
})

const portAvailable = () =>
  new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      server.close(() => resolve(typeof address === "object" && address ? address.port : 0))
    })
  })

const fixture = (): NodeJS.ProcessEnv => {
  const dir = mkdtempSync(join(tmpdir(), "memo-http-"))
  return {
    ...process.env,
    MEMO_CONFIG_DIR: join(dir, "config"),
    MEMO_STATE_DIR: join(dir, "state"),
    MESSAGING_STORE: join(dir, "store.db"),
  }
}

const start = async (env = fixture(), extra: string[] = [], givenPort?: number) => {
  const port = givenPort ?? (await portAvailable())
  const base = new URL(`http://127.0.0.1:${port}`)
  const streams = captureStreams()
  const codes: string[] = []
  const original = streams.diagnostic
  let ready!: () => void
  const started = new Promise<void>((resolve) => {
    ready = resolve
  })
  streams.diagnostic = (line) => {
    original(line)
    const code = /login code for a new browser app: (\S+)/.exec(line)?.[1]
    if (code) codes.push(code)
    if (line.startsWith("serving on ")) ready()
  }
  const before = new Set(process.listeners("SIGTERM"))
  const program = createProgram({ streams, env })
  throwParseFailures(program)
  const running = program.parseAsync(["mcp", "--http", "--public-url", base.href, "--port", String(port), ...extra], {
    from: "user",
  })
  const stop = () => process.listeners("SIGTERM").find((listener) => !before.has(listener))
  let stopped = false
  const close = async () => {
    if (stopped) return
    stopped = true
    stop()?.("SIGTERM")
    await running
    expect(process.listeners("SIGTERM").filter((listener) => !before.has(listener))).toEqual([])
  }
  closers.push(close)
  await Promise.race([
    started,
    running.then(() => {
      throw new Error("HTTP server exited before listening")
    }),
  ])
  return { base, env, streams, codes, close }
}

const login = async (base: URL, code: string) => {
  const redirect = "https://app.example/callback"
  const registered = await fetch(new URL("/register", base), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_name: "Synthetic app", redirect_uris: [redirect] }),
  })
  const { client_id } = (await registered.json()) as { client_id: string }
  const verifier = randomBytes(32).toString("base64url")
  const consent = await fetch(new URL("/authorize", base), {
    method: "POST",
    redirect: "manual",
    body: new URLSearchParams({
      response_type: "code",
      client_id,
      redirect_uri: redirect,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      login_code: code,
    }),
  })
  expect(consent.status).toBe(302)
  const authCode = new URL(consent.headers.get("location") ?? "").searchParams.get("code") ?? ""
  const response = await fetch(new URL("/token", base), {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id,
      redirect_uri: redirect,
      code: authCode,
      code_verifier: verifier,
    }),
  })
  expect(response.status).toBe(200)
  return (await response.json()) as { access_token: string; refresh_token: string }
}

const connect = async (base: URL, token: string, modern: boolean) => {
  const client = new Client(
    { name: "synthetic", version: "1" },
    modern ? { versionNegotiation: { mode: { pin: "2026-07-28" } } } : {},
  )
  await client.connect(
    new StreamableHTTPClientTransport(new URL("/mcp", base), {
      requestInit: { headers: { authorization: `Bearer ${token}` } },
    }),
  )
  closers.push(() => client.close())
  return client
}

const call = (client: Client, command: string, args: Record<string, unknown>, write = false) =>
  client.callTool({ name: write ? "memo_write" : "memo_read", arguments: { command, arguments: args } })

describe("Memo HTTP MCP", () => {
  it.each([false, true])("authenticates and runs the shared CLI commands, modern=%s", async (modern) => {
    const { base, env, codes, streams, close } = await start()
    const unauthenticated = await fetch(new URL("/mcp", base), { method: "POST" })
    expect(unauthenticated.status).toBe(401)
    const tokens = await login(base, codes[0] ?? "")
    const saved = readFileSync(httpTokenFile(env), "utf8")
    expect(saved).not.toContain(tokens.access_token)
    expect(saved).not.toContain(tokens.refresh_token)
    if (process.platform !== "win32") expect(statSync(httpTokenFile(env)).mode & 0o777).toBe(0o600)
    const client = await connect(base, tokens.access_token, modern)
    expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual([
      "memo_tools_search",
      "memo_read",
      "memo_write",
    ])
    const added = await call(client, "notes add", { text: "Synthetic HTTP note" }, true)
    expect(added, JSON.stringify(added)).not.toHaveProperty("isError", true)
    expect((await call(client, "search notes", { query: "Synthetic" })).isError).not.toBe(true)
    updateConfig((config) => ({ ...config, permissions: { "notes.add": "deny" } }), env)
    const denied = await call(client, "notes add", { text: "Must stay absent" }, true)
    expect(denied.isError).toBe(true)
    const discovery = await client.callTool({ name: "memo_tools_search", arguments: { query: "notes add" } })
    expect(JSON.stringify(discovery.structuredContent)).toContain('"available":false')
    const revokeStreams = captureStreams()
    const program = createProgram({ streams: revokeStreams, env })
    throwParseFailures(program)
    await program.parseAsync(["mcp", "--revoke", "--json"], { from: "user" })
    expect(JSON.parse(revokeStreams.stdout.join("")).item).toEqual({ revoked: true })
    expect(
      (
        await fetch(new URL("/mcp", base), {
          method: "POST",
          headers: { authorization: `Bearer ${tokens.access_token}` },
        })
      ).status,
    ).toBe(401)
    expect(streams.stdout).toEqual([])
    await client.close()
    await close()
    await expect(fetch(base)).rejects.toThrow()
  })

  it("retains app logins across a normal server restart at the same origin", async () => {
    const env = fixture()
    const port = await portAvailable()
    const first = await start(env, [], port)
    const tokens = await login(first.base, first.codes[0] ?? "")
    await first.close()
    const second = await start(env, [], port)
    const client = await connect(second.base, tokens.access_token, false)
    expect((await call(client, "notes list", {})).isError).not.toBe(true)
  })

  it("keeps writes discoverable but refused under a read lock and preserves server overrides", async () => {
    const { base, codes } = await start({ ...fixture(), MEMO_READ_ONLY: "1" }, ["--permission", "notes.add=deny"])
    const tokens = await login(base, codes[0] ?? "")
    const client = await connect(base, tokens.access_token, false)
    expect((await call(client, "notes add", { text: "Refused" }, true)).isError).toBe(true)
    expect((await call(client, "notes list", {})).isError).not.toBe(true)
    const found = await client.callTool({ name: "memo_tools_search", arguments: { query: "notes add" } })
    expect(JSON.stringify(found.structuredContent)).toContain('"available":false')
  })

  it.each([
    ["--port", "8767"],
    ["--http"],
    ["--http", "--public-url", "http://remote.example"],
    ["--http", "--public-url", "https://user:synthetic-password@device.example"],
    ["--http", "--public-url", "https://device.example/mcp"],
    ["--http", "--public-url", "https://device.example", "--port", "0"],
    ["--http", "--public-url", "https://device.example", "--permission", "mcp.authority=allow"],
    ["--revoke", "--http"],
  ])("refuses invalid or loosening startup options: %j", async (...argv) => {
    const program = createProgram({ streams: captureStreams(), env: fixture() })
    throwParseFailures(program)
    await expect(program.parseAsync(["mcp", ...argv], { from: "user" })).rejects.toThrow()
  })
})
