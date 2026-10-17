import { CliError, type Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { parseLucene, type QueryRegistry, validateQuery } from "@wirecat/cli-base/query"
import { LOCAL_READ, LOCAL_WRITE, queryHelp, termField } from "@wirecat/cli-core/cli"
import type { MessageStore } from "@wirecat/cli-core/store"
import { Argument, type Command } from "commander"
import { answers, itemAnswer, listAnswer, withStore } from "../answer.js"
import { authorOf, byOption } from "../author.js"
import { loadConfig } from "../config.js"
import { mailAccounts } from "../mail/accounts.js"
import { collect, positive } from "../options.js"

const SOURCES = ["document", "note", "email"] as const
type Source = (typeof SOURCES)[number]
type Mail = { provider: string; account: string }[]
type Found = Awaited<ReturnType<MessageStore["sourceMentions"]["list"]>>["items"][number]

// cli-core's registry is not exported from `./store`; the store reads these same four fields.
export const MENTION_QUERY = {
  entity: "mention",
  backend: "sql",
  fields: [
    termField("kind", "kw", "kind:phone"),
    termField("status", "kw", "status:found"),
    termField("domain", "kw", "domain:google.com", {
      relation: "the site of a link or an address; docs.google.com means google.com",
    }),
    termField("value", "kw", 'value:"+79000000001"', {
      relation: "the value as it is stored: a phone as +7…, a lower-case address, a link without tracking",
    }),
  ],
} as const satisfies QueryRegistry

const configured = (env: NodeJS.ProcessEnv) => loadConfig(env).mail?.accounts ?? []

const mailOf = (env: NodeJS.ProcessEnv, names: string[] | undefined): Mail =>
  names === undefined
    ? []
    : mailAccounts(configured(env), names).map(({ address }) => ({ provider: "email", account: address.toLowerCase() }))

/** Mail is read only from the accounts named, never every mailbox by default. */
const namedMail = (env: NodeJS.ProcessEnv, names: string[] | undefined): Mail => {
  if (names !== undefined) return mailOf(env, names)
  const choices = configured(env)
    .map(({ name }) => name)
    .join(", ")
  throw new CliError("validation_error", `mail mentions need --account: one of ${choices || "none in mail.accounts"}`, {
    reason: "mail.account-required",
  })
}

const line = ({ id, kind, value, status, source }: Found) =>
  `${id}  ${source.at ?? "-"}  ${kind}  ${value}  ${status}  ${source.type}:${source.id}` +
  (source.title ? `  ${source.title}` : "") +
  (source.from ? `  from ${source.from}` : "")

const withAccount = (command: Command) =>
  command
    .option(
      "--account <account>",
      "mail only: an account to read, by name in mail.accounts or address; repeatable",
      collect,
    )
    .option("--json", "print JSON; --json=id,title keeps only those fields")

const idArgument = (command: Command) => command.argument("<id>", "the mention's id, from memo mentions list", positive)

interface Options {
  account?: string[]
  json?: boolean
  asOwner?: boolean
}

export const mentionsCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const { print, run } = answers(program, streams, env)
  const decider = (options: Options) => {
    const author = authorOf(env, options.asOwner)
    return { by: author === "owner" ? "owner" : author.bot }
  }
  const mentions = program
    .command("mentions")
    .description("phones, e-mail, links, names and addresses in documents, notes and mail")

  withAccount(
    annotate(mentions.command("list"), { effects: LOCAL_READ, query: MENTION_QUERY }).description(
      "the mentions in one kind of text matching the query, newest text first",
    ),
  )
    .addArgument(new Argument("<source>", "the kind of text").choices(SOURCES))
    .argument("[query...]", "fields below; a bare word is a value")
    .option("--limit <n>", "most mentions", positive, 100)
    .addHelpText("after", queryHelp(MENTION_QUERY))
    .action(async (source: Source, words: string[], options: Options & { limit: number }) => {
      const mail = source === "email" ? namedMail(env, options.account) : []
      const text = words.join(" ").trim()
      const query = text
        ? validateQuery(parseLucene(text, { ...MENTION_QUERY, defaultField: "value" }), MENTION_QUERY)
        : undefined
      const page = await withStore(env, (store) =>
        store.sourceMentions.list(source, query, { limit: options.limit, offset: 0 }, mail),
      )
      print(
        options.json,
        listAnswer("mentions list", {
          items: page.items,
          limit: options.limit,
          has_more: page.hasMore,
          args: { query: text },
        }),
        page.items.map(line).join("\n"),
      )
    })

  idArgument(
    withAccount(
      annotate(mentions.command("show"), { effects: LOCAL_READ })
        .summary("one mention, the text around it, and who it may be")
        .description("one mention, the text around it, how many other places hold its value, and who it may be"),
    ),
  ).action(async (id: number, options: Options) => {
    const found = await withStore(env, (store) => store.sourceMentions.show(id, mailOf(env, options.account)))
    if (!found)
      throw new CliError("not_found", `no mention ${id} in a document, a note or the mail named; mail needs --account`)
    print(
      options.json,
      itemAnswer(found),
      `${line(found)}\n…${found.before}[${found.written}]${found.after}…\n` +
        `same ${found.kind} in ${found.sameValue} other place${found.sameValue === 1 ? "" : "s"}` +
        (found.candidates.length > 0 ? `\nmay be ${found.candidates.join(", ")}` : ""),
    )
  })

  byOption(
    idArgument(
      withAccount(
        annotate(mentions.command("confirm"), { effects: LOCAL_WRITE })
          .summary("say what a mention is, everywhere its value is written")
          .description(
            "say what a mention is: a phone's owner everywhere it is written, the stored document, who a name means",
          ),
      ),
    ),
  )
    .argument("[person]", "person:<uid> or organization:<id> that owns the phone or address, or a name means")
    .action((id: number, person: string | undefined, options: Options) =>
      run(options.json, async (store) =>
        itemAnswer(await store.sourceMentions.confirm(id, person, decider(options), mailOf(env, options.account))),
      ),
    )

  byOption(
    idArgument(
      withAccount(
        annotate(mentions.command("reject"), { effects: LOCAL_WRITE })
          .summary("dismiss a mention's value everywhere, and on later imports")
          .description(
            "not a real mention: dismiss its value everywhere and on later imports; a name only where it is",
          ),
      ),
    ),
  ).action((id: number, options: Options) =>
    run(options.json, async (store) =>
      itemAnswer(await store.sourceMentions.reject(id, decider(options), mailOf(env, options.account))),
    ),
  )
}
