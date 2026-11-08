import { expect, it } from "vitest"
import { AGENT, businessStore, OWNER } from "../../test/business.js"

it("lets anyone add a wallet, the owner alone set its opening balance, and counts only booked, confirmed money", async () => {
  const f = await businessStore("wallets")
  const wallet = await f.item(
    AGENT,
    "wallets",
    "add",
    "Main card",
    "RUB",
    "--kind",
    "card",
    "--institution",
    "Bank One",
  )
  expect(wallet).toMatchObject({ kind: "card", currency: "RUB", institution: "Bank One", opening_balance: null })
  const ref = wallet.ref as string

  await expect(
    f.run(AGENT, "wallets", "update", ref, "--opening-balance", "1000.00", "--opening-date", "2026-01-01"),
  ).rejects.toMatchObject({ code: "permission_error" })
  expect(
    await f.item(OWNER, "wallets", "update", ref, "--opening-balance", "1000.00", "--opening-date", "2026-01-01"),
  ).toMatchObject({ opening_balance: "1000.00", opening_date: "2026-01-01" })

  await f.run(OWNER, "transactions", "add", ref, "250.00", "--kind", "out", "--occurred-time", "2026-02-01")
  await f.run(
    OWNER,
    "transactions",
    "add",
    ref,
    "100.00",
    "--kind",
    "in",
    "--occurred-time",
    "2026-02-02",
    "--status",
    "pending",
  )
  await f.run(AGENT, "transactions", "add", ref, "50.00", "--kind", "in", "--occurred-time", "2026-02-03")

  expect(await f.item(OWNER, "wallets", "show", ref)).toMatchObject({
    balance: { amount: "750.00", currency: "RUB" },
    pending: { amount: "150.00" },
  })
  expect(await f.item(OWNER, "wallets", "show", ref, "--until-time", "2026-01-31")).toMatchObject({
    balance: { amount: "1000.00" },
    until: "2026-01-31",
  })
  expect((await f.items(OWNER, "wallets", "list", "kind:card")).map((one) => one.ref)).toEqual([ref])
})
