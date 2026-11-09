import { CliError, type Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { LOCAL_READ, LOCAL_WRITE } from "@wirecat/cli-core/cli"
import {
  type IdentityLinkRow,
  type IdentityRef,
  type MessageStore,
  type PersonRecord,
  parseMergeId,
} from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { answers, itemAnswer, listAnswer, withStore } from "../answer.js"
import { byOption, reasonOption, whoRuns } from "../author.js"
import { positive } from "../options.js"
import { exactIdentityOf, identityOf } from "./identity.js"

const OWNER_ONLY = "identity.owner-only"

const PERSON = /^person:([1-9]\d*)$/

/** `person:<uid>`, or an identity of the person as `<messenger>:<name or id>`. */
const personOf = async (store: MessageStore, who: string): Promise<PersonRecord> => {
  const uid = PERSON.exec(who.trim())?.[1]
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
    seenIn: identity.seenIn,
    method: identity.method,
    linkedBy: identity.linkedBy,
    linkedAt: identity.linkedAt,
  })),
})

const matchAnswer = (row: IdentityLinkRow) => ({
  id: row.id,
  persons: row.persons,
  joins: row.joins,
  identity: row.identity,
  with: row.with,
  signal: row.signal,
  score: row.score,
  candidates: row.candidates,
  reason: row.reason,
  evidence: row.evidence,
  proposedBy: row.proposedBy,
  createdAt: row.createdAt,
})

const summaryOf = ({ identity, with: other, persons, signal }: ReturnType<typeof matchAnswer>) =>
  `${identity} may be the same person as ${other ?? persons[1]} (${signal})`

/** The owner's moves: refused for anyone else before anything is read, whatever the store would say. */
const asOwner = async (command: Command, env: NodeJS.ProcessEnv, question: string): Promise<"owner"> => {
  const options = command.opts<{ asOwner?: boolean }>()
  const who = await whoRuns(command, env, { asOwner: options.asOwner, question })
  if (who !== "owner")
    throw new CliError("permission_error", `only the owner can ${question.replace(/\?$/, "")}`, { reason: OWNER_ONLY })
  return who
}

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
          ...shown.merges.map(({ id, from }) => `  merged: ${id} (person:${from})`),
          ...shown.matches.map((match) => `  match ${match.id}: ${summaryOf(match)}`),
        ].join("\n"),
      )
    })

  annotate(people.command("review"), { effects: LOCAL_READ })
    .summary("people that may be one person, waiting for the owner")
    .description("people that may be one person, waiting for the owner; memo review confirms or rejects them")
    .option("--limit <n>", "most matches, up to 500", positive, 50)
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (options: { limit: number; json?: boolean }) => {
      if (options.limit > 500) throw new CliError("validation_error", "--limit takes 1–500", { param: "limit" })
      const found = await withStore(env, (store) =>
        store.people.linkProposals({ status: "proposed", limit: options.limit, offset: 0 }),
      )
      const items = found.items.map(matchAnswer)
      print(
        options.json,
        listAnswer("people review", { items, limit: options.limit, has_more: found.hasMore }),
        [
          ...items.map((match) => `${match.id}  ${summaryOf(match)}`),
          ...(found.hasMore ? [`more wait: --limit ${Math.min(500, options.limit * 2)}`] : []),
        ].join("\n") || "no matches wait for you",
      )
    })

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

  byOption(
    annotate(people.command("unlink"), { effects: LOCAL_WRITE })
      .summary("take identities off a person, to one new person; only you")
      .description(
        "take identities off their person: one gets a person of its own again, several move together to one new " +
          "person; only you, and no automatic match joins them back",
      )
      .argument("<identities...>", "the identities that leave, each <messenger>:<id> exactly, all of one person"),
  )
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (refs: string[], options: { json?: boolean }, command: Command) => {
      await asOwner(command, env, `unlink ${refs.join(" ")}?`)
      const person = await withStore(env, async (store) => {
        const chosen: IdentityRef[] = []
        for (const ref of refs) chosen.push(await exactIdentityOf(store, ref))
        const [first] = chosen as [IdentityRef]
        if (chosen.length === 1) return store.people.unlinkIdentity(first, { method: "unlink", by: "owner" })
        const held = await store.people.personOf(first)
        if (held === undefined)
          throw new CliError("not_found", `the store has no person for "${refs[0]}"`, { reason: "person.not-found" })
        return store.people.split(held.uid, chosen, "owner")
      })
      print(options.json, itemAnswer(personAnswer(person)), `person:${person.uid}`)
    })

  byOption(
    annotate(people.command("unmerge"), { effects: LOCAL_WRITE })
      .summary("undo a merge: its identities go back to their person; only you")
      .description("give the identities a merge brought back to the person they came from; only you")
      .argument("<merge>", "merge:<to>-<from>, as people show lists it"),
  )
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (merge: string, options: { json?: boolean }, command: Command) => {
      const { to, from } = parseMergeId(merge)
      await asOwner(command, env, `undo ${merge}?`)
      const person = await withStore(env, (store) => store.people.undoMerge(to, from, "owner"))
      print(options.json, itemAnswer(personAnswer(person)), `person:${person.uid}`)
    })
}
