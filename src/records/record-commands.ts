import { CliError } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { RECORDS_SCHEMA_VERSION } from "@wirecat/cli-core"
import { LOCAL_READ, LOCAL_WRITE } from "@wirecat/cli-core/cli"
import { ingest } from "@wirecat/cli-core/services"
import type { MatchRun, MessageStore } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { type answers, itemAnswer } from "../answer.js"
import { ACCOUNT_HELP, RECORD_HELP, recordOf, sourceOf } from "./mapping.js"

const json = (command: Command, fields: string) =>
  command.option("--json", `print JSON; --json=${fields} keeps only those fields`)

const INCOMING = 100

const storedRecord = async (store: MessageStore, account: string | undefined, record: string) => {
  const key = { ...sourceOf(account), ...recordOf(record) }
  const found = await store.records.get(key)
  if (found === undefined)
    throw new CliError(
      "not_found",
      `no record ${record} from ${key.provider}:${key.account}; records list shows them`,
      {
        reason: "record.not-found",
      },
    )
  return found
}

const matchText = (run: MatchRun) =>
  [
    `matched ${run.linked}, created ${run.created}`,
    ...(run.proposed.length ? [`proposed for your review: ${run.proposed.join(" ")}`] : []),
    ...run.unmatched.map(
      (one) =>
        `unmatched ${one.key.type}:${one.key.externalId}: ` +
        `${one.candidates.length ? `could be ${one.candidates.join(" or ")}` : one.reason}`,
    ),
    ...run.errors.map((one) => `refused ${one.pointer} · ${one.message} (${one.code})`),
    ...(run.truncated ? ["the lists stop at 1000 entries each; the counts are exact"] : []),
  ].join("\n")

/** `records show`, `records delete` and `records match`: one record, and the account's waiting identities. */
export const recordCommands = (
  records: Command,
  { run, print }: ReturnType<typeof answers>,
  withStore: <T>(work: (store: MessageStore) => Promise<T>) => Promise<T>,
): void => {
  json(
    annotate(records.command("show"), { effects: LOCAL_READ, output: { entity: "source_record" } })
      .argument("<record>", RECORD_HELP)
      .option("--account <account>", ACCOUNT_HELP),
    "fields,relations,incoming,entity",
  )
    .description(
      "one record as its source said it: its fields, the records it names, the records that name it (incoming, " +
        `the first ${INCOMING}) and the entry made from it`,
    )
    .summary("one record as its source said it")
    .action((record: string, given: { account?: string; json?: boolean }) =>
      run(given.json, async (store) => {
        const found = await storedRecord(store, given.account, record)
        const incoming = await store.records.incoming(found, { limit: INCOMING })
        return itemAnswer({ ...found, incoming })
      }),
    )

  json(
    annotate(records.command("delete"), { effects: LOCAL_WRITE, output: { entity: "records_receipt" } })
      .argument("<record>", RECORD_HELP)
      .option("--account <account>", ACCOUNT_HELP),
    "deleted,flagged,errors",
  )
    .description(
      "say a source no longer has a record, as an import's delete does: the record is kept as deleted, and the " +
        "entry made from it stays, flagged for you to reject or keep",
    )
    .summary("mark a source's record deleted")
    .action(async (record: string, given: { account?: string; json?: boolean }) => {
      const receipt = await withStore(async (store) => {
        const found = await storedRecord(store, given.account, record)
        return ingest(
          store,
          {
            schema_version: RECORDS_SCHEMA_VERSION,
            source: {
              provider: found.provider,
              account: found.account,
              batch_id: `delete-${new Date().toISOString()}`,
            },
            records: [
              {
                key: "delete",
                type: found.type,
                external_id: found.externalId,
                operation: "delete",
                ...(found.revision === null ? {} : { revision: found.revision }),
              },
            ],
          },
          { account: found.account },
        )
      })
      const [refused] = receipt.errors
      if (refused) throw new CliError("validation_error", refused.message, { reason: refused.code })
      print(
        given.json,
        itemAnswer(receipt),
        receipt.deleted === 0
          ? `${record} was already deleted`
          : `deleted ${record}${receipt.flagged.length ? `; ${receipt.flagged.map((one) => one.entity).join(" ")} kept, flagged for you` : ""}`,
      )
    })

  json(
    annotate(records.command("match"), { effects: LOCAL_WRITE, output: { entity: "records_match" } }).option(
      "--account <account>",
      ACCOUNT_HELP,
    ),
    "linked,created,unmatched",
  )
    .description(
      "link every waiting person, organization and project of a source to the one entry its e-mail, phone or other " +
        "identifier names, or make one, as an import does; never by name. Two or more fits wait for records link",
    )
    .summary("match a source's waiting people and organizations")
    .action((given: { account?: string; json?: boolean }) =>
      withStore(async (store) => store.records.match(sourceOf(given.account))).then((found) =>
        print(given.json, itemAnswer(found), matchText(found)),
      ),
    )
}
