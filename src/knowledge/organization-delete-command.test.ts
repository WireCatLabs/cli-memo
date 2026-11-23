import { expect, it } from "vitest"
import { AGENT, businessStore, OWNER } from "../../test/business.js"

const envelope = JSON.stringify({
  schema_version: 1,
  source: { provider: "n8n", account: "deals", batch_id: "b1" },
  records: [
    {
      key: "org",
      type: "organization",
      external_id: "acme-test",
      operation: "upsert",
      fields: { name: "Acme Test" },
    },
  ],
})

it("shows what deleting an organization takes and changes nothing, deletes with --yes, never as an agent", async () => {
  const f = await businessStore("organizations-delete")
  await f.piped(envelope, "records", "import", "-", "--account", "n8n:deals")
  const [record] = await f.items(OWNER, "records", "list", "--account", "n8n:deals")
  const acme = record?.entity as string

  await expect(f.item(OWNER, "organizations", "delete", acme)).rejects.toMatchObject({
    code: "confirmation_required",
    details: { plan: { organization: acme, name: "Acme Test", erased: false } },
  })
  expect(await f.item(OWNER, "organizations", "show", acme)).toMatchObject({ name: "Acme Test" })

  await expect(f.item(AGENT, "organizations", "delete", acme, "--yes")).rejects.toMatchObject({
    code: "permission_error",
  })
  await expect(f.item(AGENT, "organizations", "delete", acme, "--yes", "--as-owner")).rejects.toMatchObject({
    details: { reason: "decision.owner-unconfirmed" },
  })
  expect(await f.item(AGENT, "organizations", "delete", acme, "--yes", "--from-app")).toMatchObject({
    organization: acme,
    erased: true,
  })
  await expect(f.item(OWNER, "organizations", "show", acme)).rejects.toMatchObject({ code: "not_found" })
})
