import { resolve } from "node:path"
import { CliError, createRenderer, type Streams } from "@leemour/cli-core"
import { type MessageStore, openStore } from "@leemour/cli-messaging/store"
import type { Command } from "commander"
import { identityOf, personText } from "./identity.js"
import { loadNotesMap, saveNotesMap } from "./notes-map.js"

const LINK = { method: "manual", by: "owner" }

export const peopleCommands = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const withStore = async (work: (store: MessageStore) => Promise<unknown>, json?: boolean) => {
    const store = await openStore({ env })
    try {
      const result = await work(store)
      if (json) createRenderer({ format: "json", color: false, streams }).result(result)
      else streams.data(`${typeof result === "string" ? result : JSON.stringify(result)}\n`)
    } finally {
      await store.close()
    }
  }

  program
    .command("link")
    .description("Record that two identities are one person — across tg, MAX and mail; a same name is never enough")
    .argument("<person>", "<messenger>:<name or id>, e.g. telegram:Ana or email:ana@example.com")
    .argument("<other>", "the identity to join to them, written the same way")
    .option("--json", "print JSON")
    .action((person: string, other: string, options: { json?: boolean }) =>
      withStore(async (store) => {
        const linked = await store.linkIdentities(await identityOf(store, person), await identityOf(store, other), LINK)
        return options.json ? linked : personText(linked)
      }, options.json),
    )

  program
    .command("unlink")
    .description("Take one identity back out of the person it was linked to")
    .argument("<identity>", "<messenger>:<name or id>")
    .option("--json", "print JSON")
    .action((identity: string, options: { json?: boolean }) =>
      withStore(async (store) => {
        const person = await store.unlinkIdentity(await identityOf(store, identity), LINK)
        return options.json ? person : personText(person)
      }, options.json),
    )

  program
    .command("note")
    .description("Name the note that is about a person, or show it")
    .argument("<identity>", "<messenger>:<name or id> of any identity of the person")
    .argument("[path]", "the Markdown note about them")
    .option("--clear", "forget the note")
    .action((identity: string, path: string | undefined, options: { clear?: boolean }) =>
      withStore(async (store) => {
        const person = await store.personOf(await identityOf(store, identity))
        if (person === undefined) throw new CliError("not_found", `the store has no person for "${identity}"`)
        const map = loadNotesMap(env)
        if (options.clear) delete map[person.uid]
        else if (path !== undefined) map[person.uid] = resolve(path)
        if (options.clear || path !== undefined) saveNotesMap(map, env)
        return `${person.name ?? person.uid}: ${map[person.uid] ?? "no note"}`
      }),
    )
}
