import { CliError, type Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { LOCAL_READ, LOCAL_WRITE } from "@wirecat/cli-core/cli"
import { parseProposalIds } from "@wirecat/cli-core/services"
import { IDENTITY_LINK_KIND, IDENTITY_SPLIT_KIND, type MessageStore, type Refusal } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { answers, itemAnswer, listAnswer, withStore } from "../answer.js"
import { byOption } from "../author.js"
import { oneOf, positive } from "../options.js"
import { decidedText, decisionOf } from "../review/review.js"
import { reviewOf } from "../store/guard.js"
import { asOwner, PROPOSAL_KINDS, type ProposalKindWord, summaryOf, waiting } from "./proposal-rows.js"

const PEOPLE_KINDS: readonly string[] = [IDENTITY_LINK_KIND, IDENTITY_SPLIT_KIND]

const limitOf = (limit: number): number => {
  if (limit > 500) throw new CliError("validation_error", "--limit takes 1–500", { param: "limit" })
  return limit
}

/** Only the people review's own proposals; any other id is refused on its own, so the rest are still decided. */
const peopleIds = async (store: MessageStore, ids: string[]): Promise<{ ids: string[]; refused: Refusal[] }> => {
  const kept: string[] = []
  const refused: Refusal[] = []
  for (const id of ids) {
    const kind = await store.proposedActions.get(id).then(
      (action) => action.kind,
      () => undefined,
    )
    if (kind === undefined)
      refused.push({ id, code: "not_found", reason: "proposal.not-found", message: `no proposal ${id}` })
    else if (!PEOPLE_KINDS.includes(kind))
      refused.push({
        id,
        code: "validation_error",
        reason: "proposal.not-people",
        message: `${id} is a ${kind} proposal; memo review decides it`,
      })
    else kept.push(id)
  }
  return { ids: kept, refused }
}

/**
 * The owner's answers besides confirm and reject: one address is a company's (NEED-2528), or both people are the
 * company's mailboxes (NEED-2573).
 */
const RESOLVE_ANSWERS = ["company", "organization"] as const

const organizationOf = (word: string | undefined): number | undefined => {
  if (word === undefined) return undefined
  const id = /^(?:organization:)?(\d+)$/.exec(word)?.[1]
  if (id === undefined)
    throw new CliError("validation_error", `${word} is not an organization; it looks like organization:12`, {
      param: "organization",
    })
  return Number(id)
}

interface DecideOptions {
  kind: ProposalKindWord
  limit: number
  yes?: boolean
  reason?: string
  json?: boolean
}

/** The matches and splits waiting for the owner, and the owner's answer to one, several or all of them. */
export const peopleProposalCommands = (
  people: Command,
  program: Command,
  streams: Streams,
  env: NodeJS.ProcessEnv,
): void => {
  const { print } = answers(program, streams, env)

  annotate(people.command("review"), { effects: LOCAL_READ })
    .summary("people that may be one, and splits an agent proposed, waiting for you")
    .description(
      "what waits for the owner about who is who: matches (people that may be one) and splits (identities an agent " +
        "says are not this person), highest score first, then newest; people confirm or people reject answers them, " +
        "and people resolve company answers a match on a shared mailbox",
    )
    .option("--kind <kind>", `${PROPOSAL_KINDS.join(", ")} (default all)`, oneOf(PROPOSAL_KINDS), "all")
    .option("--limit <n>", "most proposals, up to 500", positive, 50)
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (options: { kind: ProposalKindWord; limit: number; json?: boolean }) => {
      const limit = limitOf(options.limit)
      const found = await withStore(env, (store) => waiting(store, { kind: options.kind, limit }))
      print(
        options.json,
        listAnswer("people review", { items: found.items, limit, has_more: found.hasMore }),
        [
          ...found.items.map((row) => `${row.id}  ${summaryOf(row)}${row.reason ? ` — ${row.reason}` : ""}`),
          ...(found.hasMore ? [`more wait: --limit ${Math.min(500, limit * 2)}`] : []),
        ].join("\n") || "nothing about people waits for you",
      )
    })

  for (const name of ["confirm", "reject"] as const) {
    const confirm = name === "confirm"
    const command = byOption(
      annotate(people.command(name), { effects: LOCAL_WRITE })
        .summary(
          confirm
            ? "confirm matches and splits by id, or all that people review lists; only you"
            : "turn down matches and splits by id, or all that people review lists; only you",
        )
        .description(
          confirm
            ? "confirm matches (the people become one) and splits (the identities leave their person) by id or range " +
                "as people review lists them, or `all` of what it lists with the same --kind and --limit; each is " +
                "decided on its own, so a refusal leaves the others decided. `all` shows what it would do until --yes"
            : "turn down matches and splits by id or range, or `all` of what people review lists; a turned-down match " +
                "comes back only on new evidence, a turned-down split not while its identities stay on that person. " +
                "`all` shows what it would do until --yes",
        )
        .argument("<ids...>", "ids or ranges as people review lists them (17080 17082-17085), or all"),
    )
      .option("--kind <kind>", `with all: ${PROPOSAL_KINDS.join(", ")} (default all)`, oneOf(PROPOSAL_KINDS), "all")
      .option("--limit <n>", "with all: as many as people review lists, up to 500", positive, 50)
      .option("--yes", "with all: do it, not only show what would be done")
    if (confirm) command.option("--reason <text>", "why, in a few words")
    else command.requiredOption("--reason <text>", "why they are turned down, in a few words")
    command.option("--json", "print JSON; --json=id,title keeps only those fields")
    command.action(async (words: string[], options: DecideOptions) => {
      const everything = words.length === 1 && words[0]?.toLowerCase() === "all"
      const limit = limitOf(options.limit)
      await asOwner(command, env, `${name} ${everything ? "all waiting" : words.join(" ")} people proposals?`)
      const result = await withStore(env, async (store) => {
        const listed = everything ? await waiting(store, { kind: options.kind, limit }) : undefined
        const chosen = listed
          ? { ids: listed.items.map(({ id }) => id), refused: [] }
          : await peopleIds(store, parseProposalIds(words))
        const more = listed?.hasMore ?? false
        if (everything && !options.yes) return { kind: "preview" as const, preview: chosen.ids, more }
        const done = await (await reviewOf(store, env)).decide(chosen.ids, decisionOf(confirm, "owner", options.reason))
        return { kind: "decided" as const, ...done, refused: [...chosen.refused, ...done.refused], more }
      })
      const moreText = result.more ? `\nmore wait than --limit ${limit}; run it again for the rest` : ""
      if (result.kind === "preview") {
        const count = result.preview.length
        print(
          options.json,
          itemAnswer({ outcome: "preview" as const, would: name, ids: result.preview, has_more: result.more }),
          count === 0
            ? "nothing about people waits for you"
            : `would ${name} ${count}: ${result.preview.join(" ")}\nnothing changed; add --yes to ${name} them${moreText}`,
        )
        return
      }
      const { more, kind: _, ...decided } = result
      const issues = decided.refused.map((one) => ({ code: one.code, source: one.id, reason: one.reason }))
      print(
        options.json,
        itemAnswer({ ...decided, has_more: more }, issues.length ? { meta: { complete: false, issues } } : undefined),
        decidedText(decided) + moreText,
      )
    })
  }

  const company = byOption(
    annotate(people.command("resolve"), { effects: LOCAL_WRITE })
      .summary("say a match's mailbox, or both its people, are a company's; only you")
      .description(
        "answers a match with company: the address goes to the " +
          "organization you name, else to the one that has the address or its company domain, else to one named " +
          "--name, else to a new company named after the domain. The two people are not joined and are not proposed " +
          "again on that address. A match on a shared mailbox (people review shows shared and mailbox) names its " +
          "address; on any other match, by name say, --mailbox names which of the two people's addresses it is. " +
          "organization answers a match whose two people are the company's mailboxes: every address on it goes to " +
          "one organization, chosen the same way, else named after the people's shared name; people who are only " +
          "those addresses become the company's, people with other identities keep them and stay people",
      )
      .argument("<id>", "the match's id as people review lists it")
      .argument(
        "<answer>",
        "company: the mailbox is a company's, not either person's; organization: both are the company's mailboxes",
        oneOf(RESOLVE_ANSWERS),
      )
      .argument("[organization]", "organization:<id> to give the addresses to"),
  )
    .option("--name <name>", "the company's name, when no organization is named")
    .option("--mailbox <address>", "with company, on a match not about a shared mailbox: the company's address")
    .option("--all", "every match waiting on the same addresses, in this one answer; without it, only this match")
    .option("--reason <text>", "why, in a few words")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
  company.action(
    async (
      id: string,
      answer: (typeof RESOLVE_ANSWERS)[number],
      organization: string | undefined,
      options: { name?: string; mailbox?: string; all?: boolean; reason?: string; json?: boolean },
    ) => {
      const owned = organizationOf(organization)
      if (answer === "organization") {
        if (options.mailbox !== undefined)
          throw new CliError("validation_error", "organization gives every address on the match; drop --mailbox", {
            param: "mailbox",
          })
        await asOwner(company, env, `say the people of people proposal ${id} are a company's mailboxes?`)
        const decided = await withStore(env, async (store) => {
          await (await reviewOf(store, env)).get(id)
          return store.people.decideLink(id, {
            confirm: false,
            by: "owner",
            organization: {
              ...(owned === undefined ? {} : { organization: owned }),
              ...(options.name ? { name: options.name } : {}),
              ...(options.all ? { all: true } : {}),
            },
            ...(options.reason ? { reason: options.reason } : {}),
          })
        })
        const result = decided.result as {
          organization: string
          mailboxes: string[]
          people: string[]
          closed: string[]
        }
        const people = result.people.length > 0 ? `; ${result.people.join(" ")} are the company's now` : ""
        print(
          options.json,
          itemAnswer({
            id,
            kind: IDENTITY_LINK_KIND,
            status: "rejected" as const,
            organization: result.organization,
            mailboxes: result.mailboxes,
            people: result.people,
            closed: result.closed,
          }),
          `${result.closed.join(" ")}: ${result.mailboxes.join(", ")} belong to ${result.organization}${people}`,
        )
        return
      }
      await asOwner(company, env, `say the mailbox of people proposal ${id} is a company's?`)
      const decided = await withStore(env, async (store) => {
        await (await reviewOf(store, env)).get(id)
        return store.people.decideLink(id, {
          confirm: false,
          by: "owner",
          company: {
            ...(owned === undefined ? {} : { organization: owned }),
            ...(options.name ? { name: options.name } : {}),
            ...(options.mailbox ? { mailbox: options.mailbox } : {}),
            ...(options.all ? { all: true } : {}),
          },
          ...(options.reason ? { reason: options.reason } : {}),
        })
      })
      const result = decided.result as { organization?: string; closed?: string[]; mailbox?: string } | null
      const given = result?.organization ?? null
      const closed = result?.closed ?? [id]
      const mailbox = result?.mailbox ?? (decided.payload as { mailbox?: string }).mailbox ?? null
      print(
        options.json,
        itemAnswer({ id, kind: IDENTITY_LINK_KIND, status: "rejected" as const, mailbox, organization: given, closed }),
        `${closed.join(" ")}: ${mailbox} is ${given}'s mailbox now; the people on it stay apart`,
      )
    },
  )
}
