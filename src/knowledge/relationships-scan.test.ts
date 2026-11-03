import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { openStore } from "@wirecat/cli-core/store"
import { expect, it } from "vitest"
import { envelopeOf } from "../../test/answer.js"
import { createProgram } from "../program.js"

const setUp = async () => {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    MESSAGING_STORE: join(mkdtempSync(join(tmpdir(), "memo-scan-")), "s.db"),
    MEMO_CONFIG_DIR: mkdtempSync(join(tmpdir(), "memo-scan-config-")),
  }
  delete env.AI_AGENT
  delete env.CLAUDECODE
  const store = await openStore({ env })
  await store.sync.applyDelta(
    { provider: "telegram", account: "1" },
    {
      chats: [
        {
          id: "77",
          kind: "group",
          title: "Synthetic Harbour site",
          unreadCount: 0,
          lastMessageAt: null,
          participantsCount: null,
        },
      ],
      people: [],
      members: new Map(),
    },
  )
  await store.close()
  const run = async (...args: string[]) => {
    const streams = captureStreams()
    try {
      await createProgram({ streams, env })
        .exitOverride()
        .parseAsync([...args, "--json"], { from: "user" })
      return envelopeOf(streams.stdout.join(""))
    } catch (error) {
      return { error }
    }
  }
  await run("projects", "add", "Synthetic Harbour", "--key", "SYH")
  return run
}

it("scan lists without --yes, proposes with it, and wants the accounts named", async () => {
  const run = await setUp()

  const unnamed = await run("relationships", "scan", "SYH")
  expect(String(unnamed.error)).toContain("telegram:1")

  const context = await run("projects", "context", "SYH")
  expect(context.next).toEqual([
    expect.objectContaining({ command: "relationships scan", args: { project: "SYH", source: "all" } }),
  ])

  const preview = await run("relationships", "scan", "SYH", "--source", "all")
  expect(preview.item).toMatchObject({
    written: false,
    scans: [{ proposals: [{ from: "chat:telegram/1/77", state: "dry-run", id: null }] }],
  })
  expect(preview.meta.accounts).toEqual(["telegram:1"])
  expect((await run("review", "kind:relationship")).items).toEqual([])

  const written = await run("relationships", "scan", "SYH", "--source", "telegram:1", "--yes")
  expect(written.item.scans[0].proposals[0]).toMatchObject({ from: "chat:telegram/1/77", state: "new" })
  const review = await run("review", "kind:relationship")
  expect(review.items.map((one: { id: string }) => one.id)).toEqual([written.item.scans[0].proposals[0].id])
})
