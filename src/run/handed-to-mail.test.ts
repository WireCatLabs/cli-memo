import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { openStore } from "@wirecat/cli-core/store"
import { describe, expect, it } from "vitest"
import { createProgram } from "../program.js"

const ME = "owner@example.test"

const setup = () => {
  const dir = mkdtempSync(join(tmpdir(), "handed-"))
  const mailbox = join(dir, "mailbox.json")
  writeFileSync(
    mailbox,
    JSON.stringify({
      messages: [
        {
          uid: "101",
          messageId: "9001",
          threadId: "9001",
          receivedAt: new Date().toISOString(),
          subject: "Synthetic subject",
          from: ["Rin Example", "rin@example.test"],
          to: [[null, ME]],
          text: "Synthetic body",
        },
      ],
    }),
  )
  mkdirSync(join(dir, "config"))
  writeFileSync(
    join(dir, "config", "config.json"),
    JSON.stringify({ mail: { accounts: [{ name: "test", address: ME, import: false }] } }),
  )
  const env = {
    ...process.env,
    MEMO_FAKE_MAILBOX: mailbox,
    MESSAGING_STORE: join(dir, "messages.db"),
    MEMO_CONFIG_DIR: join(dir, "config"),
    MEMO_STATE_DIR: join(dir, "state"),
  }
  return env
}

const sync = async (env: NodeJS.ProcessEnv, args: string[]) => {
  const streams = captureStreams()
  await createProgram({ streams, env })
    .exitOverride()
    .parseAsync(["sync", "--only", "mail", "--no-embed", "--json", ...args], { from: "user" })
  return streams
}

const emailCount = async (env: NodeJS.ProcessEnv) => {
  const store = await openStore({ env })
  try {
    return (await store.mail.emailFacts({})).length
  } finally {
    await store.close()
  }
}

describe("a mail account with import: false", () => {
  it("is skipped by a plain sync", async () => {
    const env = setup()
    const streams = await sync(env, [])
    expect(await emailCount(env)).toBe(0)
    expect(streams.stdout.join("")).not.toContain("handed_to_mail")
  })

  it("says the import is handed to mail when its name is given", async () => {
    const env = setup()
    const streams = await sync(env, ["--source", "email:test"])
    expect(await emailCount(env)).toBe(0)
    expect(streams.stdout.join("")).toContain("handed_to_mail")
    expect(streams.stderr.join("")).toContain("handed to the mail CLI")
  })
})
