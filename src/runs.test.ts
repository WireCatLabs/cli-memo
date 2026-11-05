import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { listRuns, runsDirFor } from "@wirecat/cli-core/cli"
import { expect, it } from "vitest"
import { answerOf } from "../test/answer.js"
import { APP } from "./app.js"
import { createProgram } from "./program.js"

const sandbox = (): NodeJS.ProcessEnv => {
  const dir = mkdtempSync(join(tmpdir(), "memo-runs-"))
  return {
    ...process.env,
    XDG_DATA_HOME: join(dir, "data"),
    MEMO_STATE_DIR: join(dir, "data", "cli-memo"),
    XDG_CONFIG_HOME: join(dir, "config"),
    MEMO_CONFIG_DIR: join(dir, "config", "cli-memo"),
    MESSAGING_STORE: join(dir, "store.db"),
  }
}

const memo = async (env: NodeJS.ProcessEnv, args: string[]) => {
  const streams = captureStreams()
  const program = createProgram({ streams, env }).exitOverride()
  const failure = await program.parseAsync(args, { from: "user" }).then(
    () => undefined,
    (error: unknown) => error,
  )
  return { failure, stdout: streams.stdout.join("") }
}

const argvOfRun = (env: NodeJS.ProcessEnv) => {
  const [run] = listRuns(runsDirFor(APP, env))
  return run?.argv
}

const typed = ["search", "notes", "Kai Sample +34612345678", "--api-key", "fake-key-123", "--nonsense"]

const kept = (env: NodeJS.ProcessEnv) => listRuns(runsDirFor(APP, env)).map(({ command, status }) => [command, status])

it("keeps every command, and only the failed ones under record false", async () => {
  const env = sandbox()
  await memo(env, ["agents", "list", "--json"])
  await memo(env, ["notes", "show", "note:999999", "--json"])
  expect(kept(env)).toEqual([
    ["notes show", "failed"],
    ["agents list", "success"],
  ])
  for (const run of listRuns(runsDirFor(APP, env))) expect(run).not.toHaveProperty("profile")

  const quiet = sandbox()
  mkdirSync(quiet.MEMO_CONFIG_DIR ?? "", { recursive: true })
  writeFileSync(join(quiet.MEMO_CONFIG_DIR ?? "", "config.json"), JSON.stringify({ record: false }))
  await memo(quiet, ["agents", "list", "--json"])
  await memo(quiet, ["notes", "show", "note:999999", "--json"])
  expect(kept(quiet)).toEqual([["notes show", "failed"]])
})

it("takes record_input failed and the success retention and size limit", async () => {
  const env = sandbox()
  mkdirSync(env.MEMO_CONFIG_DIR ?? "", { recursive: true })
  writeFileSync(
    join(env.MEMO_CONFIG_DIR ?? "", "config.json"),
    JSON.stringify({ record_input: "failed", keep_successful_runs_for_days: 3, runs_size_limit_mb: 50 }),
  )
  await memo(env, typed)
  expect(argvOfRun(env)?.join(" ")).toContain("Kai Sample")
})

it("keeps a usage mistake under the words that name a command, never its arguments", async () => {
  const env = sandbox()
  await memo(env, ["mail", "nonsense-word"])
  expect(kept(env)).toEqual([["mail", "failed"]])
})

it("keeps the command as typed, with a secret and a phone number hidden", async () => {
  const env = sandbox()
  await memo(env, typed)
  const argv = argvOfRun(env)
  expect(argv).toContain("--nonsense")
  expect(argv?.join(" ")).toContain("Kai Sample")
  expect(argv?.join(" ")).not.toContain("612345678")
  expect(argv?.join(" ")).not.toContain("fake-key-123")
})

it("leaves the typed words out under record_input false", async () => {
  const env = sandbox()
  mkdirSync(env.MEMO_CONFIG_DIR ?? "", { recursive: true })
  writeFileSync(join(env.MEMO_CONFIG_DIR ?? "", "config.json"), JSON.stringify({ record_input: false }))
  await memo(env, typed)
  const argv = argvOfRun(env)
  expect(argv).toContain("search")
  expect(argv?.join(" ")).not.toContain("Kai Sample")
  expect(argv?.join(" ")).not.toContain("fake-key-123")
})

it("keeps nothing under --no-record, even a failure", async () => {
  const env = sandbox()
  await memo(env, ["notes", "show", "note:999999", "--json", "--no-record"])
  expect(kept(env)).toEqual([])
})

it("lists the kept runs, and reading them is not itself kept", async () => {
  const env = sandbox()
  await memo(env, ["notes", "show", "note:999999", "--json"])
  const { stdout } = await memo(env, ["runs", "list", "--limit", "5", "--page", "1", "--json"])
  const { items } = answerOf(stdout) as { items: { command: string; run_id: string }[] }
  expect(items.map(({ command }) => command)).toEqual(["notes show"])
  const shown = await memo(env, ["runs", "show", items[0]?.run_id ?? "", "--json"])
  expect(answerOf(shown.stdout)).toMatchObject({ command: "notes show", status: "failed" })
  const problems = await memo(env, ["runs", "show", items[0]?.run_id ?? "", "--problems", "--json"])
  expect(answerOf(problems.stdout)).toMatchObject({ command: "notes show" })
  const path = await memo(env, ["runs", "path", items[0]?.run_id ?? "", "--json"])
  expect(answerOf(path.stdout)).toEqual({ path: expect.stringContaining(runsDirFor(APP, env)) })
  expect(kept(env)).toHaveLength(1)
})
