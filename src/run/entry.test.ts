import { EventEmitter } from "node:events"
import { PassThrough } from "node:stream"
import { startCli } from "@wirecat/cli-core/cli/start"
import { describe, expect, it } from "vitest"
import { memoEntry } from "./entry.js"

const serve = async (requests: string[][]): Promise<Map<number, { code: number; stdout: string }>> => {
  const stdin = new PassThrough()
  const stdout = new PassThrough()
  const lines: string[] = []
  stdout.on("data", (chunk: Buffer) => lines.push(...chunk.toString("utf8").split("\n").filter(Boolean)))
  const served = startCli(
    memoEntry({
      argv: ["node", "memo", "commands", "--serve"],
      stdin,
      stdout,
      stderr: new PassThrough(),
      signals: new EventEmitter() as unknown as NodeJS.Process,
      setExitCode: () => {},
    }),
  )
  for (const [id, argv] of requests.entries()) stdin.write(`${JSON.stringify({ id, argv })}\n`)
  stdin.end()
  await served
  const answers = lines.map((line) => JSON.parse(line)).filter((answer) => "id" in answer)
  return new Map(answers.map(({ id, code, stdout: out }) => [id, { code, stdout: out }]))
}

describe("memo commands --serve", () => {
  it("answers two requests of one command at once each with its own options", async () => {
    const answers = await serve([
      ["people", "list", "kind:all", "--limit", "1", "--json"],
      ["people", "list", "kind:all", "--limit", "2", "--json"],
    ])

    const limitOf = (id: number) => JSON.parse(answers.get(id)?.stdout ?? "{}").page?.limit
    expect([answers.get(0)?.code, answers.get(1)?.code]).toEqual([0, 0])
    expect([limitOf(0), limitOf(1)]).toEqual([1, 2])
  })
})
