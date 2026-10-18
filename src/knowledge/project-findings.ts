import { parseMeetingReference } from "@wirecat/cli-core/meetings"
import type { Link, MessageStore } from "@wirecat/cli-core/store"

export const projectFindings = async (store: MessageStore, project: string, links: Link[]) => {
  const ids = new Set<number>()
  for (const link of links) {
    const ref = link.from.startsWith("meeting:") ? link.from : link.to
    if (ref?.startsWith("meeting:")) ids.add(parseMeetingReference(ref).accountId)
  }
  const accounts = (await store.accounts.storedAccounts()).filter((account) => ids.has(account.id))
  const pages = await Promise.all(
    accounts.slice(0, 8).map(async ({ provider, account }) => {
      const key = { provider, account }
      const page = await store.meetingFindings.list(key, { status: "proposed", limit: 5 })
      return {
        source: `${provider}:${account}`,
        has_more: page.hasMore,
        next: page.hasMore
          ? {
              command: "meetings actions list",
              args: { source: `${provider}:${account}`, query: "status:proposed", limit: 5, page: 2 },
            }
          : null,
        items: page.items.flatMap((batch) => {
          const decided = new Set(batch.previous.map((item) => item.id))
          const findings = batch.input.findings.filter(
            (finding) => finding.project === project && !decided.has(finding.id),
          )
          return findings.length ? [{ id: batch.id, account: key, fingerprint: batch.fingerprint, findings }] : []
        }),
      }
    }),
  )
  return {
    items: pages.flatMap((page) => page.items),
    coverage: {
      scope: "linked_meeting_accounts",
      limit_per_account: 5,
      accounts: pages.map(({ items: _items, ...page }) => page),
      omitted_accounts: accounts.slice(8).map(({ provider, account }) => `${provider}:${account}`),
      missing_account_ids: [...ids].filter((id) => !accounts.some((account) => account.id === id)),
    },
    review_instruction:
      "Read each full batch with meetings actions show before owner review; other projects may share it.",
  }
}
