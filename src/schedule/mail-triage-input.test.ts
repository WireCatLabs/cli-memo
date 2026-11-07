import type { AgentInput } from "@wirecat/cli-core/cli"
import { expect, it } from "vitest"
import { INPUT_BUDGET, mailboxBlock, mailTriageInput } from "./mail-triage-input.js"

const review = (key: string, cursor: string, items: unknown[]) =>
  JSON.stringify({
    items,
    next: [
      { step: "mail-findings.add", args: { key, source: "email:a@x.org" } },
      { step: "mail-messages.acknowledge", args: { holder: "mail-triage", cursor } },
    ],
  })

const schedule: Parameters<AgentInput>[0] = {
  name: "mail-triage",
  kind: "agent",
  argv: [],
  when: { every: 5 },
  environment: {},
  createdAt: "",
}

it("hands the skill and each mailbox's review to the agent, compactly", async () => {
  const asked: string[][] = []
  const run = async (argv: string[]) => {
    asked.push(argv)
    return argv[0] === "skill" ? "SKILL TEXT\n" : review("mail-triage:9", "9.1", [{ ref: "msg:email/1", text: "hi" }])
  }
  const input = await mailTriageInput(async () => ["a@x.org"])({ ...schedule, onNewMail: "mail-triage" }, run)
  expect(input).toContain("SKILL TEXT")
  expect(input).toContain("## email:a@x.org\nkey: mail-triage:9\ncursor: 9.1")
  expect(input).toContain('{"ref":"msg:email/1","text":"hi"}')
  expect(asked[1]?.slice(0, 5)).toEqual(["mail", "review", "--holder", "mail-triage", "--source"])
})

it("says so when a mailbox has no emails", async () => {
  const run = async (argv: string[]) => (argv[0] === "skill" ? "S" : review("", "7.2", []))
  const input = await mailTriageInput(async () => ["a@x.org"])({ ...schedule, onNewMail: "mail-triage" }, run)
  expect(input).toContain("no emails; acknowledge the cursor.")
})

it("gives nothing to a schedule that is not gated on a mail holder", async () => {
  const run = async () => ""
  expect(await mailTriageInput(async () => [])(schedule, run)).toBeUndefined()
})

const email = (id: number, text: string) => ({
  ref: `msg:email/${id}`,
  text,
  email: { subject: `s${id}`, cursor: `${id}.5`, findings_key: `mail-triage:${id}` },
})

it("leaves whole emails out past the budget and gives the cursor of the last one shown", async () => {
  const body = "x".repeat(2_000)
  const emails = Array.from({ length: 60 }, (_, index) => email(index + 1, body))
  const run = async (argv: string[]) => (argv[0] === "skill" ? "S" : review("mail-triage:60", "60.5", emails))
  const input = (await mailTriageInput(async () => ["a@x.org"])({ ...schedule, onNewMail: "mail-triage" }, run)) ?? ""
  expect(input.length).toBeLessThanOrEqual(INPUT_BUDGET)

  const shown = input.split("\n").filter((line) => line.startsWith('{"ref"'))
  const last = shown.length
  expect(last).toBeGreaterThan(10)
  expect(last).toBeLessThan(60)
  expect(shown.at(-1)).toContain(`"ref":"msg:email/${last}"`)
  expect(shown.every((line) => !line.includes("cursor") && !line.includes("findings_key"))).toBe(true)
  expect(input).toContain(`key: mail-triage:${last}\ncursor: ${last}.5\n`)
  expect(input).toContain(`${60 - last} emails did not fit this input`)
  expect(input).not.toContain(`msg:email/${last + 1}"`)
})

it("cuts in store order, so an excerpt listed last but stored first stays in", async () => {
  const body = "x".repeat(30_000)
  const items = [
    email(2, body),
    email(3, body),
    { ...email(1, "excerpt"), email: { ...email(1, "").email, excerpt_only: true } },
  ]
  const block = mailboxBlock("email:a@x.org", { items, next: [] }, 31_000)
  expect(block).toContain("cursor: 2.5")
  expect(block).toContain("msg:email/1")
  expect(block).not.toContain("msg:email/3")
})

it("shortens an email too long for any input rather than leaving it out on every run", async () => {
  const block = mailboxBlock("email:a@x.org", { items: [email(1, "y".repeat(80_000)), email(2, "z")] }, 50_000, true)
  expect(block.length).toBeLessThanOrEqual(50_000)
  expect(block).toContain("cursor: 1.5")
  expect(block).toContain('"text_cut":true')
  expect(block).not.toContain("msg:email/2")
})

it("leaves a mailbox out whole, unacknowledged, when even its first email has no room", async () => {
  const block = mailboxBlock("email:a@x.org", { items: [email(1, "y".repeat(5_000))] }, 50, true)
  expect(block).toContain("do not acknowledge this mailbox")
  expect(block).not.toContain("cursor:")
})

it("shortens every email of a held group that shares one cursor, in any mailbox, so the group fits", async () => {
  const held = [1, 2, 3].map((id) => ({ ...email(id, "h".repeat(20_000)), email: { ...email(9, "").email } }))
  const block = mailboxBlock("email:b@x.org", { items: [...held, email(10, "n")] }, 12_000)
  expect(block.length).toBeLessThanOrEqual(12_000)
  expect(block).toContain("cursor: 9.5")
  expect(block.match(/"text_cut":true/g)).toHaveLength(3)
  expect(block).toContain("memo messages show")
  expect(block).not.toContain("msg:email/10")
})

it("leaves a later mailbox out rather than shorten its emails below a useful length", async () => {
  const block = mailboxBlock("email:b@x.org", { items: [email(1, "y".repeat(5_000))] }, 400)
  expect(block).toContain("do not acknowledge this mailbox")
})

it("never cuts a text inside a surrogate pair", async () => {
  const block = mailboxBlock("email:a@x.org", { items: [email(1, "😀".repeat(30_000))] }, 20_001, true)
  const [line] = block.split("\n").filter((one) => one.startsWith('{"ref"'))
  const text = (JSON.parse(line ?? "{}") as { text: string }).text
  expect(text.length % 2).toBe(0)
  expect(text.endsWith("😀")).toBe(true)
})
