import type { Link, MessageStore } from "@wirecat/cli-core/store"
import { expect, it, vi } from "vitest"
import { projectFindings } from "./project-findings.js"

it("bounds linked-account previews and exposes omitted accounts, missing accounts and page continuations", async () => {
  const list = vi.fn(async () => ({ items: [], hasMore: true }))
  const store = {
    accounts: {
      storedAccounts: async () =>
        Array.from({ length: 9 }, (_, i) => ({ id: i + 1, provider: "example", account: `synthetic-${i + 1}` })),
    },
    meetingFindings: { list },
  } as unknown as MessageStore
  const links = Array.from({ length: 10 }, (_, i) => ({ from: `meeting:${i + 1}/1`, to: "project:1" })) as Link[]
  const found = await projectFindings(store, "project:1", links)
  expect(list).toHaveBeenCalledTimes(8)
  expect(list).toHaveBeenCalledWith({ provider: "example", account: "synthetic-1" }, { status: "proposed", limit: 5 })
  expect(found.coverage.omitted_accounts).toEqual(["example:synthetic-9"])
  expect(found.coverage.missing_account_ids).toEqual([10])
  expect(found.coverage.accounts[0]).toMatchObject({
    has_more: true,
    next: { args: { source: "example:synthetic-1", limit: 5, page: 2 } },
  })
})
