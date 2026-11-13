import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { formatLocator } from "@wirecat/cli-core"
import { openStore } from "@wirecat/cli-core/store"
import { describe, expect, it } from "vitest"
import { answerOf } from "../../test/answer.js"
import { storeMail } from "../../test/mail-store.js"
import { createProgram } from "../program.js"

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
    const env = {
      ...process.env,
      MESSAGING_STORE: join(dir, "messages.db"),
      MEMO_CONFIG_DIR: join(dir, "config"),
    }
    const store = await openStore({ env })
    try {
      await storeMail(
        store,
        ME,
        [
          {
            uid: "101",
            messageId: "9001",
            threadId: "9001",
            receivedAt: "2026-09-11T08:00:00Z",
            subject: "Synthetic roadmap",
            from: ["Rin Example", "rin@example.test"],
            to: [[null, ME]],
            text: "The roadmap review moves to Friday.",
            attachment: { name: "minutes.txt", mime: "text/plain", content: `${"minutes ".repeat(600)}endmark` },
          },
        ],
        { since: new Date("2026-09-01T00:00:00Z"), now: () => Date.parse("2026-10-04T12:00:00Z") },
      )
    } finally {
      await store.close()
    }

    expect(
      (await run(["search", "mail", "roadmap", "--exact"], env)).items.map(({ ref }: { ref: string }) => ref),
    ).toEqual([LOCATOR])
    const all = await run(["search", "all", "roadmap"], env)
    expect(all.items.find(({ kind }: { kind: string }) => kind === "mail")?.ref).toBe(LOCATOR)

    const asked = await run(["answers", "create", "roadmap", "--source", `email:${ME}`], env)
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
    expect(shown.attachments).toEqual([expect.objectContaining({ name: "minutes.txt", text_cut: true })])
    expect(shown.attachments[0].text).not.toContain("endmark")
    const whole = await run(["messages", "show", LOCATOR, "--full"], env)
    expect(whole.attachments[0].text).toMatch(/endmark$/)
    await expect(run(["messages", "show", "msg:telegram/1/2/3"], env)).rejects.toMatchObject({
      code: "not_found",
    })
  })
})

describe("mail review through memo", () => {
  it("names the threads waiting on others with --waiting, and only what changed since the last --new", async () => {
    const dir = mkdtempSync(join(tmpdir(), "memo-mail-review-"))
    const env = { ...process.env, MESSAGING_STORE: join(dir, "messages.db"), MEMO_CONFIG_DIR: join(dir, "config") }
    const day = 86_400_000
    const ago = (days: number) => new Date(Date.now() - days * day).toISOString()
    const email = (uid: string, threadId: string, days: number, from: string, to: string) => ({
      uid,
      messageId: `review-${uid}`,
      threadId,
      receivedAt: ago(days),
      subject: `Synthetic thread ${threadId}`,
      from: [null, from] as [null, string],
      to: [[null, to]] as [null, string][],
      text: `Synthetic text ${uid}`,
    })
    const store = await openStore({ env })
    try {
      await storeMail(
        store,
        ME,
        [
          email("1", "asked", 10, "rin@example.test", ME),
          email("2", "asked", 8, ME, "rin@example.test"),
          email("3", "open", 2, "kai@example.test", ME),
        ],
        { since: new Date(Date.now() - 30 * day) },
      )
    } finally {
      await store.close()
    }
    const threads = (answer: { items: { chat_id: string }[] }) => [...new Set(answer.items.map((item) => item.chat_id))]
    expect(threads(await run(["mail", "review", "date>30d", "--waiting", "3d"], env))).toEqual(["asked"])
    expect(threads(await run(["mail", "review", "date>30d", "--waiting", "9d"], env))).toEqual([])
    expect(threads(await run(["mail", "review", "--new"], env))).toEqual(["open"])
    expect(threads(await run(["mail", "review", "--new"], env))).toEqual([])
    const later = await openStore({ env })
    try {
      await storeMail(later, ME, [email("4", "asked", 0, "rin@example.test", ME)], {
        since: new Date(Date.now() - day),
      })
    } finally {
      await later.close()
    }
    expect(threads(await run(["mail", "review", "--new"], env))).toEqual(["asked"])
  })
})
