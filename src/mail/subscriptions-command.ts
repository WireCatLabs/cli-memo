import type { Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import type { QueryRegistry } from "@wirecat/cli-base/query"
import { LOCAL_READ, queryTerms, termField, withQuery } from "@wirecat/cli-core/cli"
import { MAIL_TYPES, type MailSubscription, type MailType } from "@wirecat/cli-core/store/areas"
import type { Command } from "commander"
import { answers, listAnswer, withStore } from "../answer.js"
import { positive } from "../options.js"
import { groupOf } from "../store/group.js"
import { MAIL_SOURCES, mailboxesOf } from "../store/source-list.js"

const subscriptionRow = (subscription: MailSubscription) => ({
  key: subscription.key,
  list_id: subscription.listId,
  name: subscription.name,
  sender: subscription.sender,
  address: subscription.address,
  emails: subscription.emails,
  newest: {
    email_id: subscription.newest.id,
    message_id: subscription.newest.externalId,
    subject: subscription.newest.subject,
    at: subscription.newest.at === null ? null : new Date(subscription.newest.at).toISOString(),
  },
  can_unsubscribe: subscription.unsubscribe !== null,
  unsubscribe:
    subscription.unsubscribe === null
      ? null
      : {
          https: subscription.unsubscribe.https,
          mailto: subscription.unsubscribe.mailto,
          one_click: subscription.unsubscribe.oneClick,
          email_id: subscription.unsubscribe.emailId,
        },
})

const QUERY = {
  entity: "mail_subscription",
  backend: "native",
  fields: [termField("type", "enum", "type:promotion", { values: [...MAIL_TYPES] })],
} as const satisfies QueryRegistry

export const mailSubscriptionsCommand = (mail: Command, program: Command, streams: Streams, env: NodeJS.ProcessEnv) => {
  const { print } = answers(program, streams, env)
  const subscriptions = mail
    .command("subscriptions")
    .description(
      "what is sent to you and you may leave: broadcast mail grouped by its list (List-Id), else by its sender. Not " +
        "the subscriptions you bill or pay (subscriptions list)",
    )
    .summary("newsletters and lists you get, by list")
  withQuery(
    annotate(subscriptions.command("list"), { effects: LOCAL_READ })
      .summary("broadcast mail by list, newest first")
      .description(
        "broadcast mail grouped by List-Id, else by its sender, newest first: each with its mail count, its newest " +
          "email and where to unsubscribe (an https or mailto target its sender's DKIM signature vouches for, and " +
          "whether one click does it). Nothing is unsubscribed. Open a row's mail with search mail list:<list_id> " +
          "reach:broadcast, or from:<address> reach:broadcast for a row with no list",
      ),
    QUERY,
  )
    .option("--source <accounts>", `the mailboxes to read (default: every one): ${MAIL_SOURCES}`)
    .option("--limit <n>", "most lists on a page, up to 500", positive, 100)
    .option("--page <n>", "which page, from 1", positive, 1)
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (words: string[], options: { source?: string; limit: number; page: number; json?: boolean }) => {
      const type = queryTerms(words, QUERY, "mail subscriptions list").get("type") as MailType | undefined
      const limit = Math.min(options.limit, 500)
      const group = groupOf(env)
      const found = await withStore(env, async (store) => {
        const source = options.source ?? (group === undefined ? undefined : `group:${group.name}`)
        const mailboxes = source === undefined ? undefined : await mailboxesOf(store, env, source)
        const accountIds =
          mailboxes === undefined
            ? undefined
            : await Promise.all(mailboxes.map(async (key) => (await store.accounts.storedAccount(key)).id))
        return store.mail.subscriptions({
          limit,
          offset: (options.page - 1) * limit,
          ...(type === undefined ? {} : { types: [type] }),
          ...(accountIds === undefined ? {} : { accountIds }),
        })
      })
      const items = found.items.map(subscriptionRow)
      print(
        options.json,
        listAnswer("mail subscriptions list", {
          items,
          limit,
          has_more: found.hasMore,
          page: options.page,
          total: { value: found.total, relation: "eq" as const },
          args: words.length ? { query: words.join(" ") } : {},
        }),
        items
          .map(
            (row) =>
              `${row.name ?? row.key}  ${row.emails} emails, newest ${row.newest.at?.slice(0, 10) ?? "?"}` +
              `${row.can_unsubscribe ? (row.unsubscribe?.one_click ? "  one-click unsubscribe" : "  unsubscribe") : ""}` +
              `\n  ${row.key}`,
          )
          .join("\n"),
      )
    })
}
