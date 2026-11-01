import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ruleInput } from "@wirecat/cli-core/mail"
import { openStore } from "@wirecat/cli-core/store"
import { expect, it } from "vitest"
import { rulesOf } from "./rule-store.js"

it("says which stored rules this memo leaves out, and why, instead of dropping them silently", async () => {
  const store = await openStore({ path: join(mkdtempSync(join(tmpdir(), "memo-rules-")), "store.db") })
  try {
    const id = await store.accounts.saveAccount({ provider: "email", account: "owner@example.test" }, { name: null })
    const rule = { match: { from: "news@example.test" }, action: "skip" as const, decided_at: "2026-10-01" }
    await store.mail.rules.upsert(id, ruleInput(rule), 1)
    await store.mail.rules.upsert(id, { ...ruleInput(rule), conditions: { from: "a@x.test", future: true } }, 1)
    const said: string[] = []

    const rules = await rulesOf(store, { address: "owner@example.test" }, process.env, (line) => said.push(line))

    expect(rules.map(({ match }) => match)).toEqual([{ from: "news@example.test" }])
    expect(said.join("")).toContain("1 stored mail rules of owner@example.test are left out")
    expect(said.join("")).toContain("condition future")
  } finally {
    await store.close()
  }
})
