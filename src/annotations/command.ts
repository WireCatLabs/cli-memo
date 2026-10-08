import { readFileSync } from "node:fs"
import { CliError, createRenderer, type Streams } from "@leemour/cli-core"
import { openStore } from "@leemour/cli-messaging/store"
import type { Command } from "commander"
import { positive } from "../options.js"
import { type AccountScope, selectAccount, selectTarget, type TargetInput } from "../store/scope.js"

interface Options extends TargetInput {
  json?: boolean
  text?: string
  file?: string
  revision?: number
  search?: string
  limit?: number
  offset?: number
}
export const accountOptions = (command: Command) =>
  command
    .option("--provider <provider>", "source provider")
    .option("--account <account>", "exact stored account")
    .option("--json", "print JSON")
export const annotationTargetOptions = (command: Command) =>
  accountOptions(command)
    .option("--message <locator>", "stored message, note or email locator")
    .option("--chat <id>", "chat, document folder or email thread")
    .option("--contact <id>", "account-scoped contact identity")
    .option("--person <uid>", "explicit unified person UID")
    .option("--task <id>", "stable task ID")
    .option("--entity <uid>", "organization, family or project UID")

const body = (options: Options) => {
  if ((options.text === undefined) === (options.file === undefined))
    throw new CliError("validation_error", "give exactly one of --text or --file; --file - reads stdin")
  if (options.text !== undefined) return options.text
  return readFileSync(options.file === "-" ? 0 : (options.file as string), "utf8")
}

export const annotationsCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv) => {
  const group = program
    .command("annotations")
    .description("Your revisioned notes on stored sources; source files and mailboxes stay unchanged")
  const print = (json: boolean | undefined, value: unknown) =>
    json
      ? createRenderer({ format: "json", color: false, streams }).result(value)
      : streams.data(`${JSON.stringify(value, null, 2)}\n`)
  annotationTargetOptions(group.command("add").description("Add an owner-authored annotation"))
    .option("--text <text>", "annotation text")
    .option("--file <path>", "UTF-8 text file, or - for stdin")
    .action(async (options: Options) => {
      const text = body(options),
        store = await openStore({ env })
      try {
        const { key, target } = await selectTarget(store, options)
        print(options.json, await store.knowledge.addAnnotation(key, target, text))
      } finally {
        await store.close()
      }
    })
  annotationTargetOptions(
    group.command("list").description("List or search annotations, including those whose source is missing"),
  )
    .option("--search <text>", "literal substring in user annotation text")
    .option("--limit <n>", "most annotations, at most 500", positive, 100)
    .option("--offset <n>", "skip this many results", Number, 0)
    .action(async (options: Options) => {
      const store = await openStore({ env })
      try {
        const hasTarget = [
          options.message,
          options.chat,
          options.contact,
          options.person,
          options.task,
          options.entity,
        ].some((value) => value !== undefined)
        const selected = hasTarget ? await selectTarget(store, options) : { key: await selectAccount(store, options) }
        print(
          options.json,
          await store.knowledge.annotations(selected.key, {
            ...("target" in selected ? { target: selected.target } : {}),
            ...(options.search === undefined ? {} : { search: options.search }),
            limit: options.limit,
            offset: options.offset,
          }),
        )
      } finally {
        await store.close()
      }
    })
  for (const name of ["show", "edit", "remove"] as const) {
    const command = accountOptions(group.command(name).argument("<id>", "annotation ID"))
    if (name === "edit")
      command
        .requiredOption("--revision <n>", "current revision", positive)
        .option("--text <text>")
        .option("--file <path>")
    command.action(async (id: string, options: Options & AccountScope) => {
      const text = name === "edit" ? body(options) : undefined
      const store = await openStore({ env })
      try {
        const key = await selectAccount(store, options)
        const answer =
          name === "show"
            ? await store.knowledge.annotation(key, id)
            : name === "remove"
              ? await store.knowledge.removeAnnotation(key, id)
              : await store.knowledge.editAnnotation(key, id, text as string, options.revision as number)
        print(options.json, answer)
      } finally {
        await store.close()
      }
    })
  }
}
