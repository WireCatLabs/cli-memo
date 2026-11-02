import { CliError, type Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { LOCAL_READ } from "@wirecat/cli-core/cli"
import { MAIL_STATS_BY, type MailStatsBy, mailStats, mailStatsItem } from "@wirecat/cli-core/mail"
import type { AccountKey } from "@wirecat/cli-core/store"
import { Command } from "commander"
import { answers, itemAnswer, withStore } from "../answer.js"
import { APP } from "../app.js"
import { positive } from "../options.js"
import { MAIL_SOURCES, mailboxesOf } from "../store/source-list.js"

/** The account a store search runs as; mail stats read the mailboxes, never a messenger. */
const MEMO: AccountKey = { provider: "notes", account: "internal" }

const byOf = (value: string): MailStatsBy => {
  if (!(MAIL_STATS_BY as readonly string[]).includes(value))
    throw new CliError("validation_error", `--by takes ${MAIL_STATS_BY.join(", ")}`)
  return value as MailStatsBy
}

/** `stats mail show`: imported mail received and sent per day, week or sender, counts only. */
export const mailStatsCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): Command => {
  const { print } = answers(program, streams, env)
  return annotate(new Command("show"), {
    effects: LOCAL_READ,
    output: { entity: "mail_counts" },
    examples: ["memo stats mail show --by week --timezone Europe/Madrid -- date>=90d"],
  })
    .summary("count imported mail received and sent by day, week or sender")
    .description(
      "how much imported mail matches the query, received and sent, per calendar day, week (from Monday) or " +
        "sender; by sender counts received mail only. Reads the store; records no search",
    )
    .argument("[query...]", "the query of memo search mail; none counts every stored email")
    .option("--by <group>", `${MAIL_STATS_BY.join(", ")} (default: day)`, byOf, "day")
    .option("--source <accounts>", `the mailboxes to count (default: every one): ${MAIL_SOURCES}`)
    .option("--timezone <zone>", "the IANA timezone where days and weeks start")
    .option("--limit <n>", "how many rows: the latest days or weeks, or the busiest senders", positive, 30)
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(
      async (
        words: string[],
        options: { by: MailStatsBy; source?: string; timezone?: string; limit: number; json?: boolean },
      ) => {
        const stats = await withStore(env, async (store) => {
          const accounts = options.source === undefined ? undefined : await mailboxesOf(store, env, options.source)
          return mailStats(
            store,
            MEMO,
            {
              by: options.by,
              text: words.join(" "),
              limit: options.limit,
              ...(accounts === undefined ? {} : { accounts }),
              ...(options.timezone === undefined ? {} : { timezone: options.timezone }),
            },
            { app: APP },
          )
        })
        print(
          options.json,
          itemAnswer(mailStatsItem(stats)),
          [
            ...stats.rows.map(
              ({ key, name, received, sent }) =>
                `${name ? `${name} <${key}>` : key}  ${received} received${options.by === "sender" ? "" : `  ${sent} sent`}`,
            ),
            `${stats.received} received, ${stats.sent} sent${stats.hasMore ? `; more rows than --limit ${options.limit}` : ""}`,
          ].join("\n"),
        )
      },
    )
}
