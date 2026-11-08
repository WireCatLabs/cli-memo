import { expect, it } from "vitest"
import { AGENT, businessStore, OWNER } from "../../test/business.js"

it("keeps an agent's valued contract as a proposal, writes one without a value as it is, and gives the notice day", async () => {
  const f = await businessStore("contracts")
  const terms = ["--start-date", "2026-11-01", "--end-date", "2027-10-31", "--auto-renew", "on", "--notice-days", "30"]
  const valued = await f.item(
    AGENT,
    ...["contracts", "add", "Rental agreement", "--kind", "service", ...terms],
    ...["--amount", "120000.00", "--currency", "RUB", "--reason", "the signed scan"],
  )
  expect(valued).toMatchObject({
    review: "proposed",
    value: "120000.00",
    auto_renew: true,
    notice_deadline: "2027-10-01",
    reason: "the signed scan",
  })
  const plain = await f.item(AGENT, "contracts", "add", "NDA with the studio", "--kind", "nda", "--project", "SYR")
  expect(plain).toMatchObject({ review: "confirmed", project: expect.stringMatching(/^project:/) })

  expect((await f.items(OWNER, "review", "list", "kind:contract")).map((one) => one.id)).toEqual([valued.ref])
  expect((await f.items(OWNER, "contracts", "list", "expires:2027-12-31")).map((one) => one.ref)).toEqual([valued.ref])
  expect((await f.items(OWNER, "contracts", "list", "kind:nda")).map((one) => one.ref)).toEqual([plain.ref])

  await f.run(OWNER, "review", "confirm", valued.ref as string)
  await expect(
    f.run(AGENT, "contracts", "update", valued.ref as string, "--amount", "1.00", "--currency", "RUB"),
  ).rejects.toMatchObject({ code: "permission_error" })
  const ended = await f.item(OWNER, "contracts", "update", valued.ref as string, "--status", "terminated")
  expect(ended).toMatchObject({ status: "terminated", review: "confirmed" })
  expect(await f.item(OWNER, "contracts", "show", valued.ref as string)).toMatchObject({ status: "terminated" })
})
