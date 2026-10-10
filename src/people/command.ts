import { join } from "node:path"
import { CliError, type Streams } from "@wirecat/cli-core"
import { openStore } from "@wirecat/cli-messaging/store"
import type { Command } from "commander"
import { boundFolders, folderOfFile } from "../notes/bound.js"
import { folderNotes } from "../notes/import.js"
import { identityOf } from "./identity.js"
import { importNotesMap } from "./notes-map.js"

/** Who is who is linked in messaging (`tg contacts link`); the note about a person is an `about` link. */
export const noteCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  program
    .command("note")
    .description("Name the note that is about a person, or show it")
    .argument("<identity>", "<messenger>:<name or id> of any identity of the person")
    .argument("[path]", "the note about them, a file in a configured folder")
    .option("--clear", "forget which file note is about them")
    .action(async (identity: string, path: string | undefined, options: { clear?: boolean }) => {
      const store = await openStore({ env })
      try {
        const folders = await boundFolders(store, env, { strict: false })
        await importNotesMap(store, env, folders)
        const person = await store.personOf(await identityOf(store, identity))
        if (person === undefined) throw new CliError("not_found", `the store has no person for "${identity}"`)
        const to = `person:${person.uid}`
        const files = async () => {
          const found = []
          for (const link of await store.notes.links({ to })) {
            if (link.kind !== "about" || link.origin !== "owner") continue
            const note = await store.notes.note(link.from.replace(/^note:/, "")).catch(() => undefined)
            if (note?.source === "file" && note.deletedAt === null) found.push({ link, note })
          }
          return found
        }
        if (options.clear) for (const { link } of await files()) await store.notes.removeLink(link.id)
        else if (path !== undefined) {
          const { folder, path: inside } = folderOfFile(folders, path)
          const note = (await folderNotes(store, folder.id)).find((candidate) => candidate.path === inside)
          if (!note) throw new CliError("not_found", `${path} is not imported yet — memo notes import`)
          await store.notes.addLink({ from: `note:${note.id}`, to, kind: "about", origin: "owner" })
        }
        const shown = (await files()).map(({ note }) => {
          const folder = folders.find((candidate) => candidate.id === note.folderId)
          return folder ? join(folder.path, note.path as string) : `note:${note.id}`
        })
        streams.data(`${person.name ?? person.uid}: ${shown.join(", ") || "no note"}\n`)
      } finally {
        await store.close()
      }
    })
}
