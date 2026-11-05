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
const ref = (thread: string, id: string) => formatLocator({ provider: "email", account: ME, chat: thread, message: id })

const run = async (args: string[], env: NodeJS.ProcessEnv) => {
  const streams = captureStreams()
  await createProgram({ streams, env })
    .exitOverride()
    .parseAsync([...args, "--no-record", "--json"], { from: "user" })
  return answerOf(streams.stdout.join(""))
}

const email = (id: string, thread: string, at: string, text: string) => ({
  uid: id,
  messageId: id,
  threadId: thread,
  receivedAt: at,
  subject: "Synthetic budget",
  from: ["Rin Example", "rin@example.test"] as [string, string],
  to: [[null, ME]] as [string | null, string][],
  text,
})

const imported = async () => {
  const dir = mkdtempSync(join(tmpdir(), "memo-mail-thread-"))
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
        email("9004", "7001", "2026-09-14T08:00:00Z", "Fourth: signed."),
        email("9001", "7001", "2026-09-11T08:00:00Z", "First: the budget draft."),
        email("9003", "7001", "2026-09-13T08:00:00Z", "Third: approved."),
        email("9002", "7001", "2026-09-12T08:00:00Z", "Second: the zebra line item."),
        email("9100", "7100", "2026-09-12T09:00:00Z", "Alone: a lone walrus."),
      ],
      { since: new Date("2026-09-01T00:00:00Z"), now: () => Date.parse("2026-10-04T12:00:00Z") },
    )
  } finally {
    await store.close()
  }
  return env
}

const shape = (answer: { items: { ref: string; anchor?: boolean }[] }) =>
  answer.items.map(({ ref, anchor }) => [ref, anchor === true])

describe("messages show around an email hit", () => {
  it("gives the emails of its thread by date, the hit anchored, as many before and after as asked", async () => {
    const env = await imported()
    const [hit] = (await run(["search", "mail", "zebra"], env)).items
    expect(hit.ref).toBe(ref("7001", "9002"))

    expect(shape(await run(["messages", "show", hit.ref, "--before-n", "5", "--after-n", "5"], env))).toEqual([
      [ref("7001", "9001"), false],
      [ref("7001", "9002"), true],
      [ref("7001", "9003"), false],
      [ref("7001", "9004"), false],
    ])
    expect(shape(await run(["messages", "show", hit.ref, "--before-n", "0", "--after-n", "1"], env))).toEqual([
      [ref("7001", "9002"), true],
      [ref("7001", "9003"), false],
    ])
  })

  it("gives only the hit when its thread holds no other stored email", async () => {
    const env = await imported()
    const [hit] = (await run(["search", "mail", "walrus"], env)).items
    expect(shape(await run(["messages", "show", hit.ref, "--before-n", "5", "--after-n", "5"], env))).toEqual([
      [ref("7100", "9100"), true],
    ])
  })
})
