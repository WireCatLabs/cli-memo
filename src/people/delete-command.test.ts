import { expect, it } from "vitest"
import { AGENT, businessStore, OWNER } from "../../test/business.js"

const envelope = JSON.stringify({
  schema_version: 1,
  source: { provider: "n8n", account: "site", batch_id: "b1" },
  records: [
    {
      key: "person",
      type: "person",
      external_id: "anna@example.org",
      operation: "upsert",
      fields: { name: "Anna Test", email: "anna@example.org" },
    },
  ],
})

it("shows what deleting a person takes and changes nothing, deletes with --yes as the owner or from the app, never an agent", async () => {
  const f = await businessStore("people-delete")
  await f.piped(envelope, "records", "import", "-", "--account", "n8n:site")
  const [record] = await f.items(OWNER, "records", "list", "--account", "n8n:site")
  const anna = record?.entity as string

  await expect(f.item(OWNER, "people", "delete", anna)).rejects.toMatchObject({
    code: "confirmation_required",
    details: { plan: { person: anna, erased: false, identities: expect.arrayContaining(["email:anna@example.org"]) } },
  })
  expect(await f.item(OWNER, "people", "show", anna)).toMatchObject({ ref: anna })

  await expect(f.item(AGENT, "people", "delete", anna, "--yes")).rejects.toMatchObject({ code: "permission_error" })
  await expect(f.item(AGENT, "people", "delete", anna, "--yes", "--as-owner")).rejects.toMatchObject({
    details: { reason: "decision.owner-unconfirmed" },
  })

  expect(await f.item(AGENT, "people", "delete", anna, "--yes", "--from-app")).toMatchObject({
    person: anna,
    erased: true,
  })
  await expect(f.item(OWNER, "people", "show", anna)).rejects.toMatchObject({ code: "not_found" })
})
