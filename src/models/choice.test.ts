import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { textModel, textModelsFile, vectorModelKey } from "@wirecat/cli-core/services"
import { type MessageStore, openStore } from "@wirecat/cli-core/store"
import { afterEach, describe, expect, it } from "vitest"
import { EMBED_PER_RUN, embedNoteChunks, embedPerRun } from "../notes/embed.js"
import { createProgram } from "../program.js"

const fixture = join(import.meta.dirname, "../../test/fixtures/tiny-model")
const pinned = (name: string) => {
  const bytes = readFileSync(join(fixture, name))
  return {
    name,
    url: `https://example.test/${name}`,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
  }
}
const tiny = (id: string) => ({
  id,
  title: "a five-word model",
  languages: "test",
  licence: "none",
  dims: 4,
  maxTokens: 64,
  pooling: "mean",
  prefix: { query: "", passage: "" },
  onnx: "onnx/model.onnx",
  files: ["onnx/model.onnx", "tokenizer.json", "tokenizer_config.json"].map(pinned),
})

const stores: MessageStore[] = []
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close()
})

/** A store, and two downloaded custom models of the tiny fixture in the shared settings file beside it. */
const machine = async (use?: string) => {
  const root = mkdtempSync(join(tmpdir(), "memo-model-choice-"))
  const env = { ...process.env, WIRECAT_STATE_DIR: root, MESSAGING_STORE: join(root, "store.db") }
  mkdirSync(join(root, "models", "text"), { recursive: true })
  for (const id of ["tiny-a", "tiny-b"]) symlinkSync(fixture, join(root, "models", "text", id))
  const section = { custom: [tiny("tiny-a"), tiny("tiny-b")], ...(use ? { use } : {}) }
  writeFileSync(textModelsFile(env), JSON.stringify({ text_models: section }))
  const store = await openStore({ env })
  stores.push(store)
  return { env, store }
}

const memo = async (env: NodeJS.ProcessEnv, argv: string[]) => {
  const streams = captureStreams()
  await createProgram({ env, streams }).parseAsync(argv, { from: "user" })
  return JSON.parse(streams.stdout.join(""))
}

describe("the search model memo uses", () => {
  it("is the one `memo models set` chose: sync embeds notes with it and each model keeps its own vectors", async () => {
    const { env, store } = await machine()
    await store.notes.addNote({ text: "fish fish fish" })

    expect((await memo(env, ["models", "set", "tiny-a", "--json"])).item).toMatchObject({
      id: "tiny-a",
      default: true,
      previous: "embeddinggemma",
    })
    expect(await embedNoteChunks(store, { env })).toEqual({ chunks: 1, left: false })
    const switched = await memo(env, ["models", "set", "tiny-b", "--json"])
    expect(switched.item).toMatchObject({ id: "tiny-b", previous: "tiny-a", to_embed: 1 })
    expect(await embedNoteChunks(store, { env })).toEqual({ chunks: 1, left: false })

    const listed = await memo(env, ["models", "list", "kind:text", "--json"])
    expect(listed.items.filter((one: { default: boolean }) => one.default).map(({ id }: { id: string }) => id)).toEqual(
      ["tiny-b"],
    )
    const keys = ["tiny-a", "tiny-b"].map((id) => vectorModelKey(textModel(id, env)))
    expect([...(await store.vectors.vectorCounts(keys)).values()]).toEqual([1, 1])
  })

  it("names the missing model and its exact download, terms included", async () => {
    const { env, store } = await machine("embeddinggemma")
    await store.notes.addNote({ text: "fish" })

    expect(await embedNoteChunks(store, { env })).toMatchObject({
      chunks: 0,
      notEmbedded: "the embeddinggemma model is not downloaded — memo models download embeddinggemma --accept-terms",
    })
  })

  it("embeds fewer chunks a run with a slower model, so a timer run still ends in time", async () => {
    expect(embedPerRun((await machine("e5-small")).env)).toBe(EMBED_PER_RUN)
    expect(embedPerRun((await machine()).env)).toBeLessThan(EMBED_PER_RUN / 5)
  })
})
