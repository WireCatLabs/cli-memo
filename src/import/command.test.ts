import { mkdirSync, mkdtempSync, symlinkSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { openStore } from "@wirecat/cli-core/store"
import { expect, it, vi } from "vitest"
import { envelopeOf } from "../../test/answer.js"
import { docxOf, pdfOf } from "../../test/office.js"
import { createProgram } from "../program.js"
import type { Hear } from "./audio.js"
import { idOfPath } from "./external-id.js"

// cli-core has no `document` type yet; a custom type is kept with its fingerprint the same way, so what memo sends
// is checked against the store's own created, updated and unchanged.
vi.mock("./files.js", async (actual) => ({
  ...(await actual<typeof import("./files.js")>()),
  DOCUMENT_TYPE: "custom:document",
}))

const ACCOUNT = ["--account", "phone:office-pbx"]

const setUp = () => {
  const dir = mkdtempSync(join(tmpdir(), "memo-import-"))
  const env: NodeJS.ProcessEnv = { ...process.env, MESSAGING_STORE: join(dir, "s.db"), MEMO_CONFIG_DIR: dir }
  const folder = join(dir, "transcripts")
  mkdirSync(join(folder, "2026"), { recursive: true })
  writeFileSync(
    join(folder, "2026", "call-1.md"),
    "---\nkind: call\n---\n# Call with the depot\n\nThe crane is due Friday.\n",
  )
  writeFileSync(join(folder, "notes.txt"), "Gate code changes on Monday.\n")
  const run = async (args: string[], extra: NodeJS.ProcessEnv = {}, hear?: Hear) => {
    const streams = captureStreams()
    await createProgram({ streams, env: { ...env, ...extra }, ...(hear ? { hear } : {}) })
      .exitOverride()
      .parseAsync([...args, "--json"], { from: "user" })
    return envelopeOf(streams.stdout.join("")).item as Record<string, unknown>
  }
  const record = async (externalId: string) => {
    const store = await openStore({ env })
    try {
      return await store.records.get({
        provider: "phone",
        account: "office-pbx",
        type: "custom:document",
        externalId,
      })
    } finally {
      await store.close()
    }
  }
  return { dir, folder, run, record }
}

it("imports a folder once: a second run changes nothing, and an edited file updates its own document", async () => {
  const f = setUp()
  expect(await f.run(["import", f.folder, ...ACCOUNT, "--dry-run"])).toMatchObject({ dry_run: true, created: 2 })
  expect(await f.record(idOfPath("notes.txt"))).toBeUndefined()

  const first = await f.run(["import", f.folder, ...ACCOUNT])
  expect(first).toMatchObject({ created: 2, updated: 0, errors: [], files: 2, skipped: [], by: "owner" })
  const call = await f.record(idOfPath("2026/call-1.md"))
  expect(call?.fields).toMatchObject({
    title: "Call with the depot",
    text: expect.stringContaining("The crane is due Friday."),
    metadata: { path: "2026/call-1.md", format: "markdown", sha256: expect.stringMatching(/^[0-9a-f]{64}$/) },
    url: expect.stringMatching(/^file:\/\//),
  })
  expect((await f.record(idOfPath("notes.txt")))?.fields).toMatchObject({ title: "notes" })

  expect(await f.run(["import", f.folder, ...ACCOUNT])).toMatchObject({ created: 0, updated: 0, unchanged: 2 })

  const notes = join(f.folder, "notes.txt")
  writeFileSync(notes, "Gate code changes on Tuesday.\n")
  utimesSync(notes, new Date("2026-11-10T10:00:00Z"), new Date("2026-11-10T10:00:00Z"))
  expect(await f.run(["import", f.folder, ...ACCOUNT])).toMatchObject({ created: 0, updated: 1, unchanged: 1 })
  expect((await f.record(idOfPath("notes.txt")))?.fields).toMatchObject({
    text: "Gate code changes on Tuesday.",
    updated_at: "2026-11-10T10:00:00.000Z",
  })
})

it("keeps a document whose file is gone, and imports one file given alone", async () => {
  const f = setUp()
  await f.run(["import", f.folder, ...ACCOUNT])
  const alone = join(f.dir, "alone.md")
  writeFileSync(alone, "Just one file.\n")
  expect(await f.run(["import", alone, ...ACCOUNT])).toMatchObject({ created: 1, files: 1, deleted: 0 })
  expect(await f.record(idOfPath("notes.txt"))).toMatchObject({ deletedAt: null })
  expect(await f.record(idOfPath("alone.md"))).toMatchObject({ fields: { title: "alone" } })
})

it("refuses links, including one to the folder above, and files that are not UTF-8 text", async () => {
  const f = setUp()
  const outside = join(f.dir, "secret.txt")
  writeFileSync(outside, "Not for the import.\n")
  symlinkSync(outside, join(f.folder, "link.txt"))
  symlinkSync("..", join(f.folder, "up"))
  writeFileSync(join(f.folder, "cp1251.txt"), Buffer.from([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2]))
  writeFileSync(join(f.folder, "photo.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  const answer = await f.run(["import", f.folder, ...ACCOUNT])
  expect(answer).toMatchObject({ created: 2, files: 2 })
  expect(answer.skipped).toEqual(
    expect.arrayContaining([
      { path: "link.txt", reason: expect.stringContaining("symbolic link") },
      { path: "up", reason: expect.stringContaining("symbolic link") },
      { path: "cp1251.txt", reason: "not UTF-8 text" },
      { path: "photo.png", reason: "no reader for .png" },
    ]),
  )
  expect(await f.record(idOfPath("link.txt"))).toBeUndefined()
  expect(await f.record(idOfPath("up~2Fsecret.txt"))).toBeUndefined()
})

it("never picks an account: without one it lists those that hold imports", async () => {
  const f = setUp()
  await f.run(["import", f.folder, ...ACCOUNT])
  await expect(f.run(["import", f.folder])).rejects.toMatchObject({
    code: "validation_error",
    message: expect.stringContaining("phone:office-pbx"),
    details: expect.objectContaining({ param: "--account", choices: ["phone:office-pbx"] }),
  })
})

it("sends a records file to the records import, and records an agent's run as the agent's", async () => {
  const f = setUp()
  const file = join(f.dir, "calls.jsonl")
  const header = { schema_version: 1, source: { provider: "phone", account: "office-pbx", batch_id: "b1" } }
  const call = {
    key: "c1",
    type: "event",
    external_id: "1700000000.1",
    operation: "upsert",
    fields: { kind: "call", direction: "in", phone: "+34600000001", started_at: "2026-11-10T09:00:00Z", duration: 61 },
  }
  writeFileSync(file, `${JSON.stringify(header)}\n${JSON.stringify(call)}\n`)
  expect(await f.run(["import", file, ...ACCOUNT], { AI_AGENT: "codex" })).toMatchObject({
    created: 1,
    errors: [],
    by: "codex",
  })
})

it("reads PDF and Word files with memo's own readers, and skips a PDF with no text", async () => {
  const f = setUp()
  writeFileSync(join(f.folder, "delivery.pdf"), pdfOf("The crane is due Friday"))
  writeFileSync(join(f.folder, "plan.docx"), docxOf(["Delivery plan", "Two trucks on Monday"]))
  writeFileSync(join(f.folder, "scan.pdf"), pdfOf(""))
  const answer = await f.run(["import", f.folder, ...ACCOUNT])
  expect(answer).toMatchObject({ created: 4, files: 4 })
  expect(answer.skipped).toEqual([{ path: "scan.pdf", reason: expect.stringContaining("no text") }])
  expect((await f.record(idOfPath("delivery.pdf")))?.fields).toMatchObject({
    title: "delivery",
    text: "The crane is due Friday",
    metadata: { format: "pdf", extractor: expect.stringMatching(/^pdf:/) },
  })
  expect((await f.record(idOfPath("plan.docx")))?.fields).toMatchObject({
    text: expect.stringContaining("Two trucks on Monday"),
    metadata: { format: "docx" },
  })
  expect(await f.run(["import", f.folder, ...ACCOUNT])).toMatchObject({ created: 0, unchanged: 4 })
})

it("keeps a WebVTT or SubRip transcript as turns, with its timings and speakers beside the text", async () => {
  const f = setUp()
  writeFileSync(
    join(f.folder, "standup.vtt"),
    "WEBVTT\n\n00:00:01.000 --> 00:00:04.000\n<v Ana Example>The crane is due Friday.\n\n" +
      "00:00:04.500 --> 00:01:02.250\n<v Kai Sample>Then the gate code changes Monday.\n",
  )
  writeFileSync(join(f.folder, "call.srt"), "1\n00:00:00,500 --> 00:00:03,000\nOperator: Depot, good morning.\n")
  expect(await f.run(["import", f.folder, ...ACCOUNT])).toMatchObject({ created: 4, skipped: [] })
  expect((await f.record(idOfPath("standup.vtt")))?.fields).toMatchObject({
    title: "standup",
    text: "Ana Example: The crane is due Friday.\nKai Sample: Then the gate code changes Monday.",
    metadata: {
      format: "vtt",
      transcript: { cues: 2, start_seconds: 1, end_seconds: 62.25, speakers: ["Ana Example", "Kai Sample"] },
    },
  })
  expect((await f.record(idOfPath("call.srt")))?.fields).toMatchObject({
    metadata: { format: "srt", transcript: { cues: 1, start_seconds: 0.5, end_seconds: 3, speakers: ["Operator"] } },
  })
})

it("hears a recording only with --transcribe, once, and again only when its bytes change", async () => {
  const f = setUp()
  const recording = join(f.folder, "2026", "call-7.mp3")
  writeFileSync(recording, Buffer.from("synthetic recording one"))
  const hear = vi.fn<Hear>(async () => ({
    model: "parakeet-v3",
    seconds: 64.04,
    pieces: [
      { start: 0.5, end: 2, text: "Depot, good morning." },
      { start: 61, end: 64, text: " The crane is due Friday. " },
    ],
  }))

  const without = await f.run(["import", f.folder, ...ACCOUNT], {}, hear)
  expect(without.skipped).toEqual([{ path: "2026/call-7.mp3", reason: expect.stringContaining("--transcribe") }])
  expect(await f.run(["import", f.folder, ...ACCOUNT, "--transcribe", "--dry-run"], {}, hear)).toMatchObject({
    skipped: [{ path: "2026/call-7.mp3", reason: expect.stringContaining("dry run") }],
  })
  expect(hear).not.toHaveBeenCalled()

  expect(await f.run(["import", f.folder, ...ACCOUNT, "--transcribe"], {}, hear)).toMatchObject({ created: 1 })
  expect(hear).toHaveBeenCalledTimes(1)
  expect((await f.record(idOfPath("2026/call-7.mp3")))?.fields).toMatchObject({
    title: "call-7",
    text: "[00:00] Depot, good morning.\n[01:01] The crane is due Friday.",
    metadata: {
      format: "audio",
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      audio: { seconds: 64, model: "parakeet-v3", pieces: 2 },
    },
  })

  expect(await f.run(["import", f.folder, ...ACCOUNT, "--transcribe"], {}, hear)).toMatchObject({
    created: 0,
    updated: 0,
    unchanged: 3,
  })
  expect(hear).toHaveBeenCalledTimes(1)

  writeFileSync(recording, Buffer.from("synthetic recording two"))
  expect(await f.run(["import", f.folder, ...ACCOUNT, "--transcribe"], {}, hear)).toMatchObject({ updated: 1 })
  expect(hear).toHaveBeenCalledTimes(2)
})

it("stops before writing anything when the local speech model is not downloaded", async () => {
  const f = setUp()
  writeFileSync(join(f.folder, "call.wav"), Buffer.from("synthetic"))
  await expect(f.run(["import", f.folder, ...ACCOUNT, "--transcribe"])).rejects.toMatchObject({
    code: "not_found",
    details: expect.objectContaining({ reason: "model.not-downloaded" }),
  })
  expect(await f.record(idOfPath("notes.txt"))).toBeUndefined()
})

it("skips one recording that cannot be heard and imports the rest", async () => {
  const f = setUp()
  writeFileSync(join(f.folder, "good.ogg"), Buffer.from("synthetic good"))
  writeFileSync(join(f.folder, "broken.mp3"), Buffer.from("synthetic broken"))
  const hear: Hear = async (bytes) => {
    if (Buffer.from(bytes).toString().includes("broken")) throw new Error("the decoder could not read it")
    return { model: "parakeet-v3", seconds: 3, pieces: [{ start: 0, end: 3, text: "Hello." }] }
  }
  const answer = await f.run(["import", f.folder, ...ACCOUNT, "--transcribe"], {}, hear)
  expect(answer).toMatchObject({ created: 3, files: 3 })
  expect(answer.skipped).toEqual([{ path: "broken.mp3", reason: "could not be heard: the decoder could not read it" }])
})

it("cuts a text longer than a record holds the same way on every run", async () => {
  const f = setUp()
  writeFileSync(join(f.folder, "big.txt"), "Строка журнала поставки номер сорок два.\n".repeat(4000))
  const first = await f.run(["import", f.folder, ...ACCOUNT])
  expect(first).toMatchObject({ created: 3, errors: [], cut: ["big.txt"] })
  const big = await f.record(idOfPath("big.txt"))
  expect(big?.fields).toMatchObject({ metadata: { truncated: true } })
  expect(Buffer.byteLength(JSON.stringify(big?.fields))).toBeLessThanOrEqual(64 * 1024)
  expect(await f.run(["import", f.folder, ...ACCOUNT])).toMatchObject({ unchanged: 3, cut: ["big.txt"] })
})
