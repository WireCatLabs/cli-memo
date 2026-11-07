import type { AgentInput } from "@wirecat/cli-core/cli"
import { expect, it } from "vitest"
import { mailTriageInput } from "./mail-triage-input.js"

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
