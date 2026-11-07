import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { openStore } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { beforeAll, describe, expect, it } from "vitest"
import { answerOf } from "../../test/answer.js"
import { createProgram } from "../program.js"

// Each query and the record text that holds it; `null` where the query has an operator meaning, so only "no error".
const CASES: [label: string, query: string, record: string | null][] = [
  ["a time", "meeting at 10:30", "Steering meeting at 10:30 in room four"],
  ["Cyrillic and a time", "созвон в 14:00", "Завтра созвон в 14:00 с подрядчиком"],
  ["a word: that names no field", "Answer as HH:MM", "Answer as HH:MM in the form"],
  ["a:b", "a:b", "the ratio a:b stays"],
  ["a URL", "https://example.com/a", "the link https://example.com/a is up"],
  ["an unbalanced quote", 'say "unfinished', 'they say "unfinished business'],
  ["an unbalanced parenthesis", "(budget draft", "the (budget draft) is late"],
  ["a slash", "and/or", "pick and/or skip"],
  ["an exclamation mark", "wow!", "that was wow! indeed"],
  ["a hash", "#launch", "tagged #launch today"],
  ["an at sign", "user@example.com", "write to user@example.com soon"],
  ["an ampersand", "R&D", "the R&D budget"],
  ["a percent sign", "50%", "a 50% discount"],
  ["a caret", "x^2", "the curve x^2 grows"],
  ["a tilde", "~home", "the ~home folder"],
  ["square brackets", "[draft]", "marked [draft] for now"],
  ["curly brackets", "{draft}", "marked {draft} for now"],
  ["a pipe", "a|b", "the a|b split"],
  ["angle brackets", "<tag>", "the <tag> element"],
  ["a plus inside a word", "C++", "written in C++ mostly"],
  ["apostrophes", "don't O'Brien", "don't tell O'Brien"],
  ["Boolean words in lower case", "black and white", "black and white photos"],
  ["an emoji", "party 🎉", "the party 🎉 starts"],
  ["a backslash", "back\\slash", null],
  ["a question mark", "ready?", null],
  ["a leading minus", "-budget", null],
  ["a leading plus", "+budget", null],
  ["an asterisk", "budg*", null],
  ["a Boolean word alone", "AND", null],
]
const RECORDS = CASES.flatMap(([, , record]) => (record === null ? [] : [record]))

let run: (...args: string[]) => Promise<Record<string, unknown> & { items: Record<string, unknown>[] }>

beforeAll(async () => {
  const root = mkdtempSync(join(tmpdir(), "memo-special-"))
  const env = { ...process.env, MESSAGING_STORE: join(root, "m.db"), MEMO_CONFIG_DIR: join(root, "config") }
  const store = await openStore({ env })
  const messages = RECORDS.map((text, index) => ({
    id: String(index + 1),
    chatId: "7",
    senderId: "9",
    senderName: null,
    timestamp: new Date(Date.UTC(2026, 9, 9, 0, index)).toISOString(),
    editedAt: null,
    text,
    outgoing: false,
    attachments: [],
    replyTo: null,
    forwardedFrom: null,
    reactions: null,
  }))
  await store.messages.saveMessages({ provider: "telegram", account: "1" }, "7", messages, { via: "test" })
  await store.messages.saveMessages({ provider: "email", account: "mailbox" }, "7", messages, { via: "test" })
  for (const text of RECORDS) {
    const note = await store.notes.addNote({ text })
    await store.memories.add({
      kind: "preference",
      body: text,
      scope: "work",
      evidence: [note.ref],
      author: "owner",
      status: "confirmed",
    })
  }
  await store.close()
  run = async (...args: string[]) => {
    const streams = captureStreams()
    const program = createProgram({ streams, env })
    const override = (command: Command) => {
      command.exitOverride()
      command.configureOutput({ writeErr: () => {} })
      for (const child of command.commands) override(child)
    }
    override(program)
    // `--` keeps a query such as -budget from reading as an option.
    await program.parseAsync([...args.slice(0, 2), "--json", "--", ...args.slice(2)], { from: "user" })
    return answerOf(streams.stdout.join(""))
  }
})

const texts = (answer: { items: Record<string, unknown>[] }) =>
  answer.items.map(({ text, excerpt, body }) => String(text ?? excerpt ?? body ?? "")).join("\n")

describe("special characters in free-text search", () => {
  it.each(CASES)("search all reads %s (%s) and no source refuses it", async (_, query, record) => {
    const all = await run("search", "all", query)
    const meta = all.meta as { issues?: { code: string; source: string }[] }
    // Deals are found by title words only, so a query with an operator leaves them out, with the reason.
    expect((meta.issues ?? []).filter(({ source }) => record !== null || source !== "crm")).toEqual([])
    if (record === null) return
    const found = all.items.filter((item) => texts({ items: [item] }).includes(record.slice(0, 12)))
    expect(new Set(found.map(({ kind }) => kind))).toEqual(new Set(["message", "mail", "note"]))
  })

  it.each(CASES.filter(([, , record]) => record !== null))(
    "search messages, mail, notes and memories find %s (%s)",
    async (_, query, record) => {
      const start = (record as string).slice(0, 12)
      for (const kind of ["messages", "mail", "notes", "memories"]) {
        const answer = await run("search", kind, query)
        expect(texts(answer), `search ${kind}`).toContain(start)
      }
    },
  )

  it.each(CASES.filter(([, , record]) => record === null))(
    "search messages, mail, notes and memories take %s (%s)",
    async (_, query) => {
      for (const kind of ["messages", "mail", "notes"]) await run("search", kind, query)
    },
  )

  it("keeps field queries and Boolean operators", async () => {
    expect((await run("search", "messages", "10:30 OR 14:00")).items).toHaveLength(2)
    expect(texts(await run("search", "messages", "draft NOT late"))).not.toContain("budget draft")
    expect(texts(await run("search", "mail", '"room four" AND in:email'))).toContain("Steering meeting")
    await expect(run("search", "messages", "kind:nonsense")).rejects.toMatchObject({ code: "validation_error" })
  })
})
