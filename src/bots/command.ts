import { CliError, type Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import type { QueryRegistry } from "@wirecat/cli-base/query"
import { LOCAL_READ, LOCAL_WRITE, queryTerms, termField, withQuery } from "@wirecat/cli-core/cli"
import { type IdentityRef, SENDER_BOT_PREFIX, senderBotRef } from "@wirecat/cli-core/store"
import { BOT_SENDS, type BotMove, type BotSends, type SenderBot } from "@wirecat/cli-core/store/areas"
import type { Command } from "commander"
import { answers, itemAnswer, listAnswer, withStore } from "../answer.js"
import { byOption } from "../author.js"
import { oneOf, positive } from "../options.js"
import { withOwner } from "../people/owner.js"
import { asOwner } from "../people/proposal-rows.js"
import { groupOf } from "../store/group.js"

const botRow = (bot: SenderBot) => ({
  ref: bot.bot,
  name: bot.name,
  display_name: bot.displayName,
  organization: bot.organization,
  author: bot.author,
  reason: bot.reason,
  identities: bot.identities.map(({ provider, id, name, username }) => ({
    identity: `${provider}:${id}`,
    name,
    username,
  })),
  messages_from: bot.messagesFrom,
  last_contact: bot.lastContact,
  reach: bot.reach,
  signals: bot.signals,
})

const moveRow = (move: BotMove) => ({
  identity: `${move.identity.provider}:${move.identity.id}`,
  from: move.from,
  to: move.to,
  author: move.author,
  reason: move.reason,
  at: move.at,
})

// The store counts a bot's messages over every account, so a group's run would see more than its group (WC-ACCT-13).
const refuseInGroup = (env: NodeJS.ProcessEnv, command: string) => {
  const group = groupOf(env)
  if (group !== undefined)
    throw new CliError("validation_error", `${command} reads every account; run it without group ${group.name}`, {
      reason: "bots.whole-store",
    })
}

// `sender-bot:<id>` is what wcat printed before cli-core 2.0; it still names the bot.
const BOT = /^(bot|sender-bot):[1-9]\d*$/
const PERSON = /^person:([1-9]\d*|me)$/
const IDENTITY = /^([a-z][a-z0-9-]*):(.+)$/

/**
 * Exactly what the owner typed: a move takes a whole history, so a name never resolves to the nearest sender. A bare
 * address is a mail identity.
 */
const subjectOf = (typed: string): string | IdentityRef => {
  const text = typed.trim()
  if (BOT.test(text)) return senderBotRef(text)
  if (PERSON.test(text)) return text
  if (!text.includes(":") && text.includes("@")) return { provider: "email", id: text.toLowerCase() }
  const match = IDENTITY.exec(text)
  if (match === null)
    throw new CliError(
      "validation_error",
      `"${typed}" is not ${SENDER_BOT_PREFIX}<id>, person:<uid>, an address or <messenger>:<id>`,
      { reason: "identity.no-messenger", param: "who" },
    )
  const [, provider = "", id = ""] = match
  return { provider, id: provider === "email" ? id.toLowerCase() : id }
}

const shownAs = (subject: string | IdentityRef) =>
  typeof subject === "string" ? subject : `${subject.provider}:${subject.id}`

const KINDS = ["bot", "person"] as const

export const botsCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const { print } = answers(program, streams, env)
  const bots = program
    .command("bots")
    .description(
      "programs that write to you, apart from people: no-reply and alert addresses, a service's mail, a messenger's " +
        "bot. Not agents (agents list)",
    )
    .summary("programs that write to you, apart from people")

  const query = {
    entity: "sender_bot",
    backend: "native",
    fields: [
      termField("name", "txt", "name:shop"),
      termField("organization", "ref", 'organization:"organization:3"'),
      termField("type", "enum", "type:receipts", { values: Object.keys(BOT_SENDS) }),
    ],
  } as const satisfies QueryRegistry
  withQuery(
    annotate(bots.command("list"), { effects: LOCAL_READ })
      .summary("the bots, by name")
      .description(
        "the bots, by name: each with its identities, its organization, who sorted it (rules or you), its reach and " +
          "the messages and mail it sent. type: is what a bot sends: alerts (security codes, sign-in and system " +
          "alerts, account notices), receipts (orders, bills, shipping), newsletters, marketing, or messenger (a bot " +
          "in a messenger)",
      ),
    query,
  )
    .option("--limit <n>", "most bots on a page, up to 5000", positive, 500)
    .option("--page <n>", "which page, from 1", positive, 1)
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (words: string[], options: { limit: number; page: number; json?: boolean }) => {
      refuseInGroup(env, "bots list")
      const terms = queryTerms(words, query, "bots list")
      const name = terms.get("name")
      const organization = terms.get("organization")
      const type = terms.get("type") as BotSends | undefined
      const limit = Math.min(options.limit, 5000)
      const found = await withStore(env, (store) =>
        store.people.listBots({
          limit,
          offset: (options.page - 1) * limit,
          ...(name === undefined ? {} : { query: name }),
          ...(organization === undefined ? {} : { organization }),
          ...(type === undefined ? {} : { sends: [type] }),
        }),
      )
      print(
        options.json,
        listAnswer("bots list", {
          items: found.items.map(botRow),
          limit,
          has_more: found.hasMore,
          page: options.page,
          total: { value: found.total, relation: "eq" as const },
          args: words.length ? { query: words.join(" ") } : {},
        }),
      )
    })

  annotate(bots.command("show"), { effects: LOCAL_READ })
    .summary("one bot with every move to or from it")
    .description(
      "one bot: its identities, organization and counts, and every move between it and a person, oldest first",
    )
    .argument("<bot>", `${SENDER_BOT_PREFIX}<id> as bots list prints it`)
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (bot: string, options: { json?: boolean }) => {
      refuseInGroup(env, "bots show")
      const shown = await withStore(env, (store) => store.people.showBot(bot.trim()))
      const row = { ...botRow(shown), moves: shown.moves.map(moveRow) }
      print(
        options.json,
        itemAnswer(row),
        [
          `${row.ref} ${row.display_name ?? ""}`.trim(),
          ...(row.organization ? [`  organization: ${row.organization}`] : []),
          ...row.identities.map(({ identity, name }) => `  ${identity}${name ? `  ${name}` : ""}`),
          ...row.moves.map(
            ({ identity, from, to, author, at }) =>
              `  moved ${identity}: ${from ?? "none"} → ${to ?? "none"} by ${author}, ${at.slice(0, 10)}`,
          ),
        ].join("\n"),
      )
    })

  byOption(
    annotate(bots.command("move"), { effects: LOCAL_WRITE })
      .summary("say a sender is a program or a person, for its whole history; only you")
      .description(
        "your word that a sender is a program (--kind bot) or a person (--kind person). Its whole history moves, past " +
          "and future: every message and mail it sent stays where it is and now counts for the bot or the person, and " +
          "no rule moves it back. The move is logged in bots show; moving it the other way undoes it, and a person " +
          "moved back keeps their person:<uid>. Only you, never an agent",
      )
      .argument(
        "<who>",
        `${SENDER_BOT_PREFIX}<id>, person:<uid>, an address, or <messenger>:<id> exactly as people show prints it`,
      )
      .requiredOption("--kind <kind>", "what the sender is: bot or person", oneOf(KINDS))
      .option(
        "--into <id>",
        `the ${SENDER_BOT_PREFIX}<id> or person:<uid> it joins, instead of a bot of its own or the person it came from`,
      )
      .option("--name <name>", "with --kind bot: what to call a new bot")
      .option("--reason <text>", "why, kept in the move log"),
  )
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(
      async (
        who: string,
        options: {
          kind: (typeof KINDS)[number]
          into?: string
          name?: string
          reason?: string
          json?: boolean
        },
        command: Command,
      ) => {
        refuseInGroup(env, "bots move")
        const into = options.into?.trim()
        if (into !== undefined && !(options.kind === "bot" ? BOT : PERSON).test(into))
          throw new CliError(
            "validation_error",
            `--kind ${options.kind} joins a ${options.kind === "bot" ? `${SENDER_BOT_PREFIX}<id>` : "person:<uid>"}`,
            { param: "into" },
          )
        if (options.kind === "person" && options.name !== undefined)
          throw new CliError("validation_error", "--name goes with --kind bot", { param: "name" })
        const subject = subjectOf(who)
        const by = await asOwner(command, env, `move ${shownAs(subject)} and its whole history to a ${options.kind}?`)
        const reason = options.reason?.trim()
        const moved = await withStore(env, async (store) => {
          const who = typeof subject === "string" ? await withOwner(store, subject) : subject
          if (options.kind === "bot") {
            const bot = await store.people.moveToBot(who, by, {
              ...(into === undefined ? {} : { bot: into }),
              ...(options.name === undefined ? {} : { name: options.name }),
              ...(reason ? { reason } : {}),
            })
            return { ref: bot.bot, name: bot.displayName ?? bot.name }
          }
          const person = await store.people.moveToPerson(who, by, {
            ...(into === undefined ? {} : { person: into }),
            ...(reason ? { reason } : {}),
          })
          return { ref: `person:${person.uid}`, name: person.displayName ?? person.name ?? null }
        })
        const row = { moved: shownAs(subject), kind: options.kind, ref: moved.ref, name: moved.name, history: "whole" }
        const back = options.kind === "bot" ? "person" : "bot"
        print(
          options.json,
          itemAnswer(row),
          `moved ${row.moved} to ${row.ref}${row.name ? ` (${row.name})` : ""} with its whole history, past and ` +
            `future; wcat bots move ${row.ref} --kind ${back} moves it back`,
        )
      },
    )
}
