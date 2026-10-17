import { CliError, type Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { parseLucene, validateQuery } from "@wirecat/cli-base/query"
import { LOCAL_READ, LOCAL_WRITE, queryHelp } from "@wirecat/cli-core/cli"
import { MENTION_QUERY, type MessageStore } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { answers, itemAnswer, listAnswer, withStore } from "../answer.js"
import { authorOf, byOption } from "../author.js"
import { positive } from "../options.js"
import { SOURCE_HELP, type SourceList, sourceListOf } from "../store/source-list.js"

type Found = Awaited<ReturnType<MessageStore["sourceMentions"]["list"]>>["items"][number]

type Mail = SourceList["mail"]

const mailOf = async (store: MessageStore, env: NodeJS.ProcessEnv, source: string | undefined): Promise<Mail> =>
  source === undefined ? [] : (await sourceListOf(store, env, source)).mail

const line = ({ id, kind, value, status, source }: Found) =>
  `${id}  ${source.at ?? "-"}  ${kind}  ${value}  ${status}  ${source.type}:${source.id}` +
  (source.title ? `  ${source.title}` : "") +
  (source.from ? `  from ${source.from}` : "")

const withSource = (command: Command, what: string) =>
  command.option("--source <accounts>", what).option("--json", "print JSON; --json=id,title keeps only those fields")

const SCOPE = "the mailboxes a mail mention may be in: email:<account>, email or group:<name>"

const idArgument = (command: Command) => command.argument("<id>", "the mention's id, from memo mentions list", positive)

interface Options {
  source?: string
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

  annotate(mentions.command("list"), { effects: LOCAL_READ, query: MENTION_QUERY })
    .description("the mentions in the texts --source names matching the query, newest text first")
    .argument("[query...]", "fields below; a bare word is a value")
    .requiredOption("--source <accounts>", SOURCE_HELP)
    .option("--limit <n>", "most mentions", positive, 100)
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .addHelpText("after", queryHelp(MENTION_QUERY))
    .action(async (words: string[], options: { source: string; limit: number; json?: boolean }) => {
      const text = words.join(" ").trim()
      const query = text
        ? validateQuery(parseLucene(text, { ...MENTION_QUERY, defaultField: "value" }), MENTION_QUERY)
        : undefined
      const { found, read } = await withStore(env, async (store) => {
        const list = await sourceListOf(store, env, options.source)
        const kinds = [
          ...(list.mail.length > 0 ? (["email"] as const) : []),
          ...(list.notes ? (["note"] as const) : []),
          ...(list.documents ? (["document"] as const) : []),
        ]
        const window = { limit: options.limit, offset: 0 }
        const pages = await Promise.all(
          kinds.map((kind) => store.sourceMentions.list(kind, query, window, kind === "email" ? list.mail : [])),
        )
        const read = [
          ...list.mail.map(({ provider, account }) => `${provider}:${account}`),
          ...(list.notes ? ["notes:internal"] : []),
          ...(list.documents ? ["documents"] : []),
        ]
        return { found: pages, read }
      })
      const all = found
        .flatMap((page) => page.items)
        .sort((a, b) => (b.source.at ?? "").localeCompare(a.source.at ?? ""))
      const items = all.slice(0, options.limit)
      print(
        options.json,
        listAnswer("mentions list", {
          items,
          limit: options.limit,
          has_more: all.length > options.limit || found.some((page) => page.hasMore),
          args: { query: text, source: options.source },
          meta: { accounts: read },
        }),
        [...items.map(line), `read: ${read.join(", ") || "nothing"}`].join("\n"),
      )
    })

  idArgument(
    withSource(
      annotate(mentions.command("show"), { effects: LOCAL_READ })
        .summary("one mention, the text around it, and who it may be")
        .description("one mention, the text around it, how many other places hold its value, and who it may be"),
      SCOPE,
    ),
  ).action(async (id: number, options: Options) => {
    const found = await withStore(env, async (store) =>
      store.sourceMentions.show(id, await mailOf(store, env, options.source)),
    )
    if (!found)
      throw new CliError(
        "not_found",
        `no mention ${id} in a document, a note or the mail named; a mail one needs --source email:<account>`,
      )
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
      withSource(
        annotate(mentions.command("confirm"), { effects: LOCAL_WRITE })
          .summary("say what a mention is, everywhere its value is written")
          .description(
            "say what a mention is: a phone's owner everywhere it is written, the stored document, who a name means",
          ),
        SCOPE,
      ),
    ),
  )
    .argument("[person]", "person:<uid> or organization:<id> that owns the phone or address, or a name means")
    .action((id: number, person: string | undefined, options: Options) =>
      run(options.json, async (store) =>
        itemAnswer(
          await store.sourceMentions.confirm(id, person, decider(options), await mailOf(store, env, options.source)),
        ),
      ),
    )

  byOption(
    idArgument(
      withSource(
        annotate(mentions.command("reject"), { effects: LOCAL_WRITE })
          .summary("dismiss a mention's value everywhere, and on later imports")
          .description(
            "not a real mention: dismiss its value everywhere and on later imports; a name only where it is",
          ),
        SCOPE,
      ),
    ),
  ).action((id: number, options: Options) =>
    run(options.json, async (store) =>
      itemAnswer(await store.sourceMentions.reject(id, decider(options), await mailOf(store, env, options.source))),
    ),
  )
}
