import { CliError, createRenderer, type Streams } from "@wirecat/cli-base"
import {
  type KnowledgeRelation,
  type MessageStore,
  ORGANIZATION_KINDS,
  type Organization,
  openStore,
  PROJECT_TYPES,
  type Project,
  SCOPES,
} from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { authorOf, byOption } from "../author.js"
import { notesAbout } from "../notes/about.js"
import { accountOptions, oneOf, positive } from "../options.js"
import { snakeKeys } from "../output.js"
import { answering } from "../records/run.js"
import { type AccountScope, selectAccount } from "../store/scope.js"
import { keyDocuments, markKey, projectOf, unmarkKey } from "./key-documents.js"
import { meetingProjectsCommand } from "./meeting-projects-command.js"

export const knowledgeCommands = (program: Command, streams: Streams, env: NodeJS.ProcessEnv) => {
  const run = answering(streams, env)
  const execute = (
    options: AccountScope & { json?: boolean },
    work: (store: MessageStore, key: Awaited<ReturnType<typeof selectAccount>>) => Promise<unknown>,
  ) => run(options.json, async (store) => work(store, await selectAccount(store, options)))
  /** Organisations and relations are the owner's, not an account's. */
  const owned = async (options: { json?: boolean }, work: (store: MessageStore) => Promise<unknown>) => {
    const store = await openStore({ env })
    try {
      const answer = await work(store)
      if (options.json) createRenderer({ format: "json", color: false, streams }).result(snakeKeys(answer))
      else streams.data(`${JSON.stringify(snakeKeys(answer), null, 2)}\n`)
    } finally {
      await store.close()
    }
  }
  /** What the store knows around an organization or a project: its relations, the notes about it, its tags. */
  const contextOf = async (
    store: MessageStore,
    thing: { id: string } | undefined,
    type: "organization" | "project",
    reference: string,
  ) => {
    if (thing === undefined) throw new CliError("not_found", `no ${type} ${reference}; memo ${type}s list shows them`)
    const { id } = thing
    return {
      [type]: thing,
      relationships: (await store.notes.links({ to: `${type}:${id}` }))
        .concat(await store.notes.links({ from: `${type}:${id}` }))
        .filter((link) => link.kind !== "about" && link.kind !== "links-to" && link.role !== "key"),
      notes: await notesAbout(store, { ref: `${type}:${id}` }),
      tags: await store.knowledge.tags(null, { type, id }),
    }
  }
  const organizations = program
    .command("organizations")
    .description("companies, teams, families and communities of yours")
  organizations
    .command("add")
    .description("add an organization of yours: a company, team, family or community")
    .argument("<name>", "the organization's name")
    .requiredOption("--kind <kind>", ORGANIZATION_KINDS.join(", "), oneOf(ORGANIZATION_KINDS))
    .option("--scope <scope>", SCOPES.join(", "), oneOf(SCOPES))
    .option("--json", "print JSON")
    .action((name: string, options: { kind: Organization["kind"]; scope?: Organization["scope"]; json?: boolean }) =>
      owned(options, (store) =>
        store.knowledge.addOrganization({
          kind: options.kind,
          name,
          ...(options.scope === undefined ? {} : { scope: options.scope }),
        }),
      ),
    )
  organizations
    .command("list")
    .description("your organizations")
    .option("--json", "print JSON")
    .action((options: { json?: boolean }) => owned(options, (store) => store.knowledge.organizations()))
  organizations
    .command("context")
    .description(
      "one organization by its id or organization:<id>: its relationships, the notes about or linking it, and its tags",
    )
    .summary("one organization: its relationships, notes and tags")
    .argument("<organization>", "its id or organization:<id>")
    .option("--json", "print JSON")
    .action((reference: string, options: { json?: boolean }) =>
      owned(options, async (store) => {
        const wanted = reference.replace(/^organization:/, "")
        return contextOf(
          store,
          (await store.knowledge.organizations()).find((organization) => organization.id === wanted),
          "organization",
          reference,
        )
      }),
    )
  const projects = program.command("projects").description("projects of yours, each with a short key")
  meetingProjectsCommand(projects, streams, env)
  projects
    .command("add")
    .description("add a project of yours, with a short key its tasks use")
    .argument("<name>", "the project's name")
    .option("--key <key>", "3–4 letters and digits; made from the name when left out")
    .option("--type <type>", PROJECT_TYPES.join(", "), oneOf(PROJECT_TYPES))
    .option("--organization <organization>", "the organization it belongs to: its id or organization:<id>")
    .option("--scope <scope>", SCOPES.join(", "), oneOf(SCOPES))
    .option("--json", "print JSON")
    .action(
      (
        name: string,
        options: {
          key?: string
          type?: Project["type"]
          organization?: string
          scope?: Project["scope"]
          json?: boolean
        },
      ) =>
        owned(options, (store) =>
          store.knowledge.addProject({
            name,
            ...(options.key === undefined ? {} : { key: options.key }),
            ...(options.type === undefined ? {} : { type: options.type }),
            ...(options.organization === undefined
              ? {}
              : { organization: `organization:${options.organization.replace(/^organization:/, "")}` }),
            ...(options.scope === undefined ? {} : { scope: options.scope }),
          }),
        ),
    )
  projects
    .command("list")
    .description("your projects")
    .option("--json", "print JSON")
    .action((options: { json?: boolean }) => owned(options, (store) => store.knowledge.projects()))
  projects
    .command("context")
    .description(
      "one project by its id, key or project:<id>: its key documents first, then its relationships, the notes " +
        "about or linking it, and its tags. Start work on a project here",
    )
    .summary("one project: key documents, relationships, notes and tags; start work here")
    .argument("<project>", "its id, key or project:<id>")
    .option("--json", "print JSON")
    .action((reference: string, options: { json?: boolean }) =>
      owned(options, async (store) => {
        const project = await projectOf(store, reference)
        return {
          keyDocuments: await keyDocuments(store, project),
          ...(await contextOf(store, project, "project", reference)),
        }
      }),
    )
  const keys = projects
    .command("key-documents")
    .description("the notes, files and messages to read first about a project, each with why")
  byOption(
    keys
      .command("add")
      .description("mark a note:, document: or msg: reference as a key document of the project")
      .argument("<project>", "id, key or project:<id>")
      .argument("<reference>", "note:, document: or msg: reference")
      .requiredOption("--reason <text>", "why it is key, in a few words")
      .option("--json", "print JSON"),
  ).action((project: string, reference: string, options: { reason: string; asOwner?: boolean; json?: boolean }) =>
    owned(options, async (store) =>
      markKey(store, await projectOf(store, project), reference, options.reason, authorOf(env, options.asOwner)),
    ),
  )
  keys
    .command("remove")
    .description("unmark a key document; the note, file or message stays")
    .argument("<project>", "id, key or project:<id>")
    .argument("<reference>", "the key document's note:, document: or msg: reference")
    .option("--json", "print JSON")
    .action((project: string, reference: string, options: { json?: boolean }) =>
      owned(options, async (store) => unmarkKey(store, await projectOf(store, project), reference)),
    )
  keys
    .command("list")
    .description("a project's key documents: why, who marked each and whether it is still there")
    .argument("<project>", "id, key or project:<id>")
    .option("--json", "print JSON")
    .action((project: string, options: { json?: boolean }) =>
      owned(options, async (store) => ({ items: await keyDocuments(store, await projectOf(store, project)) })),
    )
  const relations = program
    .command("relationships")
    .description("relations between people, organizations and projects; never between identities")
  byOption(
    relations
      .command("add")
      .description(
        "state that a person, organization or project belongs to or relates to another; an agent's waits for you to confirm it",
      )
      .summary("state that a person, organization or project belongs or relates to another"),
  )
    .argument("<from>", "the person:, organization: or project: that belongs or relates")
    .argument("<to>", "the person:, organization: or project: it belongs or relates to")
    .option("--json", "print JSON")
    .option("--kind <kind>", "member-of or related-to", "member-of")
    .option("--role <role>", "the role it has there, in a few words, such as cto")
    .option("--reason <text>", "why you think so, in a sentence")
    .action(
      (
        from: string,
        to: string,
        options: {
          kind: KnowledgeRelation["kind"]
          role?: string
          reason?: string
          asOwner?: boolean
          json?: boolean
        },
      ) => {
        const author = authorOf(env, options.asOwner)
        return owned(options, (store) =>
          store.knowledge.relate(null, {
            from,
            to,
            kind: options.kind,
            ...(author === "owner" ? {} : { confirmed: false, provenance: `agent:${author.bot}` }),
            ...(options.role === undefined ? {} : { role: options.role }),
            ...(options.reason === undefined ? {} : { evidence: options.reason }),
          }),
        )
      },
    )
  relations
    .command("list")
    .description("relationships, all or those of one reference")
    .option("--reference <reference>", "only those of this person:, organization: or project:")
    .option("--json", "print JSON")
    .action((options: { reference?: string; json?: boolean }) =>
      owned(options, (store) => store.knowledge.relations(null, options.reference)),
    )
  relations
    .command("remove")
    .description("remove a relationship")
    .argument("<id>", "the relationship's id, as relationships list gives it")
    .option("--json", "print JSON")
    .action((id: string, options: { json?: boolean }) =>
      owned(options, (store) => store.knowledge.removeRelation(null, id)),
    )
  relations
    .command("confirm")
    .description("confirm a suggested relationship")
    .argument("<id>", "the relationship's id, as relationships list gives it")
    .option("--json", "print JSON")
    .action((id: string, options: { json?: boolean }) =>
      owned(options, (store) => store.knowledge.confirmRelation(null, id)),
    )
  accountOptions(
    relations
      .command("suggest")
      .description("suggest relationships between email contacts of one domain; you confirm each"),
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
    .description("durable local reminders; poll hands one out and ack confirms it was shown")
  accountOptions(
    reminders.command("add").description("add a reminder for an open task").argument("<task>", "the task's id"),
  )
    .requiredOption("--at-time <time>", "when to remind: an ISO 8601 time with its UTC offset")
    .option("--timezone <zone>", "IANA timezone", "UTC")
    .action((task: string, options: AccountScope & { atTime: string; timezone: string; json?: boolean }) =>
      execute(options, (store, key) => store.knowledge.schedule(key, task, options.atTime, options.timezone)),
    )
  accountOptions(reminders.command("list").description("pending reminders of one account")).action(
    (options: AccountScope & { json?: boolean }) => execute(options, (store, key) => store.knowledge.reminders(key)),
  )
  accountOptions(reminders.command("poll").description("hand out due reminders, each with a receipt to acknowledge"))
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
  accountOptions(
    reminders
      .command("ack")
      .description("confirm that a handed-out reminder was shown")
      .argument("<id>", "the reminder's id")
      .argument("<receipt>", "the receipt reminders poll handed out with it"),
  ).action((id: string, receipt: string, options: AccountScope & { json?: boolean }) =>
    execute(options, (store, key) => store.knowledge.acknowledgeReminder(key, id, receipt)),
  )
  accountOptions(
    reminders.command("cancel").description("cancel a reminder").argument("<id>", "the reminder's id"),
  ).action((id: string, options: AccountScope & { json?: boolean }) =>
    execute(options, (store, key) => store.knowledge.cancelReminder(key, id)),
  )
  accountOptions(
    reminders.command("update").description("move a reminder to another time").argument("<id>", "the reminder's id"),
  )
    .requiredOption("--at-time <time>", "the new time: an ISO 8601 time with its UTC offset")
    .requiredOption("--revision <n>", "the reminder's current revision, as reminders list gives it", positive)
    .action((id: string, options: AccountScope & { atTime: string; revision: number; json?: boolean }) =>
      execute(options, (store, key) => store.knowledge.snoozeReminder(key, id, options.atTime, options.revision)),
    )
}
