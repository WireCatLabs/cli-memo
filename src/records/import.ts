import { CliError, type Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { environmentOf, LOCAL_READ, LOCAL_WRITE } from "@wirecat/cli-core/cli"
import type { Command } from "commander"
import { answers, itemAnswer, withStore } from "../answer.js"
import { importRecords, type Receipt } from "./input.js"
import { recordMappingCommands } from "./mapping.js"
import { recordCommands } from "./record-commands.js"

/** The review kinds of what the import proposed, as `memo review kind:` takes them: each ref's prefix. */
const kindsOf = (proposed: readonly string[]) => [...new Set(proposed.map((ref) => ref.slice(0, ref.indexOf(":"))))]

export const receiptText = (receipt: Receipt): string =>
  [
    `${receipt.dryRun ? "would import" : "imported"} ${receipt.source?.batchId ?? "nothing"}: ` +
      `${receipt.created} created, ${receipt.updated} updated, ${receipt.unchanged} unchanged, ` +
      `${receipt.deleted} deleted, ${receipt.refused} refused`,
    ...(receipt.proposed.length
      ? [
          `proposed for your review (memo review list kind:${kindsOf(receipt.proposed).join(",")}): ` +
            receipt.proposed.join(" "),
        ]
      : []),
    ...receipt.waiting.map((one) => `waiting ${one.key}: no entity yet for ${one.missing.join(", ")}`),
    ...receipt.unmatched.map(
      (one) =>
        `unmatched ${one.key}: ${one.candidates.length ? `could be ${one.candidates.join(" or ")}` : one.reason}; ` +
        "you say which with memo records link",
    ),
    ...receipt.flagged.map((one) => `changed at the source ${one.key}: ${one.entity} kept as it was`),
    ...receipt.ignored.map((one) => `kept as data only ${one.key} ${one.pointer} (${one.reason})`),
    ...(receipt.vcard ?? []).map((one) => `notice card ${one.card + 1}: ${one.message}`),
    ...receipt.errors.map((one) => `refused ${one.pointer} · ${one.message} (${one.code})`),
    ...(receipt.truncated ? ["the lists stop at 1000 entries each; the counts are exact"] : []),
  ].join("\n")

export const recordsCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const answered = answers(program, streams, env)
  const { print } = answered
  const records = program
    .command("records")
    .description("what a source said, kept per account; what it says about money waits for your review")
    .summary("what a source said, kept per account")

  const importing = (command: Command, dryRun: boolean | undefined) =>
    command
      .argument(
        "<file>",
        "a records envelope as JSON, JSONL (a header line, then a record per line, read as it streams) or a vCard address book (.vcf, into phone:<device>); - for stdin",
      )
      .option(
        "--account <account>",
        "the source the envelope is for: <provider>:<account> (sheet:rentals) or its source.account alone; " +
          "phone:<device> for a vCard file",
      )
      .option("--json", "print JSON; --json=created,errors keeps only those fields")
      .action(async (file: string, given: { account?: string; dryRun?: boolean; json?: boolean }) => {
        const account = given.account?.trim()
        if (!account)
          throw new CliError("validation_error", "name the source account the envelope is for: --account <account>", {
            param: "--account",
          })
        const receipt = await withStore(env, (store) =>
          importRecords(store, {
            file,
            stdin: environmentOf(program).stdin ?? process.stdin,
            account,
            dryRun: dryRun ?? given.dryRun === true,
          }),
        )
        const issues = receipt.errors.map((one) => ({
          code: "validation_error" as const,
          source: one.pointer,
          reason: one.code,
        }))
        print(
          given.json,
          itemAnswer(receipt, issues.length ? { meta: { complete: false, issues } } : undefined),
          receiptText(receipt),
        )
      })

  importing(
    annotate(records.command("import"), { effects: LOCAL_WRITE, output: { entity: "records_receipt" } })
      .description(
        "bring a source's records into the store, once: the same file twice changes nothing, a lower revision is " +
          "refused, and anything that feeds money totals becomes a proposal for you, never confirmed money",
      )
      .summary("import a source's records; money waits for your review")
      .option("--dry-run", "check and plan the import; write nothing"),
    undefined,
  )
  importing(
    annotate(records.command("check"), { effects: LOCAL_READ, output: { entity: "records_receipt" } })
      .description("what records import would do with the file, as its receipt, writing nothing")
      .summary("check a records file against the store; write nothing"),
    true,
  )
  recordMappingCommands(records, program, streams, env)
  recordCommands(records, answered, (work) => withStore(env, work))
}
