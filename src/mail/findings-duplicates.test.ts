import type { MailFinding } from "@wirecat/cli-core/mail"
import type { MessageStore } from "@wirecat/cli-core/store"
import { expect, it } from "vitest"
import { withoutDuplicates } from "./findings-duplicates.js"

const stored = {
  orders: { list: async () => [] },
  finance: {
    invoices: async () => [
      { ref: "invoice:1", review: "confirmed", number: "A-7", counterparty: { ref: "organization:2", name: "Acme" } },
      { ref: "invoice:2", review: "rejected", number: "B-1", counterparty: { ref: "organization:2", name: "Acme" } },
    ],
    payments: async () => [
      {
        ref: "payment:3",
        review: "proposed",
        direction: "out",
        amount: "120.50",
        currency: "eur",
        date: "2026-11-02",
        payer: { ref: "person:1", name: "Me", owner: true },
        payee: { ref: "organization:2", name: "Acme", owner: false },
      },
    ],
  },
  tasks: { find: async () => [{ ref: "task:REQ-1", externalId: "avito:42", sourceUrl: null }] },
  facts: {
    list: async () => [
      { ref: "fact:4", status: "accepted", statement: "Certificate expires 2027-01-05.", subject: null },
    ],
  },
  mailFindings: { list: async () => ({ items: [], hasMore: false }) },
} as unknown as MessageStore

const cited = { evidence: [], reason: "r" }
const batch = (findings: unknown[]) => ({
  schemaVersion: 1 as const,
  key: "mail-triage:9",
  extractor: "x",
  findings: findings as MailFinding[],
})

it("names the stored or earlier record of each kind and keeps what is new", async () => {
  const { input, duplicates } = await withoutDuplicates(
    stored,
    batch([
      { id: "i1", kind: "invoice", counterpartyName: "ACME", number: "a 7", ...cited },
      { id: "i2", kind: "invoice", counterpartyName: "Acme", number: "B-1", ...cited },
      {
        id: "p1",
        kind: "payment",
        direction: "out",
        payeeName: "acme",
        amount: "120.5",
        currency: "EUR",
        date: "2026-11-02",
        ...cited,
      },
      {
        id: "p2",
        kind: "payment",
        direction: "out",
        payeeName: "acme",
        amount: "120.5",
        currency: "EUR",
        date: "2026-11-03",
        ...cited,
      },
      { id: "t1", kind: "task", externalId: "AVITO:42", ...cited },
      { id: "f1", kind: "fact", statement: "certificate expires 2027 01 05", ...cited },
      { id: "f2", kind: "fact", statement: "Another", ...cited },
      { id: "f3", kind: "fact", statement: "another!", ...cited },
    ]),
  )
  expect(duplicates.map(({ finding, duplicateOf }) => [finding, duplicateOf])).toEqual([
    ["i1", "invoice:1"],
    ["p1", "payment:3"],
    ["t1", "task:REQ-1"],
    ["f1", "fact:4"],
    ["f3", "finding:f2"],
  ])
  expect(input.findings.map((one) => one.id)).toEqual(["i2", "p2", "f2"])
})

it("ignores a malformed finding instead of failing the check", async () => {
  const { input, duplicates } = await withoutDuplicates(
    stored,
    batch([{ id: "x", kind: "fact" }, null, { kind: "order" }]),
  )
  expect(duplicates).toEqual([])
  expect(input.findings).toHaveLength(3)
})
