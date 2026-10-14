import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { CliError, captureStreams } from "@wirecat/cli-base"
import { BASE_REASONS } from "@wirecat/cli-base/standards"
import { failureContext } from "@wirecat/cli-core/cli"
import { CommanderError } from "commander"
import * as v from "valibot"
import { describe, expect, it } from "vitest"
import { APP } from "./app.js"
import { errorObject, mcpFailure, reportFailure } from "./failure.js"
import { createProgram } from "./program.js"

const report = async (error: unknown, args: string[] = [], tty = false) => {
  const streams = captureStreams()
  const exit = await reportFailure(error, { args, program: createProgram({ streams }), streams, tty })
  return { exit, text: streams.stderr.join("") }
}

describe("failure handler", () => {
  it("reports a crash as internal_error without its own text", async () => {
    const { exit, text } = await report(new Error("password=hunter2"), ["notes", "list", "--json"])
    expect(exit).toBe(1)
    expect(JSON.parse(text)).toEqual({
      error: {
        code: "internal_error",
        reason: "command.crashed",
        message: "the command failed; this is a bug",
        retry: { safe: false },
      },
    })
    expect(text).not.toContain("hunter2")
  })

  it("prints the whole record after the object under --debug", async () => {
    const { text } = await report(new Error("boom"), ["notes", "list", "--json", "--debug"])
    const [object, record] = text
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
    expect(object.error.code).toBe("internal_error")
    expect(record).toMatchObject({
      severity: "error",
      command: "notes list",
      attributes: { thrown_message: "boom", stack: expect.any(Array) },
      resource: { service: "memo" },
    })
  })

  it("keeps a registered reason and its details", async () => {
    const running = new CliError("rate_limited", "another memo sync is running (process 42)", {
      reason: "sync.running",
      pid: 42,
      cause: "raw text",
    })
    const { exit, text } = await report(running, ["sync", "--json"])
    expect(exit).toBe(8)
    expect(JSON.parse(text).error).toEqual({
      code: "rate_limited",
      reason: "sync.running",
      message: "another memo sync is running (process 42)",
      details: { pid: 42 },
      retry: { safe: true },
    })
  })

  it("answers a parse failure as validation_error with Commander's words", async () => {
    const parse = new CommanderError(1, "commander.unknownOption", "error: unknown option '--nope'")
    const { exit, text } = await report(parse, ["notes", "list", "--nope", "--json"])
    expect(exit).toBe(2)
    expect(JSON.parse(text).error).toEqual({
      code: "validation_error",
      reason: "input.invalid",
      message: "unknown option '--nope'",
      retry: { safe: false },
    })
  })

  it("writes one line for a person at a terminal", async () => {
    expect((await report(new CliError("not_found", "no note 7"), ["notes", "show", "7"], true)).text).toBe(
      "✗ no note 7",
    )
  })

  it("gives MCP the same object as the CLI's --json", async () => {
    const failure = new CliError("not_found", "no note 7")
    const { text } = await report(failure, ["--json"])
    expect(await mcpFailure(failure)).toEqual({
      isError: true,
      structuredContent: JSON.parse(text),
      content: [{ type: "text", text }],
    })
  })

  it("names the argument at fault when a tool's input does not parse", async () => {
    const thrown = (() => {
      try {
        v.parse(v.object({ limit: v.number() }), { limit: "five" })
      } catch (error) {
        return error
      }
    })()
    expect((await errorObject(thrown)).error).toMatchObject({
      code: "validation_error",
      reason: "input.invalid",
      param: "limit",
    })
  })

  it("registers every reason memo raises", () => {
    const known = new Set([...BASE_REASONS, ...(failureContext(APP.errors).reasons ?? [])].map((entry) => entry.reason))
    const raised = readdirSync("src", { recursive: true, encoding: "utf8" })
      .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
      .flatMap((file) =>
        [...readFileSync(join("src", file), "utf8").matchAll(/reason: "([a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+)"/g)].map(
          (match) => match[1],
        ),
      )
    expect(raised).toContain("sync.running")
    expect(raised.filter((reason) => !known.has(reason as string))).toEqual([])
  })
})
