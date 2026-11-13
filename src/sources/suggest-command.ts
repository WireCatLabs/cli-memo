import { CliError, type KeyringStore, type Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { type FetchLike, HOST_PATTERN, hostFetch } from "@wirecat/cli-base/http"
import { defineQuery } from "@wirecat/cli-base/query"
import {
  environmentOf,
  FETCH,
  LOCAL_READ,
  LOCAL_WRITE,
  listQuery,
  nativeTerms,
  termField,
  typedQuery,
  withQuery,
} from "@wirecat/cli-core/cli"
import { aiSettingPath, readAiSetting } from "@wirecat/cli-core/documents"
import type { MessageStore } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { answers, itemAnswer, listAnswer, withStore } from "../answer.js"
import { byOption, whoRuns } from "../author.js"
import { loadConfig, updateConfig } from "../config.js"
import { subjectOf } from "../people/subject.js"
import { refuseBareNumber } from "../refs.js"
import { leavesComputer, READER_IDS, READERS, type Reader, type ReaderContext, readerOf } from "./readers/index.js"
import { OLLAMA, ollama, ollamaAddressAllowed } from "./readers/ollama.js"
import { suggestFacts } from "./suggest.js"

const READERS_QUERY = defineQuery({
  entity: "source_reader",
  backend: "native",
  fields: [
    termField("id", "kw", "id:ollama"),
    termField("available", "bool", "available:true"),
    termField("chosen", "bool", "chosen:true"),
  ],
})

const SUBJECT = /^(person|organization|project):[1-9]\d*$|^task:[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/

export interface ReaderDeps {
  /** What the Ollama and API readers reach the network with, behind the host check; a test hands in its own. */
  fetch?: FetchLike
  keyring?: KeyringStore
}

/** The readers' default endpoints, plus the addresses the owner set for Ollama and for the shared AI model. */
const readerHosts = (env: NodeJS.ProcessEnv): string[] => {
  const configured = (read: () => string | undefined) => {
    try {
      const address = read()
      return address === undefined ? [] : [new URL(address).hostname]
    } catch {
      return []
    }
  }
  const hosts = [
    "api.openai.com",
    "api.anthropic.com",
    "127.0.0.1",
    "localhost",
    ...configured(() => loadConfig(env).sources?.base_url),
    ...configured(() => readAiSetting(aiSettingPath(env))?.base_url),
  ]
  return [...new Set(hosts)].filter((host) => HOST_PATTERN.test(host))
}

// A local model can take minutes on one source; hostFetch's 30 s default would cut it off.
const READ_TIMEOUT_MS = 15 * 60_000

const isAgentServer = (command: Command, env: NodeJS.ProcessEnv) =>
  environmentOf(command).agent !== undefined || env.AI_AGENT === "memo-mcp"

const unknownReader = (id: string): never => {
  throw new CliError("validation_error", `${id} is not a reader memo knows; it reads with ${READER_IDS.join(", ")}`, {
    reason: "reader.unknown",
    reader: id,
    readers: READER_IDS,
  })
}

const fixedModel = (reader: Reader) =>
  new CliError(
    "validation_error",
    `${reader.title} reads with the model memo models ai set chose; --model is not taken`,
    {
      reason: "input.invalid",
      param: "model",
    },
  )

/** The reader and model to use: the owner's choice, never a default; only the owner may name another here. */
const chosen = (
  env: NodeJS.ProcessEnv,
  who: "owner" | { bot: string },
  given: { reader?: string | undefined; model?: string | undefined },
): { reader: Reader; model: string | null } => {
  if (who !== "owner" && (given.reader !== undefined || given.model !== undefined))
    throw new CliError("permission_error", "only the owner picks the reader; an agent uses the one the owner chose", {
      reason: "reader.owner-picks",
    })
  const config = loadConfig(env).sources
  const id = given.reader ?? config?.reader
  if (id === undefined)
    throw new CliError(
      "configuration_error",
      `no reader is chosen for sources; the owner picks one of ${READER_IDS.join(", ")} with ` +
        "memo sources readers set <reader>, or names it with --provider",
      { reason: "reader.none-chosen", readers: READER_IDS },
    )
  const reader = readerOf(id) ?? unknownReader(id)
  if (reader.modelOf) {
    if (given.model !== undefined) throw fixedModel(reader)
    return { reader, model: reader.modelOf(env) }
  }
  const model =
    given.model ?? (given.reader === undefined || given.reader === config?.reader ? config?.model : undefined)
  if (reader.needsModel && !model)
    throw new CliError(
      "configuration_error",
      `${reader.title} reads only with a model the owner names: memo sources readers set ${reader.id} --model <model>`,
      { reason: "reader.model-missing" },
    )
  return { reader, model: model ?? null }
}

const documentRef = async (store: MessageStore, reference: string) => {
  await refuseBareNumber(store, reference, ["document", "note"])
  const ref = reference.trim()
  if (!/^(document|note):[1-9]\d*$/.test(ref))
    throw new CliError("validation_error", `${reference} is not a source; give its document:<id>`, {
      reason: "input.invalid",
    })
  return ref
}

export const readerCommands = (
  program: Command,
  sources: Command,
  streams: Streams,
  env: NodeJS.ProcessEnv,
  deps: ReaderDeps = {},
): void => {
  const { print } = answers(program, streams, env)
  const context = (): ReaderContext => ({
    env,
    fetch: hostFetch({
      hosts: readerHosts(env),
      timeoutMs: READ_TIMEOUT_MS,
      ...(deps.fetch ? { fetch: deps.fetch } : {}),
    }),
    ...(deps.keyring ? { keyring: deps.keyring } : {}),
  })

  byOption(
    annotate(sources.command("suggest"), { effects: FETCH, output: { entity: "source_suggestion" } })
      .summary("have the chosen reader propose facts from a source, for you to confirm")
      .description(
        "send a source's text to the reader you chose and stage the facts it finds, each with a quote checked " +
          "against the text, as one batch only you confirm",
      ),
  )
    .argument("<ref>", "document:<id> of the source, as sources add answered")
    .option("--provider <provider>", `read with this reader once: ${READER_IDS.join(", ")}; only you name one`)
    .option("--model <model>", "the reader's model this once; only you may name one")
    .option("--subject <ref>", "who or what every fact is about: person:, organization:, project: or task:")
    .option("--rescan", "read it again although this reader already read this text")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(
      async (
        reference: string,
        options: {
          provider?: string
          model?: string
          subject?: string
          rescan?: boolean
          asOwner?: boolean
          json?: boolean
        },
        command: Command,
      ) => {
        if (isAgentServer(command, env))
          throw new CliError("permission_error", "over MCP an agent cannot send a source's text to a reader")
        const who = await whoRuns(command, env, { asOwner: options.asOwner, question: "read this source as you?" })
        const { reader, model } = chosen(env, who, { reader: options.provider, model: options.model })
        const item = await withStore(env, async (store) => {
          const ref = await documentRef(store, reference)
          const subject = options.subject === undefined ? null : (await subjectOf(store, options.subject)).ref
          if (subject !== null && !SUBJECT.test(subject))
            throw new CliError(
              "validation_error",
              "a suggested fact is about a person:, organization:, project: or task:",
              {
                reason: "input.invalid",
                param: "subject",
              },
            )
          const record = await store.evidenceFindings.citable(ref)
          if (!record) throw new CliError("not_found", `${ref} is not stored`, { reason: "input.invalid" })
          const done = await suggestFacts(store, context(), {
            record,
            reader,
            model,
            subject,
            again: options.rescan === true,
          })
          return {
            ref,
            reader: reader.id,
            model,
            leavesComputer: leavesComputer(reader, env),
            reused: done.reused,
            batch: done.batch?.id ?? null,
            fingerprint: done.batch?.fingerprint ?? null,
            status: done.batch?.status ?? null,
            ownerOnly: done.batch?.ownerOnly ?? true,
            facts: (done.batch?.input.findings ?? []).map((finding) => ({
              id: finding.id,
              type: finding.kind === "fact" ? finding.type : finding.kind,
              statement: finding.kind === "fact" ? finding.statement : null,
              quote: finding.evidence[0]?.quote ?? null,
              subject: finding.subject ?? null,
            })),
            dropped: done.dropped,
          }
        })
        print(
          options.json,
          itemAnswer(item),
          [
            item.batch === null
              ? `${item.ref}  ${reader.title} found no fact the text supports`
              : `${item.ref}  ${item.facts.length} fact${item.facts.length === 1 ? "" : "s"} waiting for you in ` +
                `batch ${item.batch}${item.reused ? " (read before; the reader was not asked again)" : ""}`,
            ...item.facts.map((fact) => `  ${fact.id}  ${fact.statement}\n      "${fact.quote}"`),
            ...(item.dropped.length
              ? [`  dropped ${item.dropped.length}: ${item.dropped.map((d) => d.why).join(", ")}`]
              : []),
            ...(item.batch === null
              ? []
              : [`  confirm: memo actions confirm ${item.batch} [<fact id>…] --fingerprint ${item.fingerprint}`]),
          ].join("\n"),
        )
      },
    )

  const readers = sources
    .command("readers")
    .summary("the readers that can propose facts from a source, and which one you chose")
    .description("the readers that can propose facts from a source: installed, signed in, and which one you chose")

  withQuery(
    annotate(readers.command("list", { isDefault: true }), {
      effects: LOCAL_READ,
      output: { entity: "source_reader" },
    }),
    READERS_QUERY,
  )
    .summary("each reader: installed, signed in, and your pick")
    .description("each reader: installed, signed in, its model, whether the text leaves this computer, and your pick")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (words: string[], options: { json?: boolean }) => {
      const terms = nativeTerms(
        listQuery(typedQuery(words), READERS_QUERY, "sources readers list"),
        "sources readers list",
      )
      const config = loadConfig(env).sources
      const wanted = terms.get("id")?.value
      const all = await Promise.all(
        READERS.filter((reader) => wanted === undefined || reader.id === wanted).map(async (reader) => {
          const probe = await reader.probe(context())
          const picked = config?.reader === reader.id
          return {
            id: reader.id,
            title: reader.title,
            provider: reader.provider,
            available: probe.available,
            signedIn: probe.signedIn,
            version: probe.version,
            model: reader.modelOf ? reader.modelOf(env) : picked ? (config?.model ?? null) : null,
            models: probe.models,
            needsModel: reader.needsModel,
            leavesComputer: leavesComputer(reader, env),
            readsFiles: reader.readsFiles,
            chosen: picked,
            problem: probe.problem,
          }
        }),
      )
      const flag = (name: string) => terms.get(name)?.value
      const items = all.filter(
        (item) =>
          (flag("available") === undefined || String(item.available) === flag("available")) &&
          (flag("chosen") === undefined || String(item.chosen) === flag("chosen")),
      )
      print(
        options.json,
        listAnswer("sources readers list", { items, limit: Math.max(1, items.length), has_more: false }),
        items
          .map(
            (item) =>
              `${item.chosen ? "*" : " "} ${item.id.padEnd(12)} ${item.problem ?? "ready"}` +
              `${item.model ? `  model ${item.model}` : ""}${item.leavesComputer ? "" : "  stays on this computer"}`,
          )
          .join("\n"),
      )
    })

  byOption(
    annotate(readers.command("set"), { effects: LOCAL_WRITE, output: { entity: "source_reader_choice" } })
      .summary("choose the reader that reads your sources")
      .description("choose the reader sources suggest sends a source's text to, and its model; only you choose"),
  )
    .argument("<reader>", READER_IDS.join(", "))
    .option("--model <model>", "its model; Ollama and the API readers need one, Claude Code and Codex use their own")
    .option("--base-url <url>", `Ollama only: its address on this computer, when not ${OLLAMA}`)
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(
      async (
        id: string,
        options: { model?: string; baseUrl?: string; asOwner?: boolean; json?: boolean },
        command: Command,
      ) => {
        if (isAgentServer(command, env))
          throw new CliError("permission_error", "only the owner picks the reader", { reason: "reader.owner-picks" })
        const who = await whoRuns(command, env, { asOwner: options.asOwner, question: `read sources with ${id}?` })
        if (who !== "owner")
          throw new CliError("permission_error", "only the owner picks the reader that reads a source", {
            reason: "reader.owner-picks",
          })
        const reader = readerOf(id) ?? unknownReader(id)
        if (reader.modelOf && options.model !== undefined) throw fixedModel(reader)
        if (reader.needsModel && !options.model?.trim())
          throw new CliError("validation_error", `${reader.title} needs --model <model>`, {
            reason: "reader.model-missing",
            param: "model",
          })
        const baseUrl = options.baseUrl?.trim().replace(/\/+$/, "") || undefined
        if (baseUrl !== undefined && reader.id !== ollama.id)
          throw new CliError("validation_error", "--base-url is for the ollama reader", { param: "base-url" })
        if (baseUrl !== undefined && !ollamaAddressAllowed(baseUrl))
          throw new CliError("validation_error", "Ollama is read only on this computer: give http://127.0.0.1:<port>", {
            reason: "reader.address-refused",
            param: "base-url",
          })
        const model = options.model?.trim() || undefined
        updateConfig(
          (config) => ({
            ...config,
            sources: { reader: reader.id, ...(model ? { model } : {}), ...(baseUrl ? { base_url: baseUrl } : {}) },
          }),
          env,
        )
        print(
          options.json,
          itemAnswer({
            reader: reader.id,
            model: model ?? null,
            base_url: baseUrl ?? null,
            leavesComputer: leavesComputer(reader, env),
            readsFiles: reader.readsFiles,
          }),
          `sources are read with ${reader.title}${model ? ` (${model})` : ""}`,
        )
      },
    )
}
