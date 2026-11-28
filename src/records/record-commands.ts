import { CliError } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { CORE_REASONS, providerNamed, RECORDS_SCHEMA_VERSION } from "@wirecat/cli-core"
import { LOCAL_READ, LOCAL_WRITE } from "@wirecat/cli-core/cli"
import { ingest } from "@wirecat/cli-core/services"
import type { MessageStore } from "@wirecat/cli-core/store"
import type { MatchRun } from "@wirecat/cli-core/store/areas"
import type { Command } from "commander"
import { type answers, itemAnswer } from "../answer.js"
import { jsonOption } from "../options.js"
import { ACCOUNT_HELP, RECORD_HELP, recordOf, sourceOf } from "./mapping.js"

const INCOMING = 100

/** The CLI code cli-core registers for an import's refusal, such as `record.stale-revision`. */
export const codeOf = (reason: string) => {
  const code = CORE_REASONS.find((one) => one.reason === reason)?.code
  return code === undefined || code === "internal_error" ? "validation_error" : code
}

const storedRecord = async (store: MessageStore, account: string | undefined, record: string) => {
  const key = { ...sourceOf(account), ...recordOf(record) }
  const found = await store.records.get(key)
  if (found === undefined)
    throw new CliError(
      "not_found",
      `no record ${record} from ${key.provider}:${key.account}; records list shows them`,
      {
        reason: "records.not-stored",
        record,
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

/** `records show`, `records delete`, `records clear` and `records match`: one record, a whole source, and its waiting identities. */
export const recordCommands = (
  records: Command,
  { run, print }: ReturnType<typeof answers>,
  withStore: <T>(work: (store: MessageStore) => Promise<T>) => Promise<T>,
): void => {
  jsonOption(
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
        const incoming = await store.records.incoming(found, { limit: INCOMING + 1 })
        return itemAnswer({
          ...found,
          incoming: { items: incoming.slice(0, INCOMING), hasMore: incoming.length > INCOMING },
        })
      }),
    )

  jsonOption(
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
      if (refused) throw new CliError(codeOf(refused.code), refused.message, { reason: refused.code })
      print(
        given.json,
        itemAnswer(receipt),
        receipt.deleted === 0
          ? `${record} was already deleted`
          : `deleted ${record}${receipt.flagged.length ? `; ${receipt.flagged.map((one) => one.entity).join(" ")} kept, flagged for you` : ""}`,
      )
    })

  jsonOption(
    annotate(records.command("clear"), {
      effects: LOCAL_WRITE,
      output: { entity: "records_clear" },
      examples: ["wcat records clear --account n8n:test", "wcat records clear --account n8n:test --yes"],
    })
      .option("--account <account>", ACCOUNT_HELP)
      .option("--yes", "confirm: nothing of the source can be brought back but by importing it again"),
    "account,records",
  )
    .description(
      "delete everything one source said: its records, the leads, deals and pipelines made from them, and the people " +
        "only it made. Anyone you tagged or gave a task to, or another source knows, stays; people delete " +
        "removes them. For a test or a wrong import; a WireCat tool's account, such as tg or a CRM, is removed by " +
        "that tool. Without --yes nothing changes",
    )
    .summary("delete a source's records and its leads and deals")
    .action(async (given: { account?: string; json?: boolean; yes?: boolean }) => {
      const source = sourceOf(given.account)
      const name = `${source.provider}:${source.account}`
      const cleared = await withStore(async (store) => {
        const tool = providerNamed(source.provider)
        if (tool && !tool.imported)
          throw new CliError(
            "validation_error",
            `${name} is an account of ${tool.command ?? "a WireCat tool"}, not an import; remove it with that tool`,
            { reason: "records.clear-synced", account: name },
          )
        let held = 0
        for (;;) {
          const page = await store.records.list({ ...source, limit: 500, offset: held })
          held += page.items.length
          if (page.items.length < 500) break
        }
        if (held === 0)
          throw new CliError("not_found", `no records from ${name}; records list shows a source's records`, {
            reason: "records.not-stored",
            account: name,
          })
        if (given.yes !== true)
          throw new CliError(
            "confirmation_required",
            `this deletes ${held} records of ${name} and its leads, deals and pipelines; nothing was changed — add --yes`,
            { reason: "records.clear-confirm", records: held },
          )
        await store.accounts.purge(source)
        return { account: name, records: held }
      })
      print(
        given.json,
        itemAnswer(cleared),
        `cleared ${name}: ${cleared.records} records, with its leads, deals and pipelines`,
      )
    })

  jsonOption(
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
