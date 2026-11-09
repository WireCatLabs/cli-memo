import { open, readFile } from "node:fs/promises"
import { basename } from "node:path"
import { text as streamText } from "node:stream/consumers"
import { CliError } from "@wirecat/cli-base"
import {
  envelopeOfCsv,
  envelopeOfText,
  type IngestError,
  isVcard,
  TABLE_RECORD_TYPES,
  TableError,
  type TablePlace,
  type VcardIssue,
} from "@wirecat/cli-core"
import {
  type IngestReceipt,
  type IngestVcardOptions,
  ingest,
  ingestLines,
  ingestVcard,
  jsonlLines,
} from "@wirecat/cli-core/services"
import type { MessageStore } from "@wirecat/cli-core/store"
import { sourceOf } from "./mapping.js"

/** `vcard` holds the converter's notices, each `card` counted from 1. */
export type Receipt = IngestReceipt & { vcard?: VcardIssue[] }

/** A sheet's line (the header is 1) and column, beside each pointer of a receipt read from CSV. */
type Placed = { pointer: string; place?: TablePlace }

/** A vCard address book is a phone's contacts: they go under the seeded `phone` provider, one account per device. */
const PHONE = "phone"

const BOM = /^\uFEFF/

const errnoOf = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined

/** A file opened now, so a missing one fails before anything is read; its errors come as answers, not as errno. */
const linesOf = async (file: string, stdin: NodeJS.ReadableStream): Promise<AsyncIterable<string>> => {
  if (file === "-") return jsonlLines(stdin)
  try {
    const handle = await open(file)
    if (!(await handle.stat()).isFile()) {
      await handle.close()
      throw Object.assign(new Error(`${file} is a folder`), { code: "EISDIR" })
    }
    return jsonlLines(handle.createReadStream({ encoding: "utf8" }))
  } catch (error) {
    if (errnoOf(error) === "ENOENT")
      throw new CliError("not_found", `no records file ${file}: give a file that exists, or - for stdin`, {
        reason: "records.file-missing",
        path: file,
      })
    const why =
      errnoOf(error) === "EISDIR" ? "it is a folder" : errnoOf(error) === "EACCES" ? "no permission" : "unreadable"
    throw new CliError("validation_error", `the records file ${file} cannot be read: ${why}`, {
      reason: "records.file-unreadable",
      path: file,
      why,
    })
  }
}

/** A JSONL file's first line: an object holding no `records`. */
const headerOf = (line: string): Record<string, unknown> | undefined => {
  try {
    const value = JSON.parse(line) as unknown
    return value && typeof value === "object" && !Array.isArray(value) && !("records" in value)
      ? (value as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}

/** `sheet:rentals` names the envelope's provider and account, as records list and link take it. */
const accountIn = (envelope: unknown, given: string): string => {
  const provider = (envelope as { source?: { provider?: unknown } } | null)?.source?.provider
  return typeof provider === "string" && given.startsWith(`${provider}:`) ? given.slice(provider.length + 1) : given
}

const deviceOf = (given: string): string => {
  const at = given.indexOf(":")
  if (at < 0) return given
  if (given.slice(0, at) !== PHONE)
    throw new CliError("validation_error", "a vCard file holds a phone's contacts: --account phone:<device>", {
      param: "--account",
    })
  return given.slice(at + 1)
}

/**
 * Imports a records file or stdin. JSONL streams, a record at a time, so a file of any length fits in memory; a JSON
 * envelope and a vCard address book are read whole, as one envelope each. `onIssue` hears every refusal as it
 * happens, also those past the receipt's capped lists.
 */
export const importRecords = async (
  store: MessageStore,
  {
    file,
    stdin,
    account,
    dryRun,
    onIssue,
    region,
    type,
  }: {
    file: string
    stdin: NodeJS.ReadableStream
    account: string
    dryRun: boolean
    onIssue: (issue: IngestError) => void
    /** A vCard's country for numbers without `+`, in any case. */
    region?: string
    /** The one type a CSV sheet holds; a `.csv` file needs it. */
    type?: string
  },
): Promise<Receipt> => {
  if (type !== undefined || file.toLowerCase().endsWith(".csv"))
    return importSheet(store, { file, stdin, account, dryRun, onIssue, type })
  const iterator = (await linesOf(file, stdin))[Symbol.asyncIterator]()
  const before: string[] = []
  let next = await iterator.next()
  while (!next.done && next.value.replace(BOM, "").trim() === "") {
    before.push(next.value)
    next = await iterator.next()
  }
  async function* rest(): AsyncIterable<string> {
    for (let line = await iterator.next(); !line.done; line = await iterator.next()) yield line.value
  }
  const whole = async (first: string[]) => {
    const lines = [...before, ...first]
    for await (const line of rest()) lines.push(line)
    return lines.join("\n")
  }
  if (next.done) return ingest(store, envelopeOfText(before.join("\n")), { account, dryRun, onIssue })
  const first = next.value.replace(BOM, "")
  if (isVcard(first)) {
    const { vcard, ...receipt } = await ingestVcard(store, await whole([first]), {
      account: deviceOf(account),
      provider: PHONE,
      batchId: `vcard-${new Date().toISOString()}`,
      dryRun,
      onIssue,
      // cli-core checks the code against its phone plans; its list is lower case.
      ...(region === undefined ? {} : { region: region.trim().toLowerCase() as IngestVcardOptions["region"] }),
    })
    const badRegion = receipt.errors.find((one) => one.pointer === "/options/phone_region")
    if (badRegion)
      throw new CliError("validation_error", badRegion.message.replace("options.phone_region", "--region"), {
        param: "--region",
        reason: badRegion.code,
      })
    return { ...receipt, vcard: vcard.map((one) => ({ ...one, card: one.card + 1 })) }
  }
  if (region !== undefined)
    throw new CliError("validation_error", "--region is for a vCard file; an envelope names options.phone_region", {
      param: "--region",
    })
  const header = headerOf(first)
  if (header !== undefined) {
    async function* all(): AsyncIterable<string> {
      // A refused header stops the stream at its first line; the file is closed here, not when it is collected.
      try {
        yield first
        yield* rest()
      } finally {
        await iterator.return?.()
      }
    }
    return ingestLines(store, all(), { account: accountIn(header, account), dryRun, onIssue })
  }
  const envelope = envelopeOfText(await whole([first]))
  return ingest(store, envelope, { account: accountIn(envelope, account), dryRun, onIssue })
}

const placed = <T extends Placed>(items: T[], placeOf: (pointer: string) => TablePlace | undefined): T[] =>
  items.map((item) => {
    const place = placeOf(item.pointer)
    return place ? { ...item, place } : item
  })

const sheetText = async (file: string, stdin: NodeJS.ReadableStream) => {
  if (file === "-") return streamText(stdin)
  try {
    return await readFile(file, "utf8")
  } catch (error) {
    if (errnoOf(error) === "ENOENT")
      throw new CliError("not_found", `no records file ${file}: give a file that exists, or - for stdin`, {
        reason: "records.file-missing",
        path: file,
      })
    throw new CliError("validation_error", `the records file ${file} cannot be read`, {
      reason: "records.file-unreadable",
      path: file,
    })
  }
}

/** `line 3, column total`: where a sheet's refusal is, as the owner finds it in a spreadsheet. */
export const placeText = (place: TablePlace | undefined) =>
  place ? `line ${place.line}${place.column ? `, column ${place.column}` : ""}` : ""

/** A sheet that cannot be read as records is refused whole, as an envelope is: nothing is written. */
const refusedSheet = (dryRun: boolean, source: Receipt["source"], errors: Receipt["errors"]): Receipt => ({
  dryRun,
  source,
  created: 0,
  updated: 0,
  unchanged: 0,
  deleted: 0,
  refused: errors.length,
  proposed: [],
  waiting: [],
  flagged: [],
  unmatched: [],
  ignored: [],
  relationships: { added: 0, kept: 0, restored: 0, withdrawn: 0, proposed: 0, skippedOwnerRejected: 0 },
  notices: [],
  errors,
  truncated: false,
})

/**
 * A CSV sheet of one type, read whole, as an envelope of `<provider>:<account>`; every pointer of the receipt also
 * names the sheet's line and column.
 */
const importSheet = async (
  store: MessageStore,
  {
    file,
    stdin,
    account,
    dryRun,
    onIssue,
    type,
  }: {
    file: string
    stdin: NodeJS.ReadableStream
    account: string
    dryRun: boolean
    onIssue: (issue: IngestError & { place?: TablePlace }) => void
    type: string | undefined
  },
): Promise<Receipt> => {
  if (!type || !TABLE_RECORD_TYPES.includes(type))
    throw new CliError("validation_error", `a CSV sheet holds one type: --type ${TABLE_RECORD_TYPES.join("|")}`, {
      param: "--type",
    })
  const source = sourceOf(account)
  const batch = `${file === "-" ? "stdin" : basename(file)}-${new Date().toISOString()}`
  let read: ReturnType<typeof envelopeOfCsv>
  try {
    read = envelopeOfCsv(await sheetText(file, stdin), { type, source: { ...source, batch_id: batch } })
  } catch (error) {
    if (!(error instanceof TableError)) throw error
    for (const one of error.errors) onIssue(one)
    return refusedSheet(dryRun, { ...source, batchId: batch }, error.errors)
  }
  const receipt = await ingest(store, read.envelope, {
    account: source.account,
    dryRun,
    onIssue: (issue) =>
      onIssue({ ...issue, ...(read.placeOf(issue.pointer) ? { place: read.placeOf(issue.pointer) } : {}) }),
  })
  return {
    ...receipt,
    waiting: placed(receipt.waiting, read.placeOf),
    flagged: placed(receipt.flagged, read.placeOf),
    unmatched: placed(receipt.unmatched, read.placeOf),
    ignored: placed(receipt.ignored, read.placeOf),
    errors: placed(receipt.errors, read.placeOf),
  }
}
