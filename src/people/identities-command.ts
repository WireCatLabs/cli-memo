import { CliError, type Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { LOCAL_READ, LOCAL_WRITE } from "@wirecat/cli-core/cli"
import { type IdentityRef, type MessageStore, type PersonRecord, parseMergeId } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { answers, itemAnswer, withStore } from "../answer.js"
import { byOption, reasonOption, whoRuns } from "../author.js"
import { doubtsCommand } from "./doubts-command.js"
import { exactIdentityOf, identityOf } from "./identity.js"
import { withOwner } from "./owner.js"
import { matchAnswer, summaryOf } from "./proposal-rows.js"
import { peopleProposalCommands } from "./proposals-command.js"

const PERSON = /^person:([1-9]\d*)$/
const FROM = /^person:([1-9]\d*|me)$/

/** `person:<uid>`, `person:me`, or an identity of the person as `<messenger>:<name or id>`. */
const personOf = async (store: MessageStore, who: string): Promise<PersonRecord> => {
  const uid = PERSON.exec((await withOwner(store, who)).trim())?.[1]
  const found =
    uid === undefined ? await store.people.personOf(await identityOf(store, who)) : await store.people.personByUid(uid)
  if (found === undefined)
    throw new CliError("not_found", `the store has no person for "${who}"`, { reason: "person.not-found" })
  return found
}

const personAnswer = (person: PersonRecord) => ({
  ref: `person:${person.uid}`,
  name: person.name,
  ...(person.mergedInto === undefined ? {} : { mergedInto: `person:${person.mergedInto}` }),
  identities: person.identities.map((identity) => ({
    identity: `${identity.provider}:${identity.id}`,
    name: identity.name,
    username: identity.username,
    phone: identity.phone ?? null,
    email: identity.email ?? null,
    seenIn: identity.seenIn,
    method: identity.method,
    linkedBy: identity.linkedBy,
    linkedAt: identity.linkedAt,
  })),
})

const identitiesOf = async (store: MessageStore, refs: string[]): Promise<IdentityRef[]> => {
  const found: IdentityRef[] = []
  for (const ref of refs) found.push(await identityOf(store, ref))
  return found
}

/** Who is who across sources: one person's identities and merges, the matches waiting, and the owner's moves. */
export const identitiesCommands = (people: Command, program: Command, streams: Streams, env: NodeJS.ProcessEnv) => {
  const { print } = answers(program, streams, env)

  annotate(people.command("show"), { effects: LOCAL_READ })
    .summary("one person: identities by source, merges and open matches")
    .description("one person: their identities by source with the accounts that saw each, merges and open matches")
    .argument("<who>", "person:<uid>, or <messenger>:<name or id> of an identity of the person")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (who: string, options: { json?: boolean }) => {
      const shown = await withStore(env, async (store) => {
        const person = await personOf(store, who)
        const matches = await store.people.linkProposals({ person: person.uid, limit: 500, offset: 0 })
        return {
          ...personAnswer(person),
          merges: await store.people.merges(person.uid),
          matches: matches.items.map(matchAnswer),
        }
      })
      print(
        options.json,
        itemAnswer(shown),
        [
          `${shown.ref} ${shown.name ?? ""}`.trim(),
          ...shown.identities.map(({ identity, name }) => `  ${identity}${name ? `  ${name}` : ""}`),
          ...shown.merges.map(
            ({ id, from, method, by, at }) =>
              `  merged: ${id} (person:${from}) by ${by} via ${method}, ${at.slice(0, 10)}`,
          ),
          ...shown.matches.map((match) => `  match ${match.id}: ${summaryOf(match)}`),
        ].join("\n"),
      )
    })

  peopleProposalCommands(people, program, streams, env)
  doubtsCommand(people, program, streams, env)

  annotate(people.command("scan"), { effects: LOCAL_WRITE })
    .summary("match people across sources now; memo sync does it too")
    .description(
      "match people across sources now: the same address or a phone two people share joins them, the rest waits " +
        "in people review; memo sync runs it too",
    )
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (options: { json?: boolean }) => {
      const scan = await withStore(env, (store) => store.people.scanMatches())
      print(
        options.json,
        itemAnswer(scan),
        `${scan.merged.length} joined, ${scan.proposed.filter(({ opened }) => opened).length} new matches, ` +
          `${scan.skipped.length} left apart`,
      )
    })

  reasonOption(
    byOption(
      annotate(people.command("link"), { effects: LOCAL_WRITE })
        .summary("say two identities are one person; an agent's link waits for you")
        .description("say two identities are one person: yours links them, an agent's waits for you as a match")
        .argument("<identity>", "<messenger>:<name or id>")
        .argument("<other>", "<messenger>:<name or id> of the person it joins"),
    ),
  )
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(
      async (
        one: string,
        other: string,
        options: { reason?: string; asOwner?: boolean; json?: boolean },
        command: Command,
      ) => {
        const who = await whoRuns(command, env, {
          asOwner: options.asOwner,
          question: `link ${one} and ${other} as you?`,
        })
        if (who !== "owner" && !options.reason?.trim())
          throw new CliError("validation_error", "an agent's link waits for the owner; say why with --reason", {
            reason: "proposal.reason-required",
            param: "reason",
          })
        const done = await withStore(env, async (store) => {
          const [identity, joined] = (await identitiesOf(store, [one, other])) as [IdentityRef, IdentityRef]
          if (who === "owner") {
            const person = await store.people.linkIdentities(joined, identity, { method: "manual", by: "owner" })
            return { outcome: "linked" as const, person: `person:${person.uid}` }
          }
          const proposal = await store.people.proposeLink({
            identity,
            with: joined,
            signal: "agent",
            by: who,
            reason: options.reason?.trim() as string,
          })
          return { outcome: "proposed" as const, proposal: proposal.id }
        })
        print(
          options.json,
          itemAnswer(done),
          done.outcome === "linked" ? `linked: ${done.person}` : `waits for the owner as match ${done.proposal}`,
        )
      },
    )

  /**
   * The owner's separations apply at once; anyone else's waits for the owner as a split proposal, with why. A run with
   * no reason that is not the owner's is refused before anything is read.
   */
  const separation = async (command: Command, question: string, reason: string | undefined) => {
    const who = await whoRuns(command, env, { asOwner: command.opts<{ asOwner?: boolean }>().asOwner, question })
    if (who !== "owner" && !reason?.trim())
      throw new CliError("validation_error", "an agent's split waits for the owner; say why with --reason", {
        reason: "proposal.reason-required",
        param: "reason",
      })
    return who
  }
  const proposed = (json: boolean | undefined, proposal: string) =>
    print(
      json,
      itemAnswer({ outcome: "proposed" as const, proposal }),
      `waits for the owner as split ${proposal}: memo people review`,
    )

  reasonOption(
    byOption(
      annotate(people.command("unlink"), { effects: LOCAL_WRITE })
        .summary("take identities off a person, to one new person; an agent's waits for you")
        .description(
          "take identities off their person: one gets a person of its own again, several move together to one new " +
            "person, and no automatic match joins them back; yours applies at once, an agent's waits for you in " +
            "people review",
        )
        .argument("<identities...>", "the identities that leave, each <messenger>:<id> exactly, all of one person"),
    ),
  )
    .option("--from <person>", "the person they leave, person:<uid> or person:me; refused when they sit on another")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (refs: string[], options: { from?: string; reason?: string; json?: boolean }, command: Command) => {
      if (!FROM.test(options.from?.trim() ?? ""))
        throw new CliError(
          "validation_error",
          "say whom they leave: --from person:<uid> or --from person:me; memo people show <identity> names who holds one",
          { reason: "person.from-required", param: "from" },
        )
      const who = await separation(command, `unlink ${refs.join(" ")} from ${options.from}?`, options.reason)
      const done = await withStore(env, async (store) => {
        const from = PERSON.exec(await withOwner(store, (options.from as string).trim()))?.[1] as string
        const chosen: IdentityRef[] = []
        for (const ref of refs) chosen.push(await exactIdentityOf(store, ref))
        if (who !== "owner") {
          const reason = options.reason?.trim() as string
          return { proposal: (await store.people.proposeSplit({ identities: chosen, from, by: who, reason })).id }
        }
        const [first] = chosen as [IdentityRef]
        if (chosen.length === 1) return store.people.unlinkIdentity(first, { method: "unlink", by: "owner", from })
        return store.people.split(from, chosen, "owner")
      })
      if ("proposal" in done) proposed(options.json, done.proposal)
      else print(options.json, itemAnswer(personAnswer(done)), `person:${done.uid}`)
    })

  reasonOption(
    byOption(
      annotate(people.command("unmerge"), { effects: LOCAL_WRITE })
        .summary("undo a merge: its identities go back to their person; an agent's waits for you")
        .description(
          "give the identities a merge brought back to the person they came from; yours applies at once, an " +
            "agent's waits for you in people review",
        )
        .argument("<merge>", "merge:<to>-<from>, as people show lists it"),
    ),
  )
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (merge: string, options: { reason?: string; json?: boolean }, command: Command) => {
      const { to, from } = parseMergeId(merge)
      const who = await separation(command, `undo ${merge}?`, options.reason)
      if (who !== "owner") {
        const reason = options.reason?.trim() as string
        const proposal = await withStore(env, (store) => store.people.proposeSplit({ merge, by: who, reason }))
        proposed(options.json, proposal.id)
        return
      }
      const person = await withStore(env, (store) => store.people.undoMerge(to, from, "owner"))
      print(options.json, itemAnswer(personAnswer(person)), `person:${person.uid}`)
    })
}
