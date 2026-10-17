import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { sampleMeeting } from "@wirecat/cli-core/meetings/testing"
import { readMeetingEvidence } from "@wirecat/cli-core/services"
import { openStore } from "@wirecat/cli-core/store"
import { expect, it } from "vitest"
import { envelopeOf } from "../../test/answer.js"
import { createProgram } from "../program.js"

const fixture = async () => {
  const dir = mkdtempSync(join(tmpdir(), "memo-findings-"))
  const env = { ...process.env, AI_AGENT: "", CLAUDECODE: "", MESSAGING_STORE: join(dir, "store.db") }
  const account = { provider: "example", account: "synthetic" }
  const store = await openStore({ env })
  const accountId = await store.accounts.saveAccount(account, { name: "Synthetic" })
  const sample = sampleMeeting()
  sample.meeting.accountId = accountId
  const saved = await store.meetings.saveMeeting(sample)
  const project = await store.knowledge.addProject({ name: "Harbour Observatory", key: "HOB" })
  await store.knowledge.linkMeetingProject(account, String(saved.meeting.id), project.id, { by: "owner" })
  const packet = await readMeetingEvidence(store.meetings, accountId, `meeting:${accountId}/${saved.meeting.id}`)
  const cue = packet.items[0]
  if (!cue) throw new Error("Missing synthetic cue")
  const input = {
    schema_version: 1,
    key: "batch-1",
    extractor: "synthetic",
    findings: [
      {
        id: "decision",
        kind: "fact",
        type: "decision",
        statement: "Launch in November",
        project: project.ref,
        evidence: [{ reference: cue.reference, fingerprint: cue.fingerprint }],
      },
      {
        id: "followup",
        kind: "task",
        type: "chore",
        title: "Prepare draft",
        reason: "Review next call",
        commitment: "inferred",
        project: project.ref,
        evidence: [{ reference: cue.reference, fingerprint: cue.fingerprint }],
      },
    ],
  }
  await store.close()
  const path = join(dir, "findings.json")
  writeFileSync(path, JSON.stringify(input))
  const flags = ["--provider", account.provider, "--account", account.account]
  const run = async (args: string[], agent = false) => {
    const streams = captureStreams()
    await createProgram({ streams, env: { ...env, AI_AGENT: agent ? "codex_synthetic" : "" } })
      .exitOverride()
      .parseAsync([...args, ...(args.some((x) => x.startsWith("--json")) ? [] : ["--json"])], { from: "user" })
    return envelopeOf(streams.stdout.join(""))
  }
  return { env, path, input, flags, run }
}
it("stages cited findings, keeps nested selection and lets only the owner confirm selected records", async () => {
  const f = await fixture()
  const staged = (await f.run(["meetings", "actions", "add", f.path, ...f.flags], true)).item
  expect(staged).toMatchObject({ status: "proposed", author: { name: "codex" }, receipt: null })
  expect((await f.run(["meetings", "actions", "add", f.path, ...f.flags], true)).item.id).toBe(staged.id)
  const selected = await f.run([
    "meetings",
    "actions",
    "show",
    staged.id,
    ...f.flags,
    "--json=id,input.findings.evidence",
  ])
  expect(selected.item).toEqual({
    id: staged.id,
    input: { findings: f.input.findings.map((item) => ({ evidence: item.evidence })) },
  })
  expect(selected.meta).toBeDefined()
  const args = [
    "meetings",
    "actions",
    "confirm",
    staged.id,
    ...f.flags,
    "--fingerprint",
    staged.fingerprint,
    "decision",
  ]
  await expect(f.run(args, true)).rejects.toThrow("belong to the owner")
  const confirmed = (await f.run(args)).item
  expect(confirmed.receipt.items.map((item: { status: string }) => item.status)).toEqual(["accepted", "rejected"])
  expect((await f.run(args)).item.receipt).toEqual(confirmed.receipt)
  await expect(f.run(["actions", "confirm", staged.id])).rejects.toThrow("dedicated")
})
it("paginates with scope intact and rejects stale owner decisions", async () => {
  const f = await fixture()
  const first = (await f.run(["meetings", "actions", "add", f.path, ...f.flags], true)).item
  writeFileSync(f.path, JSON.stringify({ ...f.input, key: "batch-2" }))
  await f.run(["meetings", "actions", "add", f.path, ...f.flags], true)
  const page = await f.run(["meetings", "actions", "list", ...f.flags, "--limit", "1"])
  expect(page.page).toMatchObject({ has_more: true, next_page: 2 })
  const next = await f.run(["meetings", "actions", "list", ...f.flags, "--limit", "1", "--page", "2"])
  expect(next.items).toHaveLength(1)
  await expect(
    f.run(["meetings", "actions", "reject", first.id, ...f.flags, "--fingerprint", "outdated"]),
  ).rejects.toThrow("changed since")
  expect(
    (
      await f.run(["meetings", "actions", "reject", first.id, ...f.flags, "--fingerprint", first.fingerprint])
    ).item.receipt.items.every((item: { status: string }) => item.status === "rejected"),
  ).toBe(true)
})
