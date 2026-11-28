import type { Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import type { QueryRegistry } from "@wirecat/cli-base/query"
import type { NextStep } from "@wirecat/cli-base/standards"
import { LOCAL_READ, LOCAL_WRITE, queryTerms, termField, withQuery } from "@wirecat/cli-core/cli"
import { PERSON_KINDS, type PersonKind } from "@wirecat/cli-core/store"
import { type ListedPerson, PEOPLE_SORTS, type PeopleSort } from "@wirecat/cli-core/store/areas"
import type { Command } from "commander"
import { answers, itemAnswer, listAnswer, wholeList, withStore } from "../answer.js"
import { oneOf, positive } from "../options.js"
import { groupOf, keepInGroup } from "../store/group.js"
import { identitiesCommands } from "./identities-command.js"

interface PeopleListOptions {
  sort: PeopleSort
  limit: number
  page: number
  json?: boolean
}

const personRow = (person: ListedPerson) => ({
  ref: person.person,
  name: person.name,
  display_name: person.displayName,
  kind: person.kind,
  kind_signals: person.kindSignals,
  owner: person.owner,
  tasks: person.tasks,
  contact: person.contact,
  phone: person.phone,
  email: person.email,
  username: person.username,
  username_source: person.usernameSource,
  messages_from: person.messagesFrom,
  last_contact: person.lastContact,
  ties: person.ties,
})

// Keyed by name rather than PersonKind: a cli-core that adds a kind must not break wcat's build.
const KIND_WORDS: Record<string, [string, string]> = {
  person: ["person", "people"],
  organization: ["organization", "organizations"],
  automated: ["automated sender", "automated senders"],
  stranger: ["stranger", "strangers"],
  unsorted: ["unsorted one", "unsorted ones"],
  test: ["test account", "test accounts"],
}

/**
 * One step to every kind, with how many each other kind holds: an answer keeps two next steps at most, and the next page
 * takes one of them.
 */
const otherKinds = (shown: PersonKind | "all", counts: Record<PersonKind, number>, name?: string): NextStep[] => {
  // Test data is hidden from every list: `kind:all` leaves it out, so the step never names it.
  const others = PERSON_KINDS.filter((kind) => kind !== shown && kind !== "test" && counts[kind] > 0)
  if (shown === "all" || others.length === 0) return []
  const query = ["kind:all", ...(name === undefined ? [] : [`name:${JSON.stringify(name)}`])].join(" ")
  return [
    {
      kind: "command",
      step: "people.kinds",
      command: "people list",
      args: { query },
      line: `wcat people list '${query}'`,
      why: others
        .map((kind) => {
          const [one, many] = KIND_WORDS[kind] ?? [kind, kind]
          return `${counts[kind]} ${counts[kind] === 1 ? one : many}`
        })
        .join(", "),
      safe_to_auto_execute: true,
    },
  ]
}

export const peopleCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const { print } = answers(program, streams, env)
  const people = program
    .command("people")
    .description("the people wcat knows: who is who across sources, and whom to assign tasks to")
  annotate(people.command("add"), { effects: LOCAL_WRITE, literal_after_dashes: true })
    .description("add a person by name, before any message names them")
    .argument("<name...>", "what to call them")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (words: string[], options: { json?: boolean }) => {
      await withStore(env, async (store) => {
        const person = await store.people.add({ name: words.join(" ") })
        print(options.json, itemAnswer({ ref: `person:${person.uid}`, name: person.name }), `person:${person.uid}`)
      })
    })
  const query = {
    entity: "task_person",
    backend: "native",
    fields: [
      termField("name", "txt", "name:ivan"),
      termField("kind", "enum", "kind:organization", { values: [...PERSON_KINDS, "all"] }),
    ],
  } as const satisfies QueryRegistry
  withQuery(
    annotate(people.command("list"), { effects: LOCAL_READ })
      .summary("people of one kind, most messages first: person by default")
      .description(
        "people of one kind: person (the default: the owner, people added by hand or assigned a task, and named " +
          "people with a tie to you, such as a one-to-one chat, a group of at most 10, mail you wrote, a meeting, a " +
          "CRM deal of yours or your address book), organization, automated (a name or a bulk mailbox marks them; " +
          "bots are not people: bots list), " +
          "stranger (no tie), unsorted (no name), test (what a test run left, hidden from every other list) or all, " +
          "which leaves test out. The owner first, then by the messages and mail they sent",
      ),
    query,
  )
    .option("--sort <field>", `${PEOPLE_SORTS.join(", ")} (default interactions)`, oneOf(PEOPLE_SORTS), "interactions")
    .option("--limit <n>", "most people on a page, up to 5000", positive, 500)
    .option("--page <n>", "which page, from 1", positive, 1)
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (words: string[], { json, ...options }: PeopleListOptions) => {
      const terms = queryTerms(words, query, "people list")
      const name = terms.get("name")
      const kind = (terms.get("kind") ?? "person") as PersonKind | "all"
      const limit = Math.min(options.limit, 5000)
      await withStore(env, async (store) => {
        const found = await store.people.list({
          limit,
          offset: (options.page - 1) * limit,
          sort: options.sort,
          kind,
          ...(name === undefined ? {} : { query: name }),
        })
        const counted = groupOf(env) === undefined
        // In a group the store's counts and ties cover accounts outside it (WC-ACCT-13), so the answer claims none.
        const rows = found.items
          .map(personRow)
          .map((row) =>
            counted ? row : { ...row, messages_from: null, last_contact: null, ties: [], kind_signals: [] },
          )
        const items = await keepInGroup(store, env, rows, ({ ref }) => ref)
        const steps = counted ? otherKinds(kind, found.counts, name) : []
        print(
          json,
          listAnswer("people list", {
            items,
            limit,
            has_more: found.hasMore,
            page: options.page,
            ...(counted ? { total: { value: found.total, relation: "eq" as const } } : {}),
            args: {
              ...(words.length ? { query: words.join(" ") } : {}),
              ...(options.sort === "interactions" ? {} : { sort: options.sort }),
            },
            ...(steps.length ? { next: steps } : {}),
          }),
        )
      })
    })
  annotate(people.command("check"), { effects: LOCAL_READ })
    .summary("people with a name like this one, to check before adding a person")
    .description("people whose names start like these words, the same name first: check before adding a person")
    .argument("<name...>", "the name being typed")
    .option("--limit <n>", "most people, up to 50", positive, 8)
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (words: string[], options: { limit: number; json?: boolean }) => {
      await withStore(env, async (store) => {
        const found = await store.people.similar(words.join(" "), { limit: Math.min(options.limit, 50) })
        const items = await keepInGroup(
          store,
          env,
          found.map(({ sameName, ...person }) => ({ ...personRow(person), same_name: sameName })),
          ({ ref }) => ref,
        )
        print(options.json, wholeList("people check", items))
      })
    })
  identitiesCommands(people, program, streams, env)
}
