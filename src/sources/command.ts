import { existsSync } from "node:fs"
import { CliError, type Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { environmentOf, FETCH, LOCAL_READ, LOCAL_WRITE } from "@wirecat/cli-core/cli"
import { type FetchPageOptions, MAX_TEXT_CHARS } from "@wirecat/cli-core/documents"
import { type AddedSourceContent, addedSourceKeyOf, type Decider, type MessageStore } from "@wirecat/cli-core/store"
import { type Command, InvalidArgumentError } from "commander"
import { answers, itemAnswer, listAnswer, withStore } from "../answer.js"
import { byOption, reasonOption, whoRuns } from "../author.js"
import { loadConfig } from "../config.js"
import { searchModelPresent } from "../notes/embed.js"
import { collect } from "../options.js"
import { subjectOf } from "../people/subject.js"
import { refuseBareNumber } from "../refs.js"
import { dropCopy, keepCopy } from "./copy.js"
import { namedIn } from "./mentions.js"
import { argumentKind, readFile, readPage, readText, SOURCE_TEXT_CHARS, withNextStep } from "./read.js"
import { type ReaderDeps, readerCommands } from "./suggest-command.js"

const SUBJECT_HELP =
  "who or what it is about: person:, organization:, project:, task:, meeting:, or <messenger>:<name or id>; repeat for more"

const TEXT_BYTES = 16_384
const MAX_TEXT_BYTES = 1_048_576

const between = (low: number, high: number, what: string) => (value: string) => {
  const number = Number(value)
  if (!Number.isInteger(number) || number < low || number > high)
    throw new InvalidArgumentError(`${what}: a whole number, ${low} to ${high}`)
  return number
}

/** The text cut at a character, so its UTF-8 form is at most `bytes`. */
const boundedText = (text: string, bytes: number) => {
  const encoded = Buffer.from(text)
  if (encoded.byteLength <= bytes) return { text, truncated: false }
  let cut = encoded.subarray(0, bytes).toString("utf8")
  if (cut.endsWith("�")) cut = cut.slice(0, -1)
  return { text: cut, truncated: true }
}

const documentRef = async (store: MessageStore, reference: string) => {
  await refuseBareNumber(store, reference, ["document"])
  const ref = reference.trim()
  if (!/^document:[1-9]\d*$/.test(ref))
    throw new CliError("validation_error", `${reference} is not a source; give its document:<id>`, {
      reason: "input.invalid",
    })
  return ref
}

const isAgentServer = (command: Command, env: NodeJS.ProcessEnv) =>
  environmentOf(command).agent !== undefined || env.AI_AGENT === "memo-mcp"

/** Every findings batch whose evidence cites `ref`; the store lists batches by project only, so all are read. */
const batchesCiting = async (store: MessageStore, ref: string) => {
  const found: { id: string; status: string; findings: string[] }[] = []
  for (let offset = 0; ; offset += 50) {
    const page = await store.evidenceFindings.list({ limit: 50, offset })
    for (const batch of page.items) {
      const findings = batch.input.findings
        .filter((finding) => finding.evidence.some((evidence) => evidence.reference === ref))
        .map((finding) => finding.id)
      if (findings.length > 0) found.push({ id: batch.id, status: batch.status, findings })
    }
    if (!page.hasMore) return found
  }
}

const citing = async (store: MessageStore, ref: string) => {
  const links = await store.notes.links({ to: ref, kind: "evidence" })
  const of = (type: string) => [...new Set(links.flatMap(({ from }) => (from.startsWith(`${type}:`) ? [from] : [])))]
  return { facts: of("fact"), memories: of("memory") }
}

interface AddOptions {
  title?: string
  subject?: string[]
  keepCopy?: boolean
  maxChars?: number
  reason?: string
  asOwner?: boolean
  json?: boolean
}

export const sourcesCommand = (
  program: Command,
  streams: Streams,
  env: NodeJS.ProcessEnv,
  { fetch, readers = {} }: { fetch?: FetchPageOptions; readers?: ReaderDeps } = {},
): void => {
  const { print, run } = answers(program, streams, env)
  const sources = program
    .command("sources")
    .summary("files, web pages and text you add by hand")
    .description("sources you add by hand: pasted text, a file or a web page, kept as searchable documents")

  byOption(
    reasonOption(
      annotate(sources.command("add"), { effects: FETCH, output: { entity: "added_source" } })
        .summary("keep a file, a web page or pasted text as a document")
        .description(
          "keep a file, a web page or pasted text as a document of its own; only its text is kept unless --keep-copy",
        ),
    ),
  )
    .argument("<source>", "a file's path, an http(s) address, or - to read the text from stdin")
    .option("--title <title>", "a title; otherwise the page's or file's own, or the text's first line")
    .option("--subject <ref>", SUBJECT_HELP, collect)
    .option("--keep-copy", "also keep a copy of the file in memo's data folder, so it opens after the file is gone")
    .option(
      "--max-chars <n>",
      `most characters of text to keep, up to ${MAX_TEXT_CHARS} (default ${SOURCE_TEXT_CHARS})`,
      between(1, MAX_TEXT_CHARS, "--max-chars"),
    )
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (given: string, options: AddOptions, command: Command) => {
      const kind = argumentKind(given)
      if (isAgentServer(command, env) && kind !== "text")
        throw new CliError("permission_error", "over MCP a source is added as text only, never from a path or a link")
      if (options.keepCopy && kind !== "path")
        throw new CliError("validation_error", "--keep-copy keeps a file; a link or pasted text keeps its text only", {
          reason: "input.invalid",
          param: "keep_copy",
        })
      const maxChars = options.maxChars ?? SOURCE_TEXT_CHARS
      const who = await whoRuns(command, env, { asOwner: options.asOwner, question: "add this source as yours?" })
      const by: Decider =
        who === "owner" ? "owner" : { bot: who.bot, reason: options.reason?.trim() || "memo sources add" }
      const read = await (kind === "text"
        ? readText(environmentOf(command).stdin ?? process.stdin, { maxChars })
        : kind === "url"
          ? readPage(given, { maxChars, ...(fetch ? { fetch } : {}) })
          : readFile(given, { maxChars })
      ).catch((error: unknown) => {
        throw withNextStep(error)
      })
      const content: AddedSourceContent = {
        kind: read.kind,
        text: read.text,
        url: read.url ?? null,
        ...(read.bytes ? { bytes: read.bytes } : {}),
      }
      const item = await withStore(env, async (store) => {
        const subjects = await Promise.all(
          (options.subject ?? []).map(async (subject) => (await subjectOf(store, subject)).ref),
        )
        let copy: { path: string; wrote: boolean } | undefined
        if (options.keepCopy && read.bytes && (await store.notes.findAddedSource(content)).duplicateOf === null)
          copy = keepCopy(env, addedSourceKeyOf(content).hash, read.bytes)
        let saved: Awaited<ReturnType<MessageStore["notes"]["saveAddedSource"]>>
        try {
          saved = await store.notes.saveAddedSource({
            ...content,
            read: read.read,
            title: options.title?.trim() || read.title,
            fileName: read.fileName ?? null,
            mime: read.mime ?? null,
            size: read.size,
            subjects,
            by,
            ...(copy ? { keepCopy: { path: copy.path } } : {}),
            ...(read.metadata ? { metadata: read.metadata } : {}),
            ...(read.sections ? { sections: read.sections } : {}),
          })
        } catch (error) {
          if (copy?.wrote) dropCopy(env, copy.path)
          throw error
        }
        if (copy?.wrote && saved.duplicateOf !== null) dropCopy(env, copy.path)
        const text = read.read === "extracted"
        // A source stored before keeps the text of its first read; this read's cut says nothing about it.
        const same = saved.duplicateOf === null && saved.note.text === read.text.trim()
        return {
          ref: saved.note.ref,
          created: saved.created,
          duplicateOf: saved.duplicateOf,
          title: saved.note.title,
          kind: read.kind,
          mime: read.mime ?? null,
          bytes: read.size,
          chars: saved.note.text.length,
          truncated: same ? read.truncated : null,
          extractor: read.extractor,
          read: read.read,
          url: read.url ?? null,
          kept: saved.kept,
          searchable: {
            words: text,
            meaning: text && searchModelPresent(env) && loadConfig(env).notes?.embed !== false,
          },
          subjects: saved.subjects,
        }
      })
      print(
        options.json,
        itemAnswer(item),
        [
          `${item.ref}${item.duplicateOf ? "  already stored: only its subjects were added" : item.created ? "  added" : "  already added"}`,
          `  ${item.title ?? ""}  ${item.kind}${item.mime ? ` · ${item.mime}` : ""} · ${item.chars} characters${item.truncated === true ? " (only the first part is kept)" : ""}`,
          `  kept: ${item.kept === "copy" ? "its text and a copy of the file" : item.kept === "text" ? "its text" : "nothing new"}`,
          `  search: ${item.searchable.words ? "by words" : "by its title and subjects only"}${item.searchable.meaning ? " and by meaning after memo sync" : ""}`,
          ...(item.subjects.length ? [`  about: ${item.subjects.join(", ")}`] : []),
        ].join("\n"),
      )
    })

  annotate(sources.command("show"), { effects: LOCAL_READ, output: { entity: "source_detail" } })
    .summary("one source: its text, what is kept, and what cites it")
    .description("one source: its text, what is kept, what it is about, and the facts, memories and batches citing it")
    .argument("<ref>", "document:<id>, as sources add answered")
    .option(
      "--bytes <bytes>",
      `most UTF-8 bytes of its text, up to ${MAX_TEXT_BYTES} (default ${TEXT_BYTES})`,
      between(1, MAX_TEXT_BYTES, "--bytes"),
    )
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((reference: string, options: { bytes?: number; json?: boolean }) =>
      run(options.json, async (store) => {
        const ref = await documentRef(store, reference)
        const source = await store.notes.addedSource(ref)
        const note = source?.note ?? (await store.notes.note(ref))
        const { text, truncated } = boundedText(note.text, options.bytes ?? TEXT_BYTES)
        const subjects = (await store.notes.links({ from: ref, kind: "about" })).flatMap(({ to, confirmed }) =>
          to === null ? [] : [{ ref: to, confirmed }],
        )
        return itemAnswer({
          ref,
          title: note.title,
          added: source !== undefined,
          kind: source?.kind ?? null,
          url: source?.url ?? null,
          fileName: source?.fileName ?? null,
          mime: source?.mime ?? null,
          bytes: source?.size ?? null,
          // The row says a copy was kept; only the file itself says it still is.
          kept: source === undefined ? null : source.copy !== null && existsSync(source.copy) ? "copy" : "text",
          chars: note.text.length,
          text,
          textTruncated: truncated,
          createdAt: note.createdAt,
          updatedAt: note.updatedAt,
          subjects,
          ...(await citing(store, ref)),
          batches: await batchesCiting(store, ref),
        })
      }),
    )

  annotate(sources.command("mentions"), { effects: LOCAL_READ, output: { entity: "source_mention" } })
    .summary("known people and organizations named in a source")
    .description("people and organizations memo knows whose names appear in a source's text; nothing leaves")
    .argument("<ref>", "document:<id>")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((reference: string, options: { json?: boolean }) =>
      run(options.json, async (store) => {
        const ref = await documentRef(store, reference)
        const found = await namedIn(store, await store.notes.note(ref))
        return listAnswer("sources mentions", {
          items: found.items,
          limit: Math.max(1, found.items.length),
          has_more: false,
          ...(found.organizationsComplete
            ? {}
            : {
                missing: [
                  {
                    field: "organizations",
                    why: `only the first ${found.organizationsChecked} organizations were matched by name`,
                  },
                ],
              }),
        })
      }),
    )

  byOption(
    annotate(sources.command("remove"), { effects: LOCAL_WRITE, output: { entity: "source_removal" } })
      .summary("remove a source you added, and its kept copy")
      .description(
        "remove a source you added, and its copy if one was kept; the next source check reviews what cites it",
      ),
  )
    .argument("<ref>", "document:<id> of a source you added")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (reference: string, options: { asOwner?: boolean; json?: boolean }, command: Command) => {
      const who = await whoRuns(command, env, { asOwner: options.asOwner, question: "remove this source as you?" })
      const by: Decider = who === "owner" ? "owner" : { bot: who.bot, reason: "memo sources remove" }
      await run(options.json, async (store) => {
        const ref = await documentRef(store, reference)
        const cited = await citing(store, ref)
        const removed = await store.notes.removeAddedSource(ref, by)
        return itemAnswer({
          ref: removed.ref,
          removed: true,
          copyDeleted: removed.copy !== null && dropCopy(env, removed.copy),
          ...cited,
        })
      })
    })

  readerCommands(program, sources, streams, env, readers)
}
