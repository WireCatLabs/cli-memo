import { CliError, type Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { LOCAL_READ, LOCAL_WRITE } from "@wirecat/cli-core/cli"
import { parseProposalIds } from "@wirecat/cli-core/services"
import { IDENTITY_LINK_KIND, IDENTITY_SPLIT_KIND, type MessageStore } from "@wirecat/cli-core/store"
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

/** Only the people review's own proposals: the shared review decides everything else. */
const peopleIds = async (store: MessageStore, ids: string[]): Promise<string[]> => {
  for (const id of ids) {
    const { kind } = await store.proposedActions.get(id)
    if (!PEOPLE_KINDS.includes(kind))
      throw new CliError("validation_error", `${id} is a ${kind} proposal; memo review decides it`, {
        reason: "proposal.not-people",
      })
  }
  return ids
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
        "says are not this person), newest first; people confirm or people reject answers them",
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
                "comes back only on new evidence, a turned-down split never. `all` shows what it would do until --yes",
        )
        .argument("<ids...>", "ids or ranges as people review lists them (17080 17082-17085), or all"),
    )
      .option("--kind <kind>", `with all: ${PROPOSAL_KINDS.join(", ")} (default all)`, oneOf(PROPOSAL_KINDS), "all")
      .option("--limit <n>", "with all: as many as people review lists, up to 500", positive, 50)
      .option("--yes", "with all: do it, not only show what would be done")
      .option("--reason <text>", confirm ? "why, in a few words" : "why they are turned down, in a few words")
      .option("--json", "print JSON; --json=id,title keeps only those fields")
    command.action(async (words: string[], options: DecideOptions) => {
      const everything = words.length === 1 && words[0]?.toLowerCase() === "all"
      const limit = limitOf(options.limit)
      await asOwner(command, env, `${name} ${everything ? "all waiting" : words.join(" ")} people proposals?`)
      const result = await withStore(env, async (store) => {
        const ids = everything
          ? (await waiting(store, { kind: options.kind, limit })).items.map(({ id }) => id)
          : await peopleIds(store, parseProposalIds(words))
        if (everything && !options.yes) return { preview: ids }
        return (await reviewOf(store, env)).decide(ids, decisionOf(confirm, "owner", options.reason))
      })
      if ("preview" in result) {
        const count = result.preview.length
        print(
          options.json,
          itemAnswer({ outcome: "preview" as const, would: name, ids: result.preview }),
          count === 0
            ? "nothing about people waits for you"
            : `would ${name} ${count}: ${result.preview.join(" ")}\nnothing changed; add --yes to ${name} them`,
        )
        return
      }
      const issues = result.refused.map((one) => ({ code: one.code, source: one.id, reason: one.reason }))
      print(
        options.json,
        itemAnswer(result, issues.length ? { meta: { complete: false, issues } } : undefined),
        decidedText(result),
      )
    })
  }
}
