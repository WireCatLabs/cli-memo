import { join } from "node:path"
import { CliError, type Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import type { QueryRegistry } from "@wirecat/cli-base/query"
import type { NextStep } from "@wirecat/cli-base/standards"
import { LOCAL_READ, LOCAL_WRITE, queryTerms, termField, withQuery } from "@wirecat/cli-core/cli"
import {
  type ListedPerson,
  PEOPLE_SORTS,
  PERSON_KINDS,
  type PeopleSort,
  type PersonKind,
} from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { answers, itemAnswer, listAnswer, wholeList, withStore } from "../answer.js"
import { deciderOf, fromAppOption } from "../author.js"
import { boundFolders, folderOfFile } from "../notes/bound.js"
import { folderNotes } from "../notes/import.js"
import { oneOf, positive } from "../options.js"
import { groupOf, keepInGroup } from "../store/group.js"
import { identitiesCommands } from "./identities-command.js"
import { identityOf } from "./identity.js"
import { importNotesMap } from "./notes-map.js"

/** Who is who is linked in messaging (`tg contacts link`); the note about a person is an `about` link. */
export const noteCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const notes = program.commands.find((command) => command.name() === "notes") ?? program.command("notes")
  const links = notes.command("links").description("imported note files linked to the person behind an identity")
  const { print } = answers(program, streams, env)
  for (const operation of ["show", "add", "clear"] as const) {
    const command = annotate(links.command(operation), {
      effects: operation === "show" ? LOCAL_READ : LOCAL_WRITE,
      output: { entity: "person_note_links" },
    })
      .description(
        {
          show: "show the note files about a person",
          add: "link an imported note file to a person",
          clear: "remove the owner's note-file links for a person",
        }[operation],
      )
      .argument("<identity>", "<messenger>:<name or id> of an identity of the person")
      .option("--json", "print the standard JSON answer")
    if (operation === "add") command.argument("<path>", "the imported note file in a configured folder")
    if (operation !== "show") fromAppOption(command)
    command.action(async (identity: string, value: unknown) => {
      const by = await deciderOf(command, env, { question: `change ${identity}'s note files as you, the owner?` })
      const result = await withStore(env, async (store) => {
        const folders = await boundFolders(store, env, { strict: false })
        await importNotesMap(store, env, folders)
        const person = await store.people.personOf(await identityOf(store, identity))
        if (person === undefined)
          throw new CliError("not_found", `the store has no person for "${identity}"`, { reason: "person.not-found" })
        const to = `person:${person.uid}`
        const files = async () => {
          const found = []
          for (const link of await store.notes.links({ to })) {
            if (link.kind !== "about" || link.origin !== "owner") continue
            const note = await store.notes.resolveNote(link.from)
            if (note?.source === "file" && note.deletedAt === null) found.push({ link, note })
          }
          return found
        }
        if (operation === "clear") for (const { link } of await files()) await store.notes.removeLink(link.id, by)
        else if (operation === "add") {
          const path = String(value)
          const { folder, path: inside } = folderOfFile(folders, path)
          const note = (await folderNotes(store, folder.id)).find((candidate) => candidate.path === inside)
          if (!note)
            throw new CliError("not_found", `${path} is not imported yet — memo sync --only notes`, {
              reason: "note.not-imported",
            })
          await store.notes.addLink({ from: note.ref, to, kind: "about", origin: "owner", by })
        }
        const paths = (await files()).map(({ note }) => {
          const folder = folders.find((candidate) => candidate.id === note.folderId)
          return folder ? join(folder.path, note.path as string) : note.ref
        })
        return { person: to, name: person.name ?? person.uid, files: paths }
      })
      print(command.opts().json, itemAnswer(result), `${result.name}: ${result.files.join(", ") || "no note"}`)
    })
  }
}

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
  messages_from: person.messagesFrom,
  last_contact: person.lastContact,
  ties: person.ties,
})

// Keyed by name rather than PersonKind: a cli-core that adds a kind must not break memo's build.
const KIND_WORDS: Record<string, [string, string]> = {
  person: ["person", "people"],
  organization: ["organization", "organizations"],
  automated: ["automated sender", "automated senders"],
  stranger: ["stranger", "strangers"],
  unsorted: ["unsorted one", "unsorted ones"],
}

/**
 * One step to every kind, with how many each other kind holds: an answer keeps two next steps at most, and the next page
 * takes one of them.
 */
const otherKinds = (shown: PersonKind | "all", counts: Record<PersonKind, number>, name?: string): NextStep[] => {
  const others = PERSON_KINDS.filter((kind) => kind !== shown && counts[kind] > 0)
  if (shown === "all" || others.length === 0) return []
  const query = ["kind:all", ...(name === undefined ? [] : [`name:${JSON.stringify(name)}`])].join(" ")
  return [
    {
      kind: "command",
      step: "people.kinds",
      command: "people list",
      args: { query },
      line: `memo people list '${query}'`,
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
    .description("the people memo knows: who is who across sources, and whom to assign tasks to")
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
          "CRM or your address book), organization, automated (bots, newsletters, notifications), unsorted (no tie " +
          "or no name) or all. The owner first, then by the messages and mail they sent",
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
  annotate(people.command("similar"), { effects: LOCAL_READ })
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
        print(options.json, wholeList("people similar", items))
      })
    })
  identitiesCommands(people, program, streams, env)
}
