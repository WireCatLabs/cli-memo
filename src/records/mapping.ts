import { CliError, type Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import type { QueryRegistry } from "@wirecat/cli-base/query"
import { LOCAL_READ, LOCAL_WRITE, queryTerms, termField, withQuery } from "@wirecat/cli-core/cli"
import type { Command } from "commander"
import { answers, itemAnswer } from "../answer.js"
import { byOption, whoRuns } from "../author.js"
import { positive } from "../options.js"
import { pageOf } from "../page.js"

export const RECORD_QUERY = {
  entity: "source_record",
  backend: "native",
  fields: [
    termField("type", "kw", "type:organization"),
    termField("waiting", "bool", "waiting:true"),
    termField("flagged", "bool", "flagged:true"),
    termField("unmatched", "bool", "unmatched:true"),
  ],
} as const satisfies QueryRegistry

/** `sheet:rentals`: records are kept per source, so a read or a mapping names its provider and account. */
export const sourceOf = (account: string | undefined) => {
  const [provider = "", ...rest] = (account ?? "").trim().split(":")
  const name = rest.join(":")
  if (!provider || !name)
    throw new CliError("validation_error", "name the source as --account <provider>:<account>, such as sheet:rentals", {
      param: "--account",
    })
  return { provider, account: name }
}

/**
 * `organization:client` or `custom:quote:Q-7`: the record's type and its id at the source, as the envelope gave them.
 * Only a `custom:` type holds a colon; any other id may hold one.
 */
export const recordOf = (record: string) => {
  const from = record.startsWith("custom:") ? "custom:".length : 0
  const at = record.indexOf(":", from)
  if (at <= from || at === record.length - 1)
    throw new CliError(
      "validation_error",
      `${record} is not <type>:<external_id>, such as organization:client or custom:quote:Q-7`,
      { param: "record" },
    )
  return { type: record.slice(0, at), externalId: record.slice(at + 1) }
}

export const RECORD_HELP =
  "<type>:<external_id> as the source names it, such as organization:client or custom:quote:Q-7"

export const ACCOUNT_HELP = "the source, <provider>:<account> as the envelope's source names it, such as sheet:rentals"

export const recordMappingCommands = (
  records: Command,
  program: Command,
  streams: Streams,
  env: NodeJS.ProcessEnv,
): void => {
  const { run } = answers(program, streams, env)

  withQuery(
    annotate(records.command("list"), { effects: LOCAL_READ }).description(
      "a source's records, newest first; waiting:true lists those that wait for a record they name, unmatched:true " +
        "the people, organizations and projects whose identifiers fit more than one of yours",
    ),
    RECORD_QUERY,
  )
    .summary("a source's records; waiting:true lists what needs records link")
    .option("--account <account>", ACCOUNT_HELP)
    .option("--limit <n>", "most records, up to 500", positive, 100)
    .option("--json", "print JSON; --json=type,external_id,entity keeps only those fields")
    .action((words: string[], given: { account?: string; limit: number; json?: boolean }) =>
      run(given.json, async (store) => {
        const source = sourceOf(given.account)
        const terms = queryTerms(words, RECORD_QUERY, "records list")
        const filter = {
          ...source,
          ...(terms.has("type") ? { type: terms.get("type") as string } : {}),
          ...(terms.get("waiting") === "true" ? { waiting: true } : {}),
          ...(terms.get("flagged") === "true" ? { flagged: true } : {}),
          ...(terms.get("unmatched") === "true" ? { unmatched: true } : {}),
        }
        return pageOf("records list", given.limit, (most) => store.records.list({ ...filter, limit: most }))
      }),
    )

  byOption(
    annotate(records.command("link"), { effects: LOCAL_WRITE, output: { entity: "source_record" } })
      .description(
        "say which of your entries a source's record is (organization:client is organization:3); never done by " +
          "name. Records that waited for it become proposals in memo review. Only you link; an agent is refused",
      )
      .summary("say which of your entries a source's record is")
      .argument("<record>", RECORD_HELP)
      .argument("<ref>", "your entry of the same type: person:<id>, organization:<id> or project:<id>")
      .option("--account <account>", ACCOUNT_HELP)
      .option("--json", "print JSON; --json=type,external_id,entity keeps only those fields"),
  ).action(
    async (
      record: string,
      ref: string,
      given: { account?: string; asOwner?: boolean; json?: boolean },
      command: Command,
    ) => {
      const by = await whoRuns(command, env, { asOwner: given.asOwner, question: `link ${record} to ${ref} as you?` })
      await run(given.json, async (store) =>
        itemAnswer(await store.records.map({ ...sourceOf(given.account), ...recordOf(record) }, ref, by)),
      )
    },
  )
}
