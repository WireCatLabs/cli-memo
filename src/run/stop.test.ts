import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as sleep } from "node:timers/promises"
import { CliError, captureStreams } from "@wirecat/cli-base"
import { openStore } from "@wirecat/cli-core/store"
import { describe, expect, it } from "vitest"
import { createProgram } from "../program.js"

const ME = "owner@example.test"

const message = (n: number) => ({
  uid: String(100 + n),
  messageId: String(9000 + n),
  threadId: String(9000 + n),
  receivedAt: new Date(Date.parse("2026-09-10T08:00:00Z") + n * 60_000).toISOString(),
  subject: `Synthetic subject ${n}`,
  from: ["Rin Example", "rin@example.test"],
  to: [[null, ME]],
  text: `Synthetic body ${n}`,
})

// Sixty emails are two fetches of fifty; the second one hangs until the sync is stopped.
const stalling = () => {
  const dir = mkdtempSync(join(tmpdir(), "stop-"))
  const mailbox = join(dir, "mailbox.json")
  writeFileSync(mailbox, JSON.stringify({ messages: Array.from({ length: 60 }, (_, n) => message(n)), stallFetch: 2 }))
  mkdirSync(join(dir, "config"))
  writeFileSync(
    join(dir, "config", "config.json"),
    JSON.stringify({ mail: { accounts: [{ name: "test", address: ME }] } }),
  )
  const env = {
    ...process.env,
    MEMO_FAKE_MAILBOX: mailbox,
    MESSAGING_STORE: join(dir, "messages.db"),
    MEMO_CONFIG_DIR: join(dir, "config"),
    MEMO_STATE_DIR: join(dir, "state"),
  }
  return { dir, env, stalled: `${mailbox}.stalled` }
}

const sync = (env: NodeJS.ProcessEnv, args: string[], signal?: AbortSignal) =>
  createProgram({ streams: captureStreams(), env, ...(signal ? { signal } : {}) })
    .exitOverride()
    .parseAsync(["sync", "--only", "mail", "--since-time", "2026-09-01", "--limit", "100", "--no-embed", ...args], {
      from: "user",
    })

const doneSoFar = async (env: NodeJS.ProcessEnv) => {
  const store = await openStore({ env })
  try {
    const point = await store.sync.syncState({ provider: "email", account: ME }, "mail_resume:[Gmail]/All Mail")
    return JSON.parse(point?.value ?? "{}").last?.done
  } finally {
    await store.close()
  }
}

const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

describe("stopping memo sync", () => {
  it("on SIGTERM keeps the first batch's resume point, ends himalaya and frees the lock", async () => {
    const { dir, env, stalled } = stalling()
    const controller = new AbortController()

    const running = sync(env, [], controller.signal)
    while (!existsSync(stalled)) await sleep(20)
    controller.abort(new CliError("cancelled", "command interrupted by SIGTERM", { reason: "SIGTERM" }))

    await expect(running).rejects.toMatchObject({ code: "cancelled" })
    expect(await doneSoFar(env)).toBe(50)
    await expect.poll(() => alive(Number(readFileSync(stalled, "utf8")))).toBe(false)
    expect(existsSync(join(dir, "state", "import.lock"))).toBe(false)
  })

  it("stops at --timeout with the timeout error, keeping what it read", async () => {
    const { env } = stalling()

    await expect(sync(env, ["--timeout", "1s"])).rejects.toMatchObject({ code: "timeout" })
    expect(await doneSoFar(env)).toBe(50)
  })
})
