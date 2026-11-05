import { createReadStream } from "node:fs"
import { readBatchInput, type Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import type { QueryRegistry } from "@wirecat/cli-base/query"
import {
  environmentOf,
  LOCAL_READ,
  LOCAL_WRITE,
  parseMailFindingsJson,
  proposesOnly,
  queryTerms,
  termField,
  withQuery,
} from "@wirecat/cli-core/cli"
import type { Command } from "commander"
import { answers, itemAnswer, listAnswer } from "../answer.js"
import { whoRuns } from "../author.js"
import { positive } from "../options.js"
import { MAILBOX_HELP, oneMailboxOf } from "./review-command.js"

const FINDINGS_QUERY = {
  entity: "mail_findings",
  backend: "native",
  fields: [termField("status", "enum", "status:proposed", { values: ["proposed", "reviewed"] })],
} as const satisfies QueryRegistry

const INPUT_HELP = `
Input: schema_version 1, key, extractor, findings. key is <holder>:<through id>, the id in the cursor
\`mail review --holder\` gave (mail-triage:9123456); the same key and file give the same batch, the same key with
another file is refused. 1–30 findings, at most 5 from one sender; each cites 1–8 msg:email/… references with the
fingerprint review gave, and at least one email of this mailbox.
Kinds: task (type bug|feature|chore, title, reason, commitment explicit|inferred, optional project, due_at with
due_evidence, assignee with assignee_evidence; no project means the mailbox's inbox project) · task_update (task,
change close|due|detail, reason; due needs due_at, detail needs detail) · fact (type, statement, subject or project)
· memory (memory_kind, scope, body, subject or project) · link (from, to, reason: contact:email/<address> → person:N,
person:N → organization:N, chat:email/… → project:N) · new_contact (address of a cited email's sender or recipient,
name, reason) · invoice (direction receivable|payable, counterparty person:N|organization:N, currency, lines of
description and amount, optional total, number, issue_date, due_date, project) · payment (direction in|out, amount,
currency, date, optional payer, payee, reference, allocations of stored invoices) · order (purpose
personal|business|client|other, supplier_name, optional customer, supplier, number, total with currency, status,
order_date, invoice, payment) · order_update (supplier_name and number of a stored order, status, date when delivered).
An invoice, payment or order is checked as memo invoices|payments|orders add checks yours; a refusal names why.
A cited email that changed since review refuses the batch (mail-findings.stale), one still partial too
(mail-findings.partial). Nothing is created until the owner confirms: memo review confirm <batch>/<finding>.
`

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
    .argument("<file>", "JSON findings file, or - for stdin; at most 65536 UTF-8 bytes")
    .option("--source <accounts>", MAILBOX_HELP)
    .addHelpText("after", INPUT_HELP)
    .action(async (file: string, given: { source?: string; json?: boolean }) => {
      const text = await readBatchInput(
        file === "-" ? (environmentOf(program).stdin ?? process.stdin) : createReadStream(file),
      )
      const input = parseMailFindingsJson(text)
      const author = await whoRuns(program, env, { question: "" })
      const agent = author === "owner" ? { bot: "memo-mail-findings" } : author
      await run(given.json, async (store) =>
        itemAnswer(await store.mailFindings.stage(await oneMailboxOf(store, env, given.source), input, agent)),
      )
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
