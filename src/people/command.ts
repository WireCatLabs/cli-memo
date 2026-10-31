import { join } from "node:path"
import { CliError, type Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import type { QueryRegistry } from "@wirecat/cli-base/query"
import { LOCAL_READ, LOCAL_WRITE, listQuery, typedQuery, withQuery } from "@wirecat/cli-core/cli"
import type { Command } from "commander"
import { answers, itemAnswer, wholeList, withStore } from "../answer.js"
import { boundFolders, folderOfFile } from "../notes/bound.js"
import { folderNotes } from "../notes/import.js"
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
    command.action(async (identity: string, value: unknown) => {
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
        if (operation === "clear") for (const { link } of await files()) await store.notes.removeLink(link.id)
        else if (operation === "add") {
          const path = String(value)
          const { folder, path: inside } = folderOfFile(folders, path)
          const note = (await folderNotes(store, folder.id)).find((candidate) => candidate.path === inside)
          if (!note)
            throw new CliError("not_found", `${path} is not imported yet — memo sync --only notes`, {
              reason: "note.not-imported",
            })
          await store.notes.addLink({ from: note.ref, to, kind: "about", origin: "owner" })
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

/** For an assignee picker: the people tasks already name, and the owner; anyone else is found with search people. */
export const peopleCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const { print } = answers(program, streams, env)
  const people = program.command("people").description("the people memo's tasks name")
  const query = { entity: "task_person", backend: "native", fields: [] } as const satisfies QueryRegistry
  withQuery(
    annotate(people.command("list"), { effects: LOCAL_READ })
      .summary("the owner and everyone who holds a role on a task")
      .description("the owner and everyone who holds a role on a task, by name; search people finds anyone else"),
    query,
  )
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (words: string[], options: { json?: boolean }) => {
      listQuery(typedQuery(words), query, "people list")
      await withStore(env, async (store) => {
        const found = await store.tasks.taskPeople()
        print(
          options.json,
          wholeList(
            "people list",
            found.map(({ person, ...rest }) => ({ ref: person, ...rest })),
          ),
        )
      })
    })
}
