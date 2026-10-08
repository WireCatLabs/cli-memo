import { CliError, createRenderer, type Streams } from "@leemour/cli-core"
import {
  type KnowledgeEntity,
  type KnowledgeRelation,
  type MessageStore,
  openStore,
} from "@leemour/cli-messaging/store"
import type { Command } from "commander"
import { accountOptions } from "../annotations/command.js"
import { positive } from "../options.js"
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
  const entities = program.command("entities").description("Manual organizations, families, projects and groups")
  accountOptions(entities.command("add").argument("<name>"))
    .requiredOption("--kind <kind>", "organization, family, project or group")
    .action((name: string, options: AccountScope & { kind: KnowledgeEntity["kind"]; json?: boolean }) =>
      execute(options, (store, key) => store.knowledge.addEntity(key, options.kind, name)),
    )
  accountOptions(entities.command("list")).action((options: AccountScope & { json?: boolean }) =>
    execute(options, (store, key) => store.knowledge.entities(key)),
  )
  accountOptions(entities.command("context").argument("<uid>")).action(
    (uid: string, options: AccountScope & { json?: boolean }) =>
      execute(options, async (store, key) => ({
        entity: (await store.knowledge.entities(key)).find((entity) => entity.id === uid) ?? null,
        relationships: await store.knowledge.relations(key, `entity:${uid}`),
        annotations: await store.knowledge.annotations(key, { target: { type: "entity", id: uid } }),
        tags: await store.knowledge.tags(key, { type: "entity", id: uid }),
        scope: key,
      })),
  )
  const relations = program
    .command("relationships")
    .description("Explicit relations between person:<uid> and entity:<uid>; this never links identities")
  accountOptions(relations.command("add").argument("<from>").argument("<to>"))
    .option("--kind <kind>", "member-of or related-to", "member-of")
    .option("--role <role>")
    .option("--evidence <text>")
    .action(
      (
        from: string,
        to: string,
        options: AccountScope & { kind: KnowledgeRelation["kind"]; role?: string; evidence?: string; json?: boolean },
      ) =>
        execute(options, (store, key) =>
          store.knowledge.relate(key, {
            from,
            to,
            kind: options.kind,
            ...(options.role === undefined ? {} : { role: options.role }),
            ...(options.evidence === undefined ? {} : { evidence: options.evidence }),
          }),
        ),
    )
  accountOptions(relations.command("list"))
    .option("--reference <reference>")
    .action((options: AccountScope & { reference?: string; json?: boolean }) =>
      execute(options, (store, key) => store.knowledge.relations(key, options.reference)),
    )
  accountOptions(relations.command("remove").argument("<id>")).action(
    (id: string, options: AccountScope & { json?: boolean }) =>
      execute(options, (store, key) => store.knowledge.removeRelation(key, id)),
  )
  accountOptions(relations.command("confirm").argument("<id>")).action(
    (id: string, options: AccountScope & { json?: boolean }) =>
      execute(options, (store, key) => store.knowledge.confirmRelation(key, id)),
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
