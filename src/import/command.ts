import { CliError, type Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { providerNamed } from "@wirecat/cli-core"
import { environmentOf, LOCAL_WRITE } from "@wirecat/cli-core/cli"
import { ingestLines } from "@wirecat/cli-core/services"
import type { MessageStore } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { answers, itemAnswer, withStore } from "../answer.js"
import { byOption, isMcpRun, whoRuns } from "../author.js"
import { receiptText } from "../records/import.js"
import { importRecords, type Receipt } from "../records/input.js"
import { sourceOf } from "../records/mapping.js"
import { DOCUMENT_TYPE, documentFields, documentRecord, MOST_FILES, type Skipped, TooMany, walk } from "./files.js"
import { RECORDS_FILES, readerOf } from "./readers.js"

const errnoOf = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined

/** The accounts an import may name: those holding records already, and every account of an import-only provider. */
const importAccounts = async (store: MessageStore): Promise<string[]> => {
  const found: string[] = []
  for (const { provider, account } of await store.accounts.accounts()) {
    const imported = providerNamed(provider)?.imported === true
    if (imported || (await store.records.list({ provider, account, limit: 1 })).items.length > 0)
      found.push(`${provider}:${account}`)
  }
  return found
}

const noAccount = async (env: NodeJS.ProcessEnv): Promise<never> => {
  const choices = await withStore(env, importAccounts)
  throw new CliError(
    "validation_error",
    `name the account to import into: --account <provider>:<account>. ${
      choices.length ? `Accounts that hold imports: ${choices.join(", ")}.` : "No account holds imports yet."
    } A new one is made on first use, such as phone:office-pbx for a phone exchange`,
    { param: "--account", choices },
  )
}

export interface ImportReceipt extends Receipt {
  /** `owner`, or the agent the import is recorded as. */
  by: string
  /** Files read into records; a records file counts as one. */
  files: number
  skipped: Skipped[]
  /** Files whose text was longer than a record holds: only its start is kept. */
  cut: string[]
}

/** Every file's record, one JSONL line at a time, so a large folder is never held in memory whole. */
const folderImport = async (
  store: MessageStore,
  {
    path,
    provider,
    account,
    dryRun,
    by,
    onIssue,
  }: {
    path: string
    provider: string
    account: string
    dryRun: boolean
    by: string
    onIssue: Parameters<typeof ingestLines>[2]["onIssue"]
  },
): Promise<ImportReceipt> => {
  let found: Awaited<ReturnType<typeof walk>>
  try {
    found = await walk(path)
  } catch (error) {
    if (error instanceof TooMany)
      throw new CliError(
        "validation_error",
        `${path} holds more than ${MOST_FILES} files: import its folders one by one`,
        {
          reason: "import.too-many-files",
          path,
        },
      )
    if (errnoOf(error) === "ENOENT") throw new CliError("not_found", `no file or folder ${path}`, { path })
    throw error
  }
  const skipped = [...found.skipped]
  const cut: string[] = []
  let files = 0
  const batch = `memo-import-${new Date().toISOString()}${by === "owner" ? "" : `-by-${by}`}`
  async function* lines(): AsyncIterable<string> {
    yield JSON.stringify({ schema_version: 1, source: { provider, account, batch_id: batch } })
    for (const file of found.files) {
      const reader = readerOf(file)
      if (typeof reader === "string") {
        skipped.push({ path: file.relative, reason: reader })
        continue
      }
      const read = await reader(file)
      if ("refused" in read) {
        skipped.push({ path: file.relative, reason: read.refused })
        continue
      }
      const { fields, cut: wasCut } = documentFields(file, read)
      if (wasCut) cut.push(file.relative)
      files++
      yield JSON.stringify(documentRecord(file, fields, DOCUMENT_TYPE))
    }
  }
  const receipt = await ingestLines(store, lines(), { account, dryRun, ...(onIssue ? { onIssue } : {}) })
  return { ...receipt, by, files, skipped, cut }
}

export const importText = (receipt: ImportReceipt): string =>
  [
    receiptText(receipt),
    `${receipt.files} ${receipt.files === 1 ? "file" : "files"} read${receipt.by === "owner" ? "" : `, recorded as ${receipt.by}`}`,
    ...receipt.cut.map((path) => `only the start kept of ${path}: its text is longer than a record holds`),
    ...receipt.skipped.map((one) => `skipped ${one.path}: ${one.reason}`),
  ].join("\n")

export const importCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const { print } = answers(program, streams, env)
  byOption(
    annotate(program.command("import"), { effects: LOCAL_WRITE, output: { entity: "import_receipt" } })
      .summary("bring a folder of documents or a records file into memo's search")
      .description(
        "bring a folder of text, Markdown, PDF and Word files and .vtt or .srt transcripts, one such file, or a " +
          "records file (JSON or JSONL) into the store, under the account you name. Each file is a document keyed by its path in the folder: the same folder " +
          "twice changes nothing, an edited file updates its document, and a file gone from the folder is kept. " +
          "Links are not followed and nothing leaves this computer; the text is kept as data, never run",
      ),
  )
    .argument(
      "<path>",
      "a folder, a .txt, .md, .pdf, .docx, .vtt or .srt file, or a records file (.json, .jsonl; - for stdin)",
    )
    .option(
      "--account <account>",
      "the source the files belong to: <provider>:<account>, such as phone:office-pbx; never chosen for you",
    )
    .option("--dry-run", "read every file and plan the import; write nothing. Holds the store's write lock meanwhile")
    .option("--json", "print JSON; --json=created,skipped keeps only those fields")
    .action(
      async (
        path: string,
        given: { account?: string; dryRun?: boolean; json?: boolean; asOwner?: boolean },
        command: Command,
      ) => {
        if (isMcpRun(command, env))
          throw new CliError("permission_error", "an agent over MCP hands records over with records import, not a path")
        if (!given.account?.trim()) await noAccount(env)
        const { provider, account } = sourceOf(given.account)
        const who = await whoRuns(command, env, { asOwner: given.asOwner, question: "import these files as yours?" })
        const by = who === "owner" ? "owner" : who.bot
        const dryRun = given.dryRun === true
        const onIssue = (issue: Parameters<typeof receiptText>[0]["errors"][number]) =>
          streams.diagnostic(`refused ${issue.pointer || "/"} · ${issue.message} (${issue.code})\n`)
        const lower = path.toLowerCase()
        const receipt: ImportReceipt = await withStore(env, async (store) =>
          path === "-" || [...RECORDS_FILES].some((extension) => lower.endsWith(extension))
            ? {
                ...(await importRecords(store, {
                  file: path,
                  stdin: environmentOf(program).stdin ?? process.stdin,
                  account: `${provider}:${account}`,
                  dryRun,
                  onIssue,
                })),
                by,
                files: 1,
                skipped: [],
                cut: [],
              }
            : folderImport(store, { path, provider, account, dryRun, by, onIssue }),
        )
        const issues = receipt.errors.map((one) => ({
          code: "validation_error" as const,
          source: one.pointer || "/",
          reason: one.code,
        }))
        print(
          given.json,
          itemAnswer(receipt, issues.length ? { meta: { complete: false, issues } } : undefined),
          importText(receipt),
        )
      },
    )
}
