import { resolve } from "node:path"
import { CliError, type Streams } from "@leemour/cli-core"
import { openStore } from "@leemour/cli-messaging/store"
import type { Command } from "commander"
import { identityOf } from "./identity.js"
import { loadNotesMap, saveNotesMap } from "./notes-map.js"

/** Who is who is linked in messaging (`tg contacts link`); only the note about a person is ours. */
export const noteCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  program
    .command("note")
    .description("Name the note that is about a person, or show it")
    .argument("<identity>", "<messenger>:<name or id> of any identity of the person")
    .argument("[path]", "the Markdown note about them")
    .option("--clear", "forget the note")
    .action(async (identity: string, path: string | undefined, options: { clear?: boolean }) => {
      const store = await openStore({ env })
      try {
        const person = await store.personOf(await identityOf(store, identity))
        if (person === undefined) throw new CliError("not_found", `the store has no person for "${identity}"`)
        const map = loadNotesMap(env)
        if (options.clear) delete map[person.uid]
        else if (path !== undefined) map[person.uid] = resolve(path)
        if (options.clear || path !== undefined) saveNotesMap(map, env)
        streams.data(`${person.name ?? person.uid}: ${map[person.uid] ?? "no note"}\n`)
      } finally {
        await store.close()
      }
    })
}
