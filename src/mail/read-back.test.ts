import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { formatLocator } from "@wirecat/cli-core"
import { openStore } from "@wirecat/cli-core/store"
import { describe, expect, it } from "vitest"
import { answerOf } from "../../test/answer.js"
import { createProgram } from "../program.js"
import { himalaya } from "./himalaya.js"
import { importMail } from "./import.js"
import { himalayaSource } from "./source.js"

const ME = "owner@example.test"
const KEY = { provider: "email", account: ME }
const LOCATOR = formatLocator({ ...KEY, chat: "9001", message: "9001" })

const run = async (args: string[], env: NodeJS.ProcessEnv) => {
  const streams = captureStreams()
  await createProgram({ streams, env })
    .exitOverride()
    .parseAsync([...args, "--json"], { from: "user" })
  return answerOf(streams.stdout.join(""))
}

describe("mail imported into the mail tables reads back through memo", () => {
  it("is found by search, ask, context, tags and tasks", async () => {
    const dir = mkdtempSync(join(tmpdir(), "memo-mail-read-"))
    const mailbox = join(dir, "mailbox.json")
    writeFileSync(
      mailbox,
      JSON.stringify({
        messages: [
          {
            uid: "101",
            messageId: "9001",
            threadId: "9001",
            receivedAt: "2026-09-11T08:00:00Z",
            subject: "Synthetic roadmap",
            from: ["Rin Example", "rin@example.test"],
            to: [[null, ME]],
            text: "The roadmap review moves to Friday.",
          },
        ],
      }),
    )
    const env = {
      ...process.env,
      MEMO_FAKE_MAILBOX: mailbox,
      MESSAGING_STORE: join(dir, "messages.db"),
      MEMO_CONFIG_DIR: join(dir, "config"),
    }
    const store = await openStore({ env })
    try {
      await importMail({
        store,
        source: himalayaSource(himalaya(env), { name: "test" }),
        account: { name: "test", address: ME },
        since: new Date("2026-09-01T00:00:00Z"),
        now: () => Date.parse("2026-10-04T12:00:00Z"),
      })
    } finally {
      await store.close()
    }

    expect((await run(["search", "mail", "roadmap"], env)).items.map(({ ref }: { ref: string }) => ref)).toEqual([
      LOCATOR,
    ])
    const all = await run(["search", "all", "roadmap"], env)
    expect(all.items.find(({ kind }: { kind: string }) => kind === "mail")?.ref).toBe(LOCATOR)

    const asked = await run(["ask", "roadmap", "--source", `email:${ME}`], env)
    expect(JSON.stringify(asked)).toContain(LOCATOR)

    const context = await run(["context", "email:rin@example.test", "--source", `email:${ME}`], env)
    expect(JSON.stringify(context)).toContain("The roadmap review moves to Friday.")

    await run(["tags", "add", "follow-up", "--message", LOCATOR], env)
    const listed = await run(["tags", "list"], env)
    expect(listed.items.map(({ locator }: { locator?: string }) => locator)).toContain(LOCATOR)

    const task = await run(["tasks", "add", LOCATOR, "--account", `email:${ME}`], env)
    expect(task.task.source).toBe(LOCATOR)
    expect((await run(["search", "mail", "tag:follow-up"], env)).items.map(({ ref }: { ref: string }) => ref)).toEqual([
      LOCATOR,
    ])

    const shown = await run(["messages", "show", LOCATOR], env)
    expect(shown).toMatchObject({ locator: LOCATOR, anchor: true, email: { from: { address: "rin@example.test" } } })
    expect(shown.text).toContain("The roadmap review moves to Friday.")
    await expect(run(["messages", "show", "msg:telegram/1/2/3"], env)).rejects.toMatchObject({
      code: "not_found",
    })
  })
})
