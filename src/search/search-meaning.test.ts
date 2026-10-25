import { mkdirSync, mkdtempSync, symlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { embeddingsService, storedDeps } from "@wirecat/cli-core/services"
import { type MessageStore, openStore } from "@wirecat/cli-core/store"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { allAnswer } from "./answers.js"
import { searchEverywhere } from "./search.js"

const tiny = {
  id: "e5-small",
  title: "the tiny fixture under the default model's name",
  languages: "test",
  licence: "none",
  dims: 4,
  maxTokens: 64,
  chunksPerSecond: 1,
  pooling: "mean",
  prefix: { query: "", passage: "" },
  onnx: "onnx/model.onnx",
  files: [{ name: "onnx/model.onnx", url: "", sha256: "", bytes: 318 }],
}

// vitest.config.ts inlines cli-core for this file, so the swap reaches the model table its services read.
vi.mock("../../node_modules/@wirecat/cli-core/dist/embeddings/models.js", async (original) => {
  const real = await original<{ textModel: (id: string) => unknown }>()
  return { ...real, textModel: (id: string) => (id === "e5-small" ? tiny : real.textModel(id)) }
})

const account = { provider: "telegram", account: "1" }
const stores: MessageStore[] = []
let state = ""

const message = (id: string, text: string) => ({
  id,
  chatId: "9",
  senderId: "100",
  senderName: null,
  timestamp: new Date(Date.parse("2026-10-01T00:00:00Z") + Number(id) * 3_600_000).toISOString(),
  editedAt: null,
  text,
  outgoing: false,
  attachments: [],
  replyTo: null,
  forwardedFrom: null,
  reactions: null,
})

const download = () => {
  mkdirSync(join(state, "models", "text"), { recursive: true })
  symlinkSync(join(import.meta.dirname, "../../test/fixtures/tiny-model"), join(state, "models", "text", "e5-small"))
}

const setUp = async () => {
  const store = await openStore({ path: join(mkdtempSync(join(tmpdir(), "memo-meaning-")), "m.db") })
  stores.push(store)
  await store.chats.saveChats(account, [
    { id: "9", title: "Chat", kind: "group", unreadCount: 0, lastMessageAt: null, participantsCount: null },
  ])
  await store.messages.saveMessages(
    account,
    "9",
    [message("1", "cat dog"), message("2", "kitten"), message("3", "fish")],
    {
      via: "history",
    },
  )
  await store.searchIndex.fillSearchIndex({})
  await store.searchIndex.fillStems({})
  return store
}

const embed = (store: MessageStore) =>
  embeddingsService(
    storedDeps({ provider: "telegram", app: { command: "tg" } } as never, store, account, {} as never),
  ).refresh({ threads: 1 })

const everywhere = (store: MessageStore) =>
  searchEverywhere(store, process.env, { text: "cat", limit: 10, only: ["messages"], timezone: "UTC" })

beforeEach(() => {
  state = mkdtempSync(join(tmpdir(), "memo-models-"))
  vi.stubEnv("WIRECAT_STATE_DIR", state)
})
afterEach(async () => {
  vi.unstubAllEnvs()
  for (const store of stores.splice(0)) await store.close()
})

it("search all finds a message in other words once messages have vectors", async () => {
  download()
  const store = await setUp()
  await embed(store)

  const found = await everywhere(store)

  expect(found.messages).toEqual({ by: "words and meaning" })
  const byId = new Map(found.items.map((item) => [item.ref.split("/").at(-1), item.foundBy]))
  expect(byId.get("1")).toEqual(["words", "meaning"])
  expect(byId.get("2")).toEqual(["meaning"])
})

it("search all reads messages by words and names memo's download while the model is missing", async () => {
  const store = await setUp()

  const found = await everywhere(store)

  expect(found.messages?.meaningSkipped).toMatchObject({ step: "models.download", model: "e5-small" })
  expect(found.items.map(({ foundBy }) => foundBy)).toEqual([["words"]])
  expect(allAnswer({ ...found }, 10).missing).toContainEqual({
    field: "found_by",
    why: expect.stringContaining("`memo models download e5-small`"),
  })
})
