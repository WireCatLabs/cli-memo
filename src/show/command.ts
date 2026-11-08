import { CliError, type Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { parseReference, type RefKindName } from "@wirecat/cli-core"
import { LOCAL_READ, openOf, type ProfilesFor, type RefOpen, type RefSummary } from "@wirecat/cli-core/cli"
import type { MessageStore } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { answers, wholeList, withStore } from "../answer.js"
import { profileFor } from "../knowledge/messenger-sync.js"
import { grantedLevel } from "../mcp/granted.js"
import { refuseBareNumber } from "../refs.js"

const MAX_REFS = 100

/** The kinds a bare number could name: every kind whose store id is a number. */
const NUMBERED = ["note", "document", "person", "organization", "project", "task", "fact", "memory"] as const

/** memo's own read for each kind it holds; a messenger's kinds open in the CLI the provider registry names. */
export const LOCAL_OPENS: Partial<Record<RefKindName, string[]>> = {
  note: ["memo", "notes", "show"],
  document: ["memo", "notes", "show"],
  person: ["memo", "context"],
  organization: ["memo", "organizations", "context"],
  project: ["memo", "projects", "context"],
  task: ["memo", "tasks", "show"],
  fact: ["memo", "facts", "show"],
  memory: ["memo", "memories", "show"],
  message: ["memo", "messages", "show"],
  invoice: ["memo", "invoices", "show"],
  payment: ["memo", "payments", "show"],
  order: ["memo", "orders", "show"],
  deal: ["memo", "deals", "show"],
  lead: ["memo", "leads", "show"],
  pipeline: ["memo", "pipelines", "show"],
}

/** The permission key of the memo command that opens a kind, such as `invoices.show`. */
export const openKeyOf = (kind: string) => LOCAL_OPENS[kind as RefKindName]?.slice(1).join(".")

/**
 * `memo show` tells what the command that opens a reference would, so an MCP client denied that command is refused
 * here too, rather than read the title past it.
 */
const refuseDenied = (command: Command, summaries: readonly Pick<RefSummary, "ref" | "kind">[]) => {
  for (const { ref, kind } of summaries) {
    const key = openKeyOf(kind)
    if (key !== undefined && grantedLevel(command, key) === "deny")
      throw new CliError("permission_error", `${ref}: memo's MCP server denies ${key}`, {
        reason: "access.denied",
        permission: key,
      })
  }
}

/** Titles of these kinds are written by other people: a chat's title, a sender's name, a shared file's name. */
const OTHERS = new Set(["message", "chat", "contact", "email", "email_thread", "document", "event", "meeting", "bot"])

const ACCOUNT_KEY = /^[a-z][a-z-]*:\S+$/

/**
 * cli-core's `tasks show` takes a task's id, not its `task:` ref, and a task from a message lives in that message's
 * account, which it asks for: memo never picks one.
 */
const taskOpen = (summary: RefSummary, open: RefOpen): RefOpen => {
  if (summary.kind !== "task" || open.argv === null) return open
  const argv = [...open.argv.slice(0, -1), summary.ref.slice("task:".length)]
  return {
    ...open,
    argv: summary.in !== null && ACCOUNT_KEY.test(summary.in) ? [...argv, "--source", summary.in] : argv,
  }
}

const shellWord = (word: string) => (/^[\w@%+=:,./<>~-]+$/.test(word) ? word : `'${word.replaceAll("'", "'\\''")}'`)

export interface Shown {
  ref: string
  kind: RefSummary["kind"]
  title: string | null
  in: string | null
  at: string | null
  provider: string | null
  tool: string | null
  state: RefSummary["state"]
  open: RefOpen & { line: string | null }
  untrusted?: string[]
}

const profilesFor =
  (env: NodeJS.ProcessEnv): ProfilesFor =>
  (provider, account) => {
    if (account === null) return { why: `${provider} names no account here`, profiles: [] }
    return (
      profileFor(provider, account, env) ?? { why: `memo cannot read which profiles ${provider} has`, profiles: [] }
    )
  }

/** What each reference names, in the order given, and the command that opens it; never runs that command. */
export const showReferences = async (
  store: MessageStore,
  env: NodeJS.ProcessEnv,
  texts: readonly string[],
  command?: Command,
): Promise<Shown[]> => {
  if (texts.length > MAX_REFS) throw new CliError("validation_error", `at most ${MAX_REFS} references at once`)
  for (const text of texts) await refuseBareNumber(store, text, NUMBERED)
  for (const text of texts) parseReference(text)
  const summaries = await store.refs.summaries(texts)
  if (command !== undefined) refuseDenied(command, [...summaries.values()])
  const ports = { profilesFor: profilesFor(env), local: LOCAL_OPENS }
  return texts.map((text) => {
    const summary = summaries.get(text) ?? {
      ref: text,
      kind: "unknown",
      title: null,
      in: null,
      at: null,
      provider: null,
      account: null,
      tool: null,
      state: "unavailable",
    }
    const open = taskOpen(summary, openOf(summary, ports))
    return {
      ref: summary.ref,
      kind: summary.kind,
      title: summary.title,
      in: summary.in,
      at: summary.at,
      provider: summary.provider,
      tool: summary.tool ?? open.argv?.[0] ?? null,
      state: summary.state,
      open: { ...open, line: open.argv?.map(shellWord).join(" ") ?? null },
      ...(OTHERS.has(summary.kind) ? { untrusted: ["title", "in"] } : {}),
    }
  })
}

const minute = (at: string | null) => (at === null ? null : at.slice(0, 16).replace("T", " "))

const blockOf = (one: Shown): string =>
  [
    `${one.ref}  ${one.title ?? ""}`.trimEnd(),
    `  ${[one.kind, one.in, one.state, minute(one.at)].filter((part) => part !== null).join(" · ")}`,
    `  open: ${one.open.line ?? "none"}`,
    ...(one.open.why === null ? [] : [`        ${one.open.why}`]),
  ].join("\n")

export const showCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const { print } = answers(program, streams, env)
  annotate(program.command("show"), { effects: LOCAL_READ, partial: true })
    .description("what any reference names, and the command that opens it")
    .argument("<ref...>", "1 to 100 references any WireCat CLI printed: chat:, msg:, note:, document:, person:, task:…")
    .option("--json", "print JSON; --json=ref,title keeps only those fields")
    .action(async (refs: string[], options: { json?: boolean }, command: Command) => {
      const items = await withStore(env, (store) => showReferences(store, env, refs, command))
      const gone = items.filter((one) => one.state !== "available")
      const body = wholeList("show", items)
      if (gone.length > 0) {
        body.missing = gone.map((one) => ({ field: "state", why: `${one.ref} is ${one.state}` }))
        body.meta = { ...body.meta, complete: false }
      }
      print(options.json, body, items.map(blockOf).join("\n"))
    })
}
