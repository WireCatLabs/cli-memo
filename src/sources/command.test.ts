import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Readable } from "node:stream"
import { captureStreams } from "@wirecat/cli-base"
import type { Message } from "@wirecat/cli-core"
import { environmentOf, provide } from "@wirecat/cli-core/cli"
import type { FetchPageOptions, PageTransport } from "@wirecat/cli-core/documents"
import { sharedModelsDirectory } from "@wirecat/cli-core/speech"
import { openStore } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { beforeAll, expect, it } from "vitest"
import { answerOf } from "../../test/answer.js"
import { updateConfig } from "../config.js"
import { createProgram } from "../program.js"
import { copiesDir } from "./copy.js"

const root = mkdtempSync(join(tmpdir(), "memo-sources-"))
const env = {
  ...process.env,
  MESSAGING_STORE: join(root, "m.db"),
  MEMO_CONFIG_DIR: join(root, "config"),
  MEMO_STATE_DIR: join(root, "state"),
}
const agentEnv = { ...env, AI_AGENT: "claude-code" }
let person: string
let organization: string

const quiet = (command: Command) => {
  command.exitOverride()
  command.configureOutput({ writeErr: () => {} })
  for (const child of command.commands) quiet(child)
}

const run = async (
  args: string[],
  { stdin, fetchPage, as = env }: { stdin?: string; fetchPage?: FetchPageOptions; as?: NodeJS.ProcessEnv } = {},
) => {
  const streams = captureStreams()
  const program = createProgram({ streams, env: as, ...(fetchPage ? { fetchPage } : {}) })
  if (stdin !== undefined) provide(program, { ...environmentOf(program), stdin: Readable.from([stdin]) })
  quiet(program)
  await program.parseAsync([...args, "--json"], { from: "user" })
  return answerOf(streams.stdout.join(""))
}

const add = (args: string[], options?: Parameters<typeof run>[1]) => run(["sources", "add", ...args], options)
const preview = (args: string[], options?: Parameters<typeof run>[1]) => run(["sources", "preview", ...args], options)

const file = (name: string, content: string | Uint8Array) => {
  const path = join(root, name)
  writeFileSync(path, content)
  return path
}

const page = (status: number, headers: Record<string, string>, body = ""): PageTransport => {
  const transport: PageTransport & { calls: string[] } = Object.assign(
    async ({ url }: { url: URL }) => {
      transport.calls.push(url.href)
      return {
        status,
        header: (name: string) => headers[name.toLowerCase()] ?? null,
        body: (async function* () {
          yield new TextEncoder().encode(body)
        })(),
        cancel: () => {},
      }
    },
    { calls: [] as string[] },
  )
  return transport
}

const web = (transport: PageTransport): FetchPageOptions => ({
  lookup: async () => [{ address: "151.101.1.1", family: 4 }],
  transport,
})

const message = (id: string, senderId: string, senderName: string): Message => ({
  id,
  chatId: `chat-${senderId}`,
  senderId,
  senderName,
  timestamp: "2026-10-20T08:00:00Z",
  editedAt: null,
  text: "synthetic",
  outgoing: false,
  attachments: [],
  replyTo: null,
  forwardedFrom: null,
  reactions: null,
})

beforeAll(async () => {
  const store = await openStore({ env })
  await store.messages.saveMessages(
    { provider: "telegram", account: "1" },
    "chat-101",
    [message("1", "101", "Lena Ortiz")],
    { via: "test" },
  )
  await store.messages.saveMessages(
    { provider: "max", account: "2" },
    "chat-201",
    [message("2", "201", "Lena Ortiz")],
    {
      via: "test",
    },
  )
  const linked = await store.people.linkIdentities(
    { provider: "telegram", id: "101" },
    { provider: "max", id: "201" },
    { method: "manual", by: "test" },
  )
  person = `person:${linked.uid}`
  organization = (await store.knowledge.addOrganization({ kind: "company", name: "Northwind Bench" })).ref
  await store.close()
})

it("keeps pasted text from stdin as a searchable source, and a repeat is the same source", async () => {
  const text = "Lena Ortiz agreed the quinoaplan budget with Northwind Bench.\nSecond line."
  const first = await add(["-", "--subject", organization], { stdin: text })
  expect(first).toMatchObject({
    created: true,
    duplicate_of: null,
    title: "Lena Ortiz agreed the quinoaplan budget with Northwind Bench.",
    kind: "text",
    read: "extracted",
    url: null,
    kept: "text",
    truncated: false,
    searchable: { words: true, meaning: false },
    subjects: [organization],
  })
  expect(first.ref).toMatch(/^document:\d+$/)
  const again = await add(["-", "--subject", person], { stdin: `  ${text.replace("\n", "   \n")}` })
  expect(again).toMatchObject({ ref: first.ref, created: false, kept: "text" })
  expect(again.subjects.sort()).toEqual([organization, person].sort())
  const found = await run(["search", "notes", "quinoaplan"])
  expect(found.items.map(({ ref }: { ref: string }) => ref)).toContain(first.ref)
})

it("reads a file through cli-core's readers and keeps only its text by default", async () => {
  const path = file("runner-notes.md", "# Runner notes\n\nThe zebrafold route opens in May.\n")
  const added = await add([path, "--title", "Runner notes"])
  expect(added).toMatchObject({
    created: true,
    title: "Runner notes",
    kind: "file",
    mime: "text/markdown",
    read: "extracted",
    kept: "text",
    bytes: 50,
  })
  expect(added.extractor).toEqual(expect.any(String))
  expect(existsSync(copiesDir(env))).toBe(false)
  const shown = await run(["sources", "show", added.ref, "--bytes", "20"])
  expect(shown).toMatchObject({ ref: added.ref, added: true, kept: "text", text_truncated: true })
  expect(Buffer.byteLength(shown.text)).toBeLessThanOrEqual(20)
})

it("keeps a copy with --keep-copy only when the file is new, and answers a folder document as duplicate_of", async () => {
  const path = file("whiteboard.txt", "Whiteboard: the oxbowplan is due in June.")
  const kept = await add([path, "--keep-copy"])
  expect(kept).toMatchObject({ created: true, kept: "copy" })
  const copies = () => readdirSync(copiesDir(env))
  expect(copies()).toHaveLength(1)
  const again = await add([path, "--keep-copy"])
  expect(again).toMatchObject({ ref: kept.ref, created: false, kept: "copy" })
  expect(copies()).toHaveLength(1)
  expect(await run(["sources", "show", kept.ref])).toMatchObject({
    added: true,
    kind: "file",
    file_name: "whiteboard.txt",
    mime: "text/plain",
    kept: "copy",
  })

  const store = await openStore({ env })
  const folder = await store.notes.addFolder({ name: "Synthetic folder" })
  const text = "Folder plan: the larkspur review is on Friday."
  const { createHash } = await import("node:crypto")
  const { note } = await store.notes.saveFileNote({
    folderId: folder.id,
    path: "plan.txt",
    title: "Plan",
    text,
    contentHash: createHash("sha256").update(text).digest("hex"),
  })
  await store.close()
  const duplicate = await add([file("plan.txt", text), "--keep-copy", "--subject", organization])
  expect(duplicate).toMatchObject({ ref: note.ref, created: false, duplicate_of: note.ref, kept: null })
  expect(duplicate.subjects).toEqual([organization])
  expect(copies()).toHaveLength(1)
})

it("keeps a page by the address as given, never where it redirected to", async () => {
  const transport = page(
    200,
    { "content-type": "text/plain; charset=utf-8" },
    "Public page about the heronmap launch with Lena Ortiz.",
  )
  const added = await add(["https://example.org/notes?ref=1"], { fetchPage: web(transport) })
  expect(added).toMatchObject({
    created: true,
    kind: "page",
    url: "https://example.org/notes?ref=1",
    mime: "text/plain",
    read: "extracted",
    kept: "text",
    title: "example.org",
  })
  await expect(add(["https://example.org/x", "--keep-copy"], { fetchPage: web(transport) })).rejects.toMatchObject({
    code: "validation_error",
  })
})

it("keeps the address given when the page redirects, never the one it ended at", async () => {
  const calls: string[] = []
  const transport: PageTransport = async ({ url }) => {
    calls.push(url.href)
    const moved = calls.length === 1
    return {
      status: moved ? 301 : 200,
      header: (name) =>
        ({ location: moved ? "/moved?token=secret-value" : null, "content-type": "text/plain" })[name.toLowerCase()] ??
        null,
      body: (async function* () {
        yield new TextEncoder().encode("The gullwing timetable, moved here.")
      })(),
      cancel: () => {},
    }
  }
  const added = await add(["https://example.org/timetable"], { fetchPage: web(transport) })
  expect(calls).toEqual(["https://example.org/timetable", "https://example.org/moved?token=secret-value"])
  expect(added.url).toBe("https://example.org/timetable")
  const shown = await run(["sources", "show", added.ref])
  expect(shown).toMatchObject({ kind: "page", url: "https://example.org/timetable", mime: "text/plain", kept: "text" })
  expect(JSON.stringify(shown)).not.toContain("secret-value")
})

it("answers what the store keeps when the same file is added again with a larger --max-chars", async () => {
  const path = file("long.txt", "The ashgrove plan runs over many words.")
  const first = await add([path, "--max-chars", "10"])
  expect(first).toMatchObject({ chars: 10, truncated: true })
  expect(await add([path])).toMatchObject({ ref: first.ref, created: false, chars: 10, truncated: null })
})

it("lists the people and organizations named in a source", async () => {
  const { ref } = await add(["-"], { stdin: "Met Lena Ortiz at Northwind Bench about the fennelbay pilot." })
  const named = await run(["sources", "mentions", ref])
  expect(named.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ ref: person, type: "person", name: "Lena Ortiz", found_as: ["Lena Ortiz"] }),
      expect.objectContaining({ ref: organization, type: "organization", name: "Northwind Bench" }),
    ]),
  )
})

it("says a source is searchable by meaning only when the model is here and notes are embedded", async () => {
  const model = join(sharedModelsDirectory("text", env), "e5-small")
  mkdirSync(model, { recursive: true })
  writeFileSync(join(model, "model.onnx"), "synthetic")
  expect((await add(["-"], { stdin: "The pebblerun plan." })).searchable).toEqual({ words: true, meaning: true })
  const embed = (on: boolean) =>
    updateConfig((config) => ({ ...config, notes: { folders: [], ...config.notes, embed: on } }), env)
  embed(false)
  expect((await add(["-"], { stdin: "The cobbleway plan." })).searchable).toEqual({ words: true, meaning: false })
  embed(true)
})

it("records an agent's subjects as unconfirmed", async () => {
  const { ref } = await add(["-", "--subject", organization], {
    stdin: "An agent saved the bramblecove notes.",
    as: agentEnv,
  })
  expect((await run(["sources", "show", ref])).subjects).toEqual([{ ref: organization, confirmed: false }])
  const owned = await add(["-", "--subject", organization], { stdin: "The owner saved the thistlecap notes." })
  expect((await run(["sources", "show", owned.ref])).subjects).toEqual([{ ref: organization, confirmed: true }])
})

it("keeps only --max-chars characters and says so", async () => {
  const added = await add(["-", "--max-chars", "12"], { stdin: "The silverbrook plan has many words in it." })
  expect(added).toMatchObject({ chars: 12, truncated: true })
  expect((await run(["sources", "show", added.ref])).text).toBe("The silverbr")
})

it("takes the app's word that the owner added it, even in an agent's environment", async () => {
  const { ref } = await add(["-", "--subject", organization, "--from-app"], {
    stdin: "Added in the app: the cinderfell notes.",
    as: agentEnv,
  })
  expect((await run(["sources", "show", ref])).subjects).toEqual([{ ref: organization, confirmed: true }])
  const proposed = await add(["-", "--subject", organization, "--reason", "the owner pasted it in chat"], {
    stdin: "Pasted in chat: the duskmere notes.",
    as: agentEnv,
  })
  expect((await run(["sources", "show", proposed.ref])).subjects).toEqual([{ ref: organization, confirmed: false }])
})

it("keeps a WebVTT transcript as who said what, one line per turn", async () => {
  const vtt = [
    "\uFEFFWEBVTT - exported call",
    "",
    "NOTE written by the meeting app",
    "",
    "1f2e-cue",
    "00:00:01.000 --> 00:00:04.000 align:start position:10%",
    "<v Kai Sample>Agenda: the</v>",
    "",
    "00:00:04.000 --> 00:00:06.500",
    "<v Kai Sample>harbourline budget.</v>",
    "",
    "00:00:07.000 --> 00:00:09.000",
    "<v.loud Mira Test>Agreed, <i>ship</i> it.</v>",
    "",
    "01:00:09.000 --> 01:00:11.000",
    "Kai Sample: Q&amp;A &lt;v Nobody&gt; at 5&#160;pm &#x2014; done",
    "",
  ].join("\r\n")
  const added = await add([file("Weekly call.vtt", vtt)])
  expect(added).toMatchObject({ title: "Weekly call", mime: "text/vtt" })
  expect((await run(["sources", "show", added.ref])).text).toBe(
    "Kai Sample: Agenda: the harbourline budget.\nMira Test: Agreed, ship it.\nKai Sample: Q&A <v Nobody> at 5\u00a0pm \u2014 done",
  )
})

it("keeps a SubRip transcript, with the speaker each cue names", async () => {
  const srt = [
    "1",
    "00:00:01,000 --> 00:00:03,000",
    "Kai Sample: The thornfield draft",
    "is ready.",
    "",
    "2",
    "00:00:03,500 --> 00:00:05,000",
    "Kai Sample: Send it today.",
    "",
    "3",
    "00:00:05,000 --> 00:00:07,000",
    "No one named here.",
    "",
  ].join("\n")
  const added = await add([file("standup.srt", srt)])
  expect(added).toMatchObject({ title: "standup", mime: "application/x-subrip" })
  expect((await run(["sources", "show", added.ref])).text).toBe(
    "Kai Sample: The thornfield draft is ready. Send it today.\nNo one named here.",
  )
})

it.each([
  ["source.unsupported", () => [file("archive.bin", new Uint8Array([0, 159, 146, 150, 0, 1, 2, 3]))], undefined],
  ["source.no-text", () => [file("empty.txt", "   \n")], undefined],
  ["source.no-text", () => [file("empty.vtt", "WEBVTT\n\nNOTE nothing was said\n")], undefined],
  ["source.no-text", () => ["-"], { stdin: "  \n " }],
  ["source.url-refused", () => ["http://127.0.0.1/admin"], undefined],
  ["source.url-refused", () => ["file:///etc/hostname"], undefined],
  ["source.url-status", () => ["https://example.org/gone"], { fetchPage: web(page(404, {})) }],
  [
    "source.url-redirects",
    () => ["https://example.org/loop"],
    { fetchPage: web(page(302, { location: "https://example.org/loop" })) },
  ],
  [
    "source.url-unreachable",
    () => ["https://nowhere.example.org/"],
    {
      fetchPage: {
        lookup: async () => {
          throw new Error("ENOTFOUND")
        },
        transport: page(200, {}),
      },
    },
  ],
  [
    "source.needs-sign-in",
    () => ["https://docs.google.com/document/d/abc/edit"],
    { fetchPage: web(page(403, { "content-type": "text/html" })) },
  ],
  [
    "source.too-large",
    () => ["https://example.org/big"],
    { fetchPage: web(page(200, { "content-length": "999999999" })) },
  ],
] as const)("refuses with %s and a next step", async (reason, args, options) => {
  const failure = add([...args()], options).catch((error: unknown) => error)
  await expect(failure).resolves.toMatchObject({ details: { reason } })
  expect(String(((await failure) as Error).message)).toMatch(/ — /)
})

it("says where to go for a private Google document", async () => {
  const failure = add(["https://docs.google.com/document/d/abc/edit"], {
    fetchPage: web(page(401, {})),
  }).catch((error: Error) => error)
  expect((await failure).message).toMatch(/drive documents add <url> --profiles <names\|all>/)
})

it("removes an added source and its copy, naming the facts that cite it", async () => {
  const path = file("contract.txt", "Contract draft: the wrenfield clause.")
  const { ref } = await add([path, "--keep-copy"])
  const before = readdirSync(copiesDir(env)).length
  const fact = await run(["facts", "add", "The wrenfield clause was drafted", "--kind", "decision", "--evidence", ref])
  await expect(run(["sources", "remove", ref], { as: agentEnv })).rejects.toMatchObject({ code: "permission_error" })
  const removed = await run(["sources", "remove", ref])
  expect(removed).toMatchObject({ ref, removed: true, copy_deleted: true, facts: [fact.ref], memories: [] })
  expect(readdirSync(copiesDir(env))).toHaveLength(before - 1)
  await expect(run(["sources", "remove", ref])).rejects.toMatchObject({ code: "not_found" })
})

it("never reads a path or a link for an agent over MCP", async () => {
  const transport = page(200, { "content-type": "text/plain" }, "never fetched")
  const mcp = { ...env, AI_AGENT: "memo-mcp" }
  await expect(add(["https://example.org/x"], { fetchPage: web(transport), as: mcp })).rejects.toMatchObject({
    code: "permission_error",
  })
  await expect(add([file("local.txt", "local text")], { as: mcp })).rejects.toMatchObject({ code: "permission_error" })
  expect((transport as PageTransport & { calls: string[] }).calls).toEqual([])
})

it("previews a page as sources add would read it, and keeps nothing", async () => {
  const html = [
    "<html><head><title>Kestrel route plan</title>",
    '<meta name="description" content="Where the kestrel survey goes in spring.">',
    "</head><body><p>The survey starts at the north ridge on 3 April.</p></body></html>",
  ].join("")
  const transport = page(200, { "content-type": "text/html; charset=utf-8" }, html)
  const seen = await preview(["https://example.org/kestrel?ref=2"], { fetchPage: web(transport) })
  expect(seen).toMatchObject({
    url: "https://example.org/kestrel?ref=2",
    title: "Kestrel route plan",
    description: "Where the kestrel survey goes in spring.",
    site: "example.org",
    kind: "page",
    mime: "text/html",
    read: "extracted",
    truncated: false,
  })
  expect(seen.excerpt).toMatch(/north ridge on 3 April/)
  expect(seen.chars).toBeGreaterThan(0)

  expect(await add(["https://example.org/kestrel?ref=2"], { fetchPage: web(transport) })).toMatchObject({
    created: true,
  })
})

it("refuses in preview what sources add refuses, and takes only a web address", async () => {
  const signIn = preview(["https://docs.google.com/document/d/abc/edit"], {
    fetchPage: web(page(403, { "content-type": "text/html" })),
  }).catch((error: unknown) => error)
  await expect(signIn).resolves.toMatchObject({ details: { reason: "source.needs-sign-in" } })
  await expect(preview(["http://127.0.0.1/admin"])).rejects.toMatchObject({ details: { reason: "source.url-refused" } })
  await expect(preview([file("plain.txt", "local")])).rejects.toMatchObject({ details: { reason: "input.invalid" } })
  const strict = createProgram({
    streams: captureStreams(),
    env,
    fetchPage: web(page(200, { "content-type": "text/plain" }, "x")),
  })
  quiet(strict)
  await expect(
    strict.parseAsync(["sources", "preview", "https://example.org/kestrel", "--json=titel"], { from: "user" }),
  ).rejects.toMatchObject({ details: { reason: "output.unknown-field" } })
  const transport = page(200, { "content-type": "text/plain" }, "never fetched")
  await expect(
    preview(["https://example.org/x"], { fetchPage: web(transport), as: { ...env, AI_AGENT: "memo-mcp" } }),
  ).rejects.toMatchObject({ code: "permission_error" })
  expect((transport as PageTransport & { calls: string[] }).calls).toEqual([])
})
