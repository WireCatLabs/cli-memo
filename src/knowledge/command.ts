import { CliError, type Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import type { QueryRegistry } from "@wirecat/cli-base/query"
import { type Body, LOCAL_READ, LOCAL_WRITE, queryTerms, termField, withQuery } from "@wirecat/cli-core/cli"
import {
  type AccountKey,
  type KnowledgeRelation,
  type MessageStore,
  ORGANIZATION_KINDS,
  type Organization,
  PROJECT_TYPES,
  type Project,
  SCOPES,
} from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { answers, itemAnswer, listAnswer, wholeList } from "../answer.js"
import { authorOf, byOption } from "../author.js"
import { notesAbout } from "../notes/about.js"
import { oneOf, positive, readScope, writeScope } from "../options.js"
import {
  ACCOUNTS_HELP,
  accountName,
  type SourceOptions,
  theAccount,
  theAccounts,
  type WriteOptions,
  writeAccount,
} from "../store/source-list.js"
import { keyDocuments, markKey, projectOf, unmarkKey } from "./key-documents.js"
import { meetingProjectsCommand } from "./meeting-projects-command.js"

const RELATIONSHIP_QUERY = {
  entity: "relationship",
  backend: "native",
  fields: [
    termField("about", "ref", 'about:"project:1"', {
      relation: "the person, organization or project at either end",
    }),
  ],
} as const satisfies QueryRegistry

export const knowledgeCommands = (program: Command, streams: Streams, env: NodeJS.ProcessEnv) => {
  const { run } = answers(program, streams, env)
  const warn = (text: string) => streams.diagnostic(text)
  const execute = (
    options: SourceOptions & { json?: boolean },
    work: (store: MessageStore, key: AccountKey) => Promise<Body>,
  ) => run(options.json, async (store) => work(store, await theAccount(store, env, options, warn)))
  const act = (
    options: WriteOptions & { json?: boolean },
    work: (store: MessageStore, key: AccountKey) => Promise<Body>,
  ) => run(options.json, async (store) => work(store, await writeAccount(store, env, options, warn)))
  /** Organisations and relations are the owner's, not an account's. */
  const owned = (options: { json?: boolean }, work: (store: MessageStore) => Promise<unknown>) =>
    run(options.json, async (store) => itemAnswer(await work(store)))
  const ownedList = (command: string, options: { json?: boolean }, work: (store: MessageStore) => Promise<unknown[]>) =>
    run(options.json, async (store) => wholeList(command, await work(store)))
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
  annotate(organizations.command("add"), { effects: LOCAL_WRITE })
    .description("add an organization of yours: a company, team, family or community")
    .argument("<name>", "the organization's name")
    .requiredOption("--kind <kind>", ORGANIZATION_KINDS.join(", "), oneOf(ORGANIZATION_KINDS))
    .option("--scope <scope>", SCOPES.join(", "), oneOf(SCOPES))
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((name: string, options: { kind: Organization["kind"]; scope?: Organization["scope"]; json?: boolean }) =>
      owned(options, (store) =>
        store.knowledge.addOrganization({
          kind: options.kind,
          name,
          ...(options.scope === undefined ? {} : { scope: options.scope }),
        }),
      ),
    )
  annotate(organizations.command("list"), { effects: LOCAL_READ })
    .description("your organizations")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((options: { json?: boolean }) =>
      ownedList("organizations list", options, (store) => store.knowledge.organizations()),
    )
  annotate(organizations.command("context"), { effects: LOCAL_READ })
    .description(
      "one organization by its id or organization:<id>: its relationships, the notes about or linking it, and its tags",
    )
    .summary("one organization: its relationships, notes and tags")
    .argument("<organization>", "its id or organization:<id>")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
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
  annotate(projects.command("add"), { effects: LOCAL_WRITE })
    .description("add a project of yours, with a short key its tasks use")
    .argument("<name>", "the project's name")
    .option("--key <key>", "3–4 letters and digits; made from the name when left out")
    .option("--type <type>", PROJECT_TYPES.join(", "), oneOf(PROJECT_TYPES))
    .option("--organization <organization>", "the organization it belongs to: its id or organization:<id>")
    .option("--scope <scope>", SCOPES.join(", "), oneOf(SCOPES))
    .option("--json", "print JSON; --json=id,title keeps only those fields")
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
  annotate(projects.command("list"), { effects: LOCAL_READ })
    .description("your projects")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((options: { json?: boolean }) => ownedList("projects list", options, (store) => store.knowledge.projects()))
  annotate(projects.command("context"), { effects: LOCAL_READ })
    .description(
      "one project by its id, key or project:<id>: its key documents first, then its relationships, the notes " +
        "about or linking it, and its tags. Start work on a project here",
    )
    .summary("one project: key documents, relationships, notes and tags; start work here")
    .argument("<project>", "its id, key or project:<id>")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
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
    annotate(keys.command("add"), { effects: LOCAL_WRITE })
      .description("mark a note:, document: or msg: reference as a key document of the project")
      .argument("<project>", "id, key or project:<id>")
      .argument("<reference>", "note:, document: or msg: reference")
      .requiredOption("--reason <text>", "why it is key, in a few words")
      .option("--json", "print JSON; --json=id,title keeps only those fields"),
  ).action((project: string, reference: string, options: { reason: string; asOwner?: boolean; json?: boolean }) =>
    owned(options, async (store) =>
      markKey(store, await projectOf(store, project), reference, options.reason, authorOf(env, options.asOwner)),
    ),
  )
  annotate(keys.command("remove"), { effects: LOCAL_WRITE })
    .description("unmark a key document; the note, file or message stays")
    .argument("<project>", "id, key or project:<id>")
    .argument("<reference>", "the key document's note:, document: or msg: reference")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((project: string, reference: string, options: { json?: boolean }) =>
      owned(options, async (store) => unmarkKey(store, await projectOf(store, project), reference)),
    )
  annotate(keys.command("list"), { effects: LOCAL_READ })
    .description("a project's key documents: why, who marked each and whether it is still there")
    .argument("<project>", "id, key or project:<id>")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((project: string, options: { json?: boolean }) =>
      ownedList("projects key-documents list", options, async (store) =>
        keyDocuments(store, await projectOf(store, project)),
      ),
    )
  const relations = program
    .command("relationships")
    .description("relations between people, organizations and projects; never between identities")
  byOption(
    annotate(relations.command("add"), { effects: LOCAL_WRITE })
      .description(
        "state that a person, organization or project belongs to or relates to another; an agent's waits for you to confirm it",
      )
      .summary("state that a person, organization or project belongs or relates to another"),
  )
    .argument("<from>", "the person:, organization: or project: that belongs or relates")
    .argument("<to>", "the person:, organization: or project: it belongs or relates to")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
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
  withQuery(
    annotate(relations.command("list"), { effects: LOCAL_READ }).description(
      "relationships, all or those of one reference",
    ),
    RELATIONSHIP_QUERY,
  )
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((words: string[], options: { json?: boolean }) =>
      ownedList("relationships list", options, (store) =>
        store.knowledge.relations(null, queryTerms(words, RELATIONSHIP_QUERY, "relationships list").get("about")),
      ),
    )
  annotate(relations.command("remove"), { effects: LOCAL_WRITE })
    .description("remove a relationship")
    .argument("<id>", "the relationship's id, as relationships list gives it")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((id: string, options: { json?: boolean }) =>
      owned(options, (store) => store.knowledge.removeRelation(null, id)),
    )
  annotate(relations.command("confirm"), { effects: LOCAL_WRITE })
    .description("confirm a suggested relationship")
    .argument("<id>", "the relationship's id, as relationships list gives it")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((id: string, options: { json?: boolean }) =>
      owned(options, (store) => store.knowledge.confirmRelation(null, id)),
    )
  readScope(
    annotate(relations.command("suggest"), { effects: LOCAL_READ }).description(
      "suggest relationships between email contacts of one domain; you confirm each",
    ),
  )
    .option("--limit <n>", "most suggestions, at most 100", positive, 20)
    .action((options: SourceOptions & { limit: number; json?: boolean }) =>
      execute(options, async (store, key) => {
        if (key.provider !== "email" || options.limit > 100)
          throw new CliError("validation_error", "suggestions require an email account and limit 1–100")
        const contacts = await store.people.contacts(key, { order: "name", limit: 500, offset: 0 })
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
          const person = await store.people.personOf({ provider: key.provider, id: contact.id })
          if (person) domains.set(domain, [...new Set([...(domains.get(domain) ?? []), person.uid])])
        }
        const suggestions = []
        for (const [domain, people] of domains)
          for (let left = 0; left < people.length; left++)
            for (let right = left + 1; right < people.length; right++) {
              if (suggestions.length >= options.limit)
                return listAnswer("relationships suggest", { items: suggestions, limit: options.limit, has_more: true })
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
        return listAnswer("relationships suggest", {
          items: suggestions,
          limit: options.limit,
          has_more: contacts.hasMore,
        })
      }),
    )
  const reminders = program
    .command("reminders")
    .description("durable local reminders; poll hands one out and ack confirms it was shown")
  writeScope(
    annotate(reminders.command("add"), { effects: LOCAL_WRITE })
      .description("add a reminder for an open task")
      .argument("<task>", "the task's id"),
  )
    .requiredOption("--at-time <time>", "when to remind: an ISO 8601 time with its UTC offset")
    .option("--timezone <zone>", "IANA timezone", "UTC")
    .action((task: string, options: WriteOptions & { atTime: string; timezone: string; json?: boolean }) =>
      act(options, async (store, key) =>
        itemAnswer(await store.knowledge.schedule(key, task, options.atTime, options.timezone)),
      ),
    )
  readScope(
    annotate(reminders.command("list"), { effects: LOCAL_READ }).description(
      "pending reminders of the accounts --source names, soonest first",
    ),
    ACCOUNTS_HELP,
  ).action((options: SourceOptions & { json?: boolean }) =>
    run(options.json, async (store) => {
      const keys = await theAccounts(store, env, options, warn)
      const items = (
        await Promise.all(
          keys.map(async (key) =>
            (await store.knowledge.reminders(key)).map((reminder) => ({ ...reminder, account: accountName(key) })),
          ),
        )
      )
        .flat()
        .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
      return listAnswer("reminders list", {
        items,
        limit: Math.max(1, items.length),
        has_more: false,
        meta: { accounts: keys.map(accountName) },
      })
    }),
  )
  writeScope(
    annotate(reminders.command("poll"), { effects: LOCAL_WRITE }).description(
      "hand out due reminders, each with a receipt to acknowledge",
    ),
  )
    .option("--limit <n>", "most due reminders, at most 500", positive, 100)
    .action((options: WriteOptions & { limit: number; json?: boolean }) =>
      act(options, async (store, key) => {
        const claimed = await store.knowledge.claimReminders(key, { limit: options.limit })
        return listAnswer("reminders poll", {
          items: claimed.map((reminder) => ({
            ...reminder,
            deliveryId: `${reminder.id}:${reminder.revision}`,
            delivery: "local",
          })),
          limit: options.limit,
          has_more: claimed.length >= options.limit,
        })
      }),
    )
  writeScope(
    annotate(reminders.command("ack"), { effects: LOCAL_WRITE })
      .description("confirm that a handed-out reminder was shown")
      .argument("<id>", "the reminder's id")
      .argument("<receipt>", "the receipt reminders poll handed out with it"),
  ).action((id: string, receipt: string, options: WriteOptions & { json?: boolean }) =>
    act(options, async (store, key) => itemAnswer(await store.knowledge.acknowledgeReminder(key, id, receipt))),
  )
  writeScope(
    annotate(reminders.command("cancel"), { effects: LOCAL_WRITE })
      .description("cancel a reminder")
      .argument("<id>", "the reminder's id"),
  ).action((id: string, options: WriteOptions & { json?: boolean }) =>
    act(options, async (store, key) => itemAnswer(await store.knowledge.cancelReminder(key, id))),
  )
  writeScope(
    annotate(reminders.command("update"), { effects: LOCAL_WRITE })
      .description("move a reminder to another time")
      .argument("<id>", "the reminder's id"),
  )
    .requiredOption("--at-time <time>", "the new time: an ISO 8601 time with its UTC offset")
    .requiredOption("--revision <n>", "the reminder's current revision, as reminders list gives it", positive)
    .action((id: string, options: WriteOptions & { atTime: string; revision: number; json?: boolean }) =>
      act(options, async (store, key) =>
        itemAnswer(await store.knowledge.snoozeReminder(key, id, options.atTime, options.revision)),
      ),
    )
}
