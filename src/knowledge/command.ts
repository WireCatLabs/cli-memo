import { CliError, createRenderer, type Streams } from "@leemour/cli-core"
import {
  type KnowledgeEntity,
  type KnowledgeRelation,
  type MessageStore,
  openStore,
} from "@leemour/cli-messaging/store"
import type { Command } from "commander"
import { notesAbout } from "../notes/about.js"
import { accountOptions, positive } from "../options.js"
import { type AccountScope, selectAccount } from "../store/scope.js"

export const knowledgeCommands = (program: Command, streams: Streams, env: NodeJS.ProcessEnv) => {
  const execute = async (
    options: AccountScope & { json?: boolean },
    work: (store: MessageStore, key: Awaited<ReturnType<typeof selectAccount>>) => Promise<unknown>,
  ) => {
    const store = await openStore({ env })
    try {
      const answer = await work(store, await selectAccount(store, options))
      if (options.json) createRenderer({ format: "json", color: false, streams }).result(answer)
      else streams.data(`${JSON.stringify(answer, null, 2)}\n`)
    } finally {
      await store.close()
    }
  }
  /** Organisations and relations are the owner's, not an account's. */
  const owned = async (options: { json?: boolean }, work: (store: MessageStore) => Promise<unknown>) => {
    const store = await openStore({ env })
    try {
      const answer = await work(store)
      if (options.json) createRenderer({ format: "json", color: false, streams }).result(answer)
      else streams.data(`${JSON.stringify(answer, null, 2)}\n`)
    } finally {
      await store.close()
    }
  }
  const entities = program.command("entities").description("Organizations, families, projects and groups of yours")
  entities
    .command("add")
    .argument("<name>")
    .requiredOption("--kind <kind>", "organization, family, project or group")
    .option("--json", "print JSON")
    .action((name: string, options: { kind: KnowledgeEntity["kind"]; json?: boolean }) =>
      owned(options, (store) => store.notes.addEntity(options.kind, name)),
    )
  entities
    .command("list")
    .option("--json", "print JSON")
    .action((options: { json?: boolean }) => owned(options, (store) => store.notes.entities()))
  entities
    .command("context")
    .argument("<id>")
    .option("--json", "print JSON")
    .action((id: string, options: { json?: boolean }) =>
      owned(options, async (store) => {
        const ref = `entity:${id}`
        return {
          entity: (await store.notes.entities()).find((entity) => entity.id === id) ?? null,
          relationships: (await store.notes.links({ to: ref }))
            .concat(await store.notes.links({ from: ref }))
            .filter((link) => link.kind !== "about" && link.kind !== "links-to"),
          notes: await notesAbout(store, { ref }),
          tags: await store.knowledge.tags(null, { type: "entity", id }),
        }
      }),
    )
  const relations = program
    .command("relationships")
    .description("Explicit relations between person:<uid> and entity:<uid>; this never links identities")
  relations
    .command("add")
    .argument("<from>")
    .argument("<to>")
    .option("--json", "print JSON")
    .option("--kind <kind>", "member-of or related-to", "member-of")
    .option("--role <role>")
    .option("--evidence <text>")
    .action(
      (
        from: string,
        to: string,
        options: { kind: KnowledgeRelation["kind"]; role?: string; evidence?: string; json?: boolean },
      ) =>
        owned(options, (store) =>
          store.knowledge.relate(null, {
            from,
            to,
            kind: options.kind,
            ...(options.role === undefined ? {} : { role: options.role }),
            ...(options.evidence === undefined ? {} : { evidence: options.evidence }),
          }),
        ),
    )
  relations
    .command("list")
    .option("--reference <reference>")
    .option("--json", "print JSON")
    .action((options: { reference?: string; json?: boolean }) =>
      owned(options, (store) => store.knowledge.relations(null, options.reference)),
    )
  relations
    .command("remove")
    .argument("<id>")
    .option("--json", "print JSON")
    .action((id: string, options: { json?: boolean }) =>
      owned(options, (store) => store.knowledge.removeRelation(null, id)),
    )
  relations
    .command("confirm")
    .argument("<id>")
    .option("--json", "print JSON")
    .action((id: string, options: { json?: boolean }) =>
      owned(options, (store) => store.knowledge.confirmRelation(null, id)),
    )
  accountOptions(
    relations
      .command("suggest")
      .description("Store weak shared-domain suggestions for direct email contacts; confirmation is explicit"),
  )
    .option("--limit <n>", "most suggestions, at most 100", positive, 20)
    .action((options: AccountScope & { limit: number; json?: boolean }) =>
      execute(options, async (store, key) => {
        if (key.provider !== "email" || options.limit > 100)
          throw new CliError("validation_error", "suggestions require an email account and limit 1–100")
        const contacts = await store.contacts(key, { order: "name", limit: 500, offset: 0 })
        const domains = new Map<string, string[]>()
        const free = new Set([
          "gmail.com",
          "outlook.com",
          "hotmail.com",
          "yahoo.com",
          "icloud.com",
          "proton.me",
          "protonmail.com",
        ])
        for (const contact of contacts.items) {
          const domain = contact.id.split("@")[1]?.toLowerCase()
          if (!domain || free.has(domain)) continue
          const person = await store.personOf({ provider: key.provider, id: contact.id })
          if (person) domains.set(domain, [...new Set([...(domains.get(domain) ?? []), person.uid])])
        }
        const suggestions = []
        for (const [domain, people] of domains)
          for (let left = 0; left < people.length; left++)
            for (let right = left + 1; right < people.length; right++) {
              if (suggestions.length >= options.limit)
                return { suggestions, complete: false, scope: "stored-direct-email-contacts" }
              suggestions.push(
                await store.knowledge.relate(key, {
                  from: `person:${people[left]}`,
                  to: `person:${people[right]}`,
                  kind: "related-to",
                  confirmed: false,
                  evidence: `Shared email domain ${domain}; this does not prove organization membership`,
                  provenance: "rule:email-domain-v1;confidence:weak",
                }),
              )
            }
        return { suggestions, complete: !contacts.hasMore, scope: "stored-direct-email-contacts" }
      }),
    )
  const reminders = program
    .command("reminders")
    .description("Durable local reminders; poll leases a delivery and ack confirms it")
  accountOptions(reminders.command("schedule").argument("<task>"))
    .requiredOption("--at <timestamp>", "ISO timestamp with UTC offset")
    .option("--timezone <zone>", "IANA timezone", "UTC")
    .action((task: string, options: AccountScope & { at: string; timezone: string; json?: boolean }) =>
      execute(options, (store, key) => store.knowledge.schedule(key, task, options.at, options.timezone)),
    )
  accountOptions(reminders.command("list")).action((options: AccountScope & { json?: boolean }) =>
    execute(options, (store, key) => store.knowledge.reminders(key)),
  )
  accountOptions(reminders.command("poll"))
    .option("--limit <n>", "most due reminders, at most 500", positive, 100)
    .action((options: AccountScope & { limit: number; json?: boolean }) =>
      execute(options, async (store, key) =>
        (await store.knowledge.claimReminders(key, { limit: options.limit })).map((reminder) => ({
          ...reminder,
          deliveryId: `${reminder.id}:${reminder.revision}`,
          delivery: "local",
        })),
      ),
    )
  accountOptions(reminders.command("ack").argument("<id>").argument("<receipt>")).action(
    (id: string, receipt: string, options: AccountScope & { json?: boolean }) =>
      execute(options, (store, key) => store.knowledge.acknowledgeReminder(key, id, receipt)),
  )
  accountOptions(reminders.command("cancel").argument("<id>")).action(
    (id: string, options: AccountScope & { json?: boolean }) =>
      execute(options, (store, key) => store.knowledge.cancelReminder(key, id)),
  )
  accountOptions(reminders.command("snooze").argument("<id>"))
    .requiredOption("--at <timestamp>")
    .requiredOption("--revision <n>", "current revision", positive)
    .action((id: string, options: AccountScope & { at: string; revision: number; json?: boolean }) =>
      execute(options, (store, key) => store.knowledge.snoozeReminder(key, id, options.at, options.revision)),
    )
}
