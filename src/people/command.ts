import { join } from "node:path"
import { CliError, type Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import type { QueryRegistry } from "@wirecat/cli-base/query"
import type { NextStep } from "@wirecat/cli-base/standards"
import { LOCAL_READ, LOCAL_WRITE, queryTerms, termField, withQuery } from "@wirecat/cli-core/cli"
import type { ListedPerson } from "@wirecat/cli-core/store"
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

const PEOPLE_SORTS = ["tasks", "name"] as const

interface PeopleListOptions {
  all?: boolean
  sort: (typeof PEOPLE_SORTS)[number]
  limit: number
  page: number
  json?: boolean
}

/** A listed person as memo answers: the ref, the stored name and the one to show, the contact, the ties. */
const personRow = ({ person, displayName, ...rest }: ListedPerson) => ({
  ref: person,
  name: rest.name,
  display_name: displayName,
  owner: rest.owner,
  tasks: rest.tasks,
  username: rest.username,
  phone: rest.phone,
  email: rest.email,
  ties: rest.ties,
})

/** The step to the people the list hid, with how many: the count a page shows beside "Show all". */
const showAll = (words: string[], hidden: number): NextStep => ({
  kind: "command",
  step: "people.all",
  command: "people list",
  args: { ...(words.length ? { query: words.join(" ") } : {}), all: true },
  line: `memo people list${words.length ? ` ${words.join(" ")}` : ""} --all`,
  why: `${hidden} ${hidden === 1 ? "person has" : "people have"} no tie to you and ${hidden === 1 ? "is" : "are"} hidden`,
  safe_to_auto_execute: true,
})

/** For an assignee picker: everyone the store knows, the owner first, then by how many tasks name them. */
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
    fields: [termField("name", "txt", "name:ivan")],
  } as const satisfies QueryRegistry
  withQuery(
    annotate(people.command("list"), { effects: LOCAL_READ })
      .summary("the people you have a tie with, the owner first")
      .description(
        "the people you have a tie with: a one-to-one chat, a group of at most 10, mail you wrote to them, a " +
          "meeting, a CRM or your address book; also people added by hand or assigned a task. The owner first, " +
          "then by how many tasks name them. --all adds everyone else (here --all means people with no tie, not " +
          "every account)",
      ),
    query,
  )
    .option("--all", "also people with no tie to you, such as authors seen only in big groups")
    .option("--sort <field>", `${PEOPLE_SORTS.join(" or ")} (default tasks)`, oneOf(PEOPLE_SORTS), "tasks")
    .option("--limit <n>", "most people on a page, up to 5000", positive, 500)
    .option("--page <n>", "which page, from 1", positive, 1)
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (words: string[], { json, ...options }: PeopleListOptions) => {
      const name = queryTerms(words, query, "people list").get("name")
      const limit = Math.min(options.limit, 5000)
      await withStore(env, async (store) => {
        const found = await store.people.list({
          limit,
          offset: (options.page - 1) * limit,
          sort: options.sort,
          ...(options.all ? { all: true } : {}),
          ...(name === undefined ? {} : { query: name }),
        })
        const items = await keepInGroup(store, env, found.items.map(personRow), ({ ref }) => ref)
        // In a group the store's counts cover people outside it, so the answer claims none.
        const counted = groupOf(env) === undefined
        print(
          json,
          listAnswer("people list", {
            items,
            limit,
            has_more: found.hasMore,
            page: options.page,
            ...(counted ? { total: { value: found.total, relation: "eq" as const } } : {}),
            args: { ...(words.length ? { query: words.join(" ") } : {}), ...(options.all ? { all: true } : {}) },
            ...(!counted || options.all || found.hidden === 0 ? {} : { next: [showAll(words, found.hidden)] }),
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
