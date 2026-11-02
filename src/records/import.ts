import { readFile } from "node:fs/promises"
import { CliError, type Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { envelopeOfJsonl } from "@wirecat/cli-core"
import { environmentOf, LOCAL_READ, LOCAL_WRITE } from "@wirecat/cli-core/cli"
import { type IngestReceipt, ingest } from "@wirecat/cli-core/services"
import type { Command } from "commander"
import { answers, itemAnswer, withStore } from "../answer.js"

const readAll = async (file: string, stdin: NodeJS.ReadableStream): Promise<string> => {
  if (file !== "-") return readFile(file, "utf8")
  let text = ""
  stdin.setEncoding("utf8")
  for await (const chunk of stdin) text += chunk
  return text
}

/** One JSON envelope, or JSONL: a header line, then a record per line. */
export const envelopeOf = (text: string): unknown => {
  try {
    const whole = JSON.parse(text) as unknown
    if (whole && typeof whole === "object" && "records" in whole) return whole
  } catch {}
  return envelopeOfJsonl(text)
}

export const receiptText = (receipt: IngestReceipt): string =>
  [
    `${receipt.dryRun ? "would import" : "imported"} ${receipt.source?.batchId ?? "nothing"}: ` +
      `${receipt.created} created, ${receipt.updated} updated, ${receipt.unchanged} unchanged, ` +
      `${receipt.deleted} deleted, ${receipt.refused} refused`,
    ...(receipt.proposed.length
      ? [`proposed for your review (memo review kind:invoice,payment): ${receipt.proposed.join(" ")}`]
      : []),
    ...receipt.waiting.map((one) => `waiting ${one.key}: no entity yet for ${one.missing.join(", ")}`),
    ...receipt.flagged.map((one) => `changed at the source ${one.key}: ${one.entity} kept as it was`),
    ...receipt.errors.map((one) => `refused ${one.pointer} · ${one.message} (${one.code})`),
  ].join("\n")

export const recordsCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const { print } = answers(program, streams, env)
  const records = program
    .command("records")
    .description("what a source said, kept per account; invoices and payments from it wait for your review")
    .summary("what a source said, kept per account")

  const importing = (command: Command, dryRun: boolean | undefined) =>
    command
      .argument("<file>", "a records envelope as JSON, or JSONL (a header line, then a record per line); - for stdin")
      .option("--account <account>", "the source account the envelope is for, as its source.account says")
      .option("--json", "print JSON; --json=created,errors keeps only those fields")
      .action(async (file: string, given: { account?: string; dryRun?: boolean; json?: boolean }) => {
        const account = given.account?.trim()
        if (!account)
          throw new CliError("validation_error", "name the source account the envelope is for: --account <account>", {
            param: "--account",
          })
        const envelope = envelopeOf(await readAll(file, environmentOf(program).stdin ?? process.stdin))
        const receipt = await withStore(env, (store) =>
          ingest(store, envelope, { account, dryRun: dryRun ?? given.dryRun === true }),
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
          "refused, and an invoice or a payment becomes a proposal for you, never confirmed money",
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
}
