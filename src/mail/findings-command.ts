import { CliError, type ErrorCode as CliErrorCode, type Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import type { QueryRegistry } from "@wirecat/cli-base/query"
import {
  environmentOf,
  LOCAL_READ,
  LOCAL_WRITE,
  mailFindingFieldsHelp,
  parseMailFindingsJson,
  proposesOnly,
  queryTerms,
  readMailFindingsJson,
  termField,
  withQuery,
} from "@wirecat/cli-core/cli"
import type { Command } from "commander"
import { answers, itemAnswer, listAnswer } from "../answer.js"
import { whoRuns } from "../author.js"
import { FINDINGS_INPUT_HELP, readFindingsInput } from "../findings-input.js"
import { positive } from "../options.js"
import { withoutDuplicates } from "./findings-duplicates.js"
import { MAILBOX_HELP, oneMailboxOf } from "./review-command.js"

const FINDINGS_QUERY = {
  entity: "mail_findings",
  backend: "native",
  fields: [termField("status", "enum", "status:proposed", { values: ["proposed", "reviewed"] })],
} as const satisfies QueryRegistry

const INPUT_HELP = `
Input: schema_version 1, key, extractor, findings. key is the one \`mail review --holder\` gave in its
mail-findings.add step (mail-triage:9123456, or mail-triage:9123456-r1 after the owner moved the mark back); pass it
as --key or in the JSON. The same key and input give the same batch, the same key with another input is refused. 1–30 findings, at most 5 from one sender; each cites 1–8 msg:email/… references with the
fingerprint review gave, and at least one email of this mailbox.
Every finding gives id, kind, evidence and the fields its kind needs, reason among them; the others are optional:
${mailFindingFieldsHelp()}
A task's due_at is a timestamp with a timezone and comes with due_evidence, the cited refs that give the date:
"due_at":"2026-11-09T09:00:00Z","due_evidence":["msg:email/…"]; assignee comes with assignee_evidence the same way.
An invoice names counterparty (person:N or organization:N) or counterparty_name. A task_update's due change gives
due_at, its detail change gives detail; a link goes contact:email/<address> → person:N, person:N → organization:N or
chat:email/… → project:N; a memory is about a subject or a project; an order_update names a stored order, with date
only when delivered.
A finding whose order, invoice, payment, task or fact is stored, already waits in a proposed batch or came earlier in
the batch is a duplicate: it is not staged and the answer lists it in duplicates with duplicate_of, the reference that
holds it, and reason findings.duplicate. The rest of the batch stages. An order is the same by shop and number or
source_url, an invoice by counterparty and number, a payment by amount, currency, date and party, a task by external_id
or source_url, a fact by its text and subject.
An invoice, payment or order is checked as memo invoices|payments|orders add checks yours; a refusal names why.
A cited email that changed since review refuses the batch (mail-findings.stale), one still partial too
(mail-findings.partial). Nothing is created until the owner confirms: memo review confirm <batch>/<finding>.
A party the store does not hold yet goes by name: counterparty_name, payer_name, payee_name or customer_name in
place of the reference, with an optional <party>_email that sent or received a cited email; the owner's accept finds
its organization by that address, its domain or the exact name, or makes one. An order whose shop and number are
stored (order.duplicate) or already wait in a proposed batch (order.proposed) is refused.
--dry-run checks it all and stages nothing: valid, and problems with each refused finding's id, kind and message.
Build the whole batch, check it, fix every problem, then stage it once: a staged key takes no other input.
`

/** The batch with `--key` as its key; the JSON may leave key out, and may not name another. */
const keyed = (text: string, key: string | undefined): string => {
  if (key === undefined) return text
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return text
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return text
  const named = (raw as { key?: unknown }).key
  if (named !== undefined && named !== key)
    throw new CliError("validation_error", `the batch's key ${String(named)} is not --key ${key}; give the key once`, {
      reason: "findings.key-mismatch",
      key: String(named),
      given: key,
    })
  return JSON.stringify({ ...raw, key })
}

const json = (command: Command) => command.option("--json", "print JSON; --json=id,status keeps only those fields")

/**
 * `memo mail findings`: what an agent read in one mailbox's new mail, staged for the owner. `add` is of cli-core's
 * propose tier, so a read-only scheduled agent may stage; deciding is the proposal registry's, owner only.
 */
export const mailFindingsCommand = (
  program: Command,
  mail: Command,
  streams: Streams,
  env: NodeJS.ProcessEnv,
): void => {
  const { run } = answers(program, streams, env)
  const findings = mail
    .command("findings")
    .description(
      "cited tasks, task updates, facts, memories, links, contacts, invoices, payments and orders an agent read in new mail",
    )
    .summary("what an agent read in new mail, cited, waiting for the owner")

  json(proposesOnly(annotate(findings.command("add"), { effects: LOCAL_WRITE, output: { entity: "mail_findings" } })))
    .description("stage one mailbox's findings for the owner; nothing is created until the owner confirms")
    .summary("stage one mailbox's findings; the owner confirms them")
    .argument("<file>", FINDINGS_INPUT_HELP)
    .option("--source <accounts>", MAILBOX_HELP)
    .option("--key <key>", "the findings key `mail review --holder` gave in its mail-findings.add step")
    .option(
      "--dry-run",
      "check the batch as staging would, invoices, payments and orders tried and rolled back, and stage nothing; " +
        "answers valid and every finding's problem at once",
    )
    .addHelpText("after", INPUT_HELP)
    .action(async (file: string, given: { source?: string; key?: string; json?: boolean; dryRun?: boolean }) => {
      const read = await readFindingsInput(file, environmentOf(program).stdin ?? process.stdin)
      const text = keyed(read, given.key)
      const input = given.dryRun ? readMailFindingsJson(text) : parseMailFindingsJson(text)
      const author = await whoRuns(program, env, { question: "" })
      const agent = author === "owner" ? { bot: "memo-mail-findings" } : author
      await run(given.json, async (store) => {
        const mailbox = await oneMailboxOf(store, env, given.source)
        const { input: kept, duplicates } = await withoutDuplicates(store, input)
        const noted = duplicates.length ? { duplicates } : {}
        if (duplicates.length > 0 && kept.findings.length === 0)
          return itemAnswer({
            dryRun: Boolean(given.dryRun),
            valid: true,
            staged: false,
            findings: 0,
            problems: [],
            ...noted,
          })
        if (!given.dryRun) return itemAnswer({ ...(await store.mailFindings.stage(mailbox, kept, agent)), ...noted })
        const checked = await store.mailFindings.check(mailbox, kept, agent)
        const issues = checked.problems.map((one) => ({
          code: one.code as CliErrorCode,
          source: one.finding ?? "batch",
          reason: (one.details?.reason as string | undefined) ?? one.message,
        }))
        return itemAnswer(
          { dryRun: true, ...checked, ...noted },
          issues.length ? { meta: { complete: false, issues } } : undefined,
        )
      })
    })

  json(annotate(findings.command("show"), { effects: LOCAL_READ, output: { entity: "mail_findings" } }))
    .description("one findings batch: its findings with their evidence, earlier decisions and the review receipt")
    .summary("one findings batch with its evidence and decisions")
    .argument("<id>", "the batch id `mail findings add` or `list` gave")
    .action((id: string, given: { json?: boolean }) =>
      run(given.json, async (store) => itemAnswer(await store.mailFindings.get(id))),
    )

  withQuery(
    json(annotate(findings.command("list"), { effects: LOCAL_READ, output: { entity: "mail_findings" } })),
    FINDINGS_QUERY,
  )
    .description("mail findings batches, newest first; status:proposed is what waits for the owner")
    .option("--source <accounts>", "only this mailbox's batches: email:<address>")
    .option("--limit <n>", "batches per page, at most 50", positive, 20)
    .option("--page <n>", "which page, from 1", positive, 1)
    .action((words: string[], given: { source?: string; json?: boolean; limit: number; page: number }) =>
      run(given.json, async (store) => {
        const status = queryTerms(words, FINDINGS_QUERY, "mail findings list").get("status") as
          | "proposed"
          | "reviewed"
          | undefined
        const account = given.source ? await oneMailboxOf(store, env, given.source) : undefined
        const found = await store.mailFindings.list({
          limit: given.limit,
          offset: (given.page - 1) * given.limit,
          ...(account === undefined ? {} : { account }),
          ...(status === undefined ? {} : { status }),
        })
        return listAnswer("mail findings list", {
          items: found.items,
          limit: given.limit,
          page: given.page,
          has_more: found.hasMore,
          args: { query: words.join(" "), ...(given.source ? { source: given.source } : {}), limit: given.limit },
        })
      }),
    )
}
