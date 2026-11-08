import { CliError, type Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { timezoneOf } from "@wirecat/cli-base/query"
import { ENGAGEMENT_LEVELS, type Engagement } from "@wirecat/cli-core"
import {
  answerEntity,
  type Body,
  LOCAL_READ,
  LOCAL_WRITE,
  listQuery,
  queryTerms,
  typedQuery,
  withQuery,
} from "@wirecat/cli-core/cli"
import { proposalRegistry, purposesOf } from "@wirecat/cli-core/services"
import {
  type AccountKey,
  type KnowledgeRelation,
  type MessageStore,
  ORGANIZATION_KINDS,
  ORGANIZATIONS_QUERY,
  type Organization,
  PROJECT_TYPES,
  PROJECTS_QUERY,
  type Project,
  REMINDERS_QUERY,
  SCOPES,
} from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { answers, itemAnswer, listAnswer, wholeList, withStore } from "../answer.js"
import { byOption, deciderOf, reasonOption, whoRuns } from "../author.js"
import { notesAbout } from "../notes/about.js"
import { oneOf, positive, readScope, writeScope } from "../options.js"
import { withOwner } from "../people/owner.js"
import { decideOne, decisionOf } from "../review/review.js"
import {
  ACCOUNTS_HELP,
  accountName,
  type SourceOptions,
  theAccounts,
  type WriteOptions,
  writeAccount,
} from "../store/source-list.js"
import { keyDocuments, markKey, projectOf, unmarkKey } from "./key-documents.js"
import { KEY_DOCUMENTS_QUERY, keyDocument } from "./list-queries.js"
import { meetingProjectsCommand } from "./meeting-projects-command.js"
import { projectActionsCommand } from "./project-actions-command.js"
import { projectContext, projectContextText } from "./project-context.js"
import { projectGatherCommand } from "./project-gather-command.js"
import { projectStatusCommand } from "./project-status-command.js"
import { projectTransferCommand } from "./project-transfer-command.js"
import { listRelationships, RELATIONSHIP_QUERY, relationshipsText } from "./relationships.js"
import { relationshipsScanCommand, scanStep } from "./relationships-scan.js"

/** A suggested link the review lists as `link:<id>`; deciding it goes through the same registry as review. */
const pendingLink = async (store: MessageStore, id: string) => {
  try {
    return await proposalRegistry(store).get(`link:${id}`)
  } catch (error) {
    if (error instanceof CliError && error.code === "not_found") return undefined
    throw error
  }
}

const ENGAGEMENT_HELP =
  "a person on a project: how much you deal with them yourself, not how active they are: none, low, medium or high"

export const knowledgeCommands = (program: Command, streams: Streams, env: NodeJS.ProcessEnv) => {
  const { run, print } = answers(program, streams, env)
  const warn = (text: string) => streams.diagnostic(text)
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
  annotate(organizations.command("add"), { effects: LOCAL_WRITE, literal_after_dashes: true })
    .description(
      "add an organization of yours: a company, team, family or community; it is written at once, whoever runs it",
    )
    .summary("add an organization")
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
  annotate(organizations.command("rename"), { effects: LOCAL_WRITE, literal_after_dashes: true })
    .description("rename an organization of yours; it is written at once, whoever runs it")
    .summary("rename an organization")
    .argument("<organization>", "its id or organization:<id>")
    .argument("<name>", "the new name")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((reference: string, name: string, options: { json?: boolean }) =>
      owned(options, (store) =>
        store.knowledge.updateOrganization(`organization:${reference.replace(/^organization:/, "")}`, { name }),
      ),
    )
  annotate(organizations.command("show"), { effects: LOCAL_READ })
    .description("one organization by its id or organization:<id>, without its relationships, notes and tags")
    .summary("one organization")
    .argument("<organization>", "its id or organization:<id>")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((reference: string, options: { json?: boolean }) =>
      owned(options, async (store) => {
        const wanted = reference.replace(/^organization:/, "")
        const found = (await store.knowledge.organizations()).find((organization) => organization.id === wanted)
        if (found === undefined)
          throw new CliError("not_found", `no organization ${reference}; memo organizations list shows them`)
        return found
      }),
    )
  withQuery(annotate(organizations.command("list"), { effects: LOCAL_READ }), ORGANIZATIONS_QUERY)
    .description("your organizations")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((words: string[], options: { json?: boolean }) => {
      const query = listQuery(typedQuery(words), ORGANIZATIONS_QUERY, "organizations list")
      return ownedList("organizations list", options, (store) => store.knowledge.organizations(query))
    })
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
  annotate(projects.command("add"), { effects: LOCAL_WRITE, literal_after_dashes: true })
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
  withQuery(annotate(projects.command("list"), { effects: LOCAL_READ }), PROJECTS_QUERY)
    .description("your projects")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((words: string[], options: { json?: boolean }) => {
      const query = listQuery(typedQuery(words), PROJECTS_QUERY, "projects list")
      return ownedList("projects list", options, (store) => store.knowledge.projects(query))
    })
  annotate(projects.command("context"), { effects: LOCAL_READ })
    .description(
      "one project by its id, project:<id>, key, exact name or alias: its key documents first, then its " +
        "relationships, notes, tags, pending findings and open tasks. Review proposals together; nothing is confirmed. `review.waiting` counts what waits for you, by kind, " +
        "and `next` names the command that lists them",
    )
    .summary("one project: key documents, pending findings and open tasks; start work here")
    .argument("<project>", "its id, project:<id>, key, exact name or alias")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (reference: string, options: { json?: boolean }) => {
      const { context, next } = await withStore(env, async (store) => {
        const context = await projectContext(store, env, reference)
        return { context, next: await scanStep(store, context.project, "all") }
      })
      print(options.json, itemAnswer(context, next.length ? { next } : {}), projectContextText(context))
    })
  projectGatherCommand(projects, print, env, warn)
  projectStatusCommand(projects, print, env)
  projectActionsCommand(projects, streams, env)
  projectTransferCommand(projects, streams, env)
  const keys = projects
    .command("key-documents")
    .description("the notes, files and messages to read first about a project, each with why")
  byOption(
    annotate(keys.command("add"), { effects: LOCAL_WRITE })
      .description("mark a note:, document: or msg: reference as a key document of the project")
      .argument("<project>", "id, project:<id>, key, exact name or alias")
      .argument("<reference>", "note:, document: or msg: reference")
      .requiredOption("--reason <text>", "why it is key, in a few words")
      .option("--json", "print JSON; --json=id,title keeps only those fields"),
  ).action(
    async (
      project: string,
      reference: string,
      options: { reason: string; asOwner?: boolean; json?: boolean },
      command: Command,
    ) => {
      const by = await whoRuns(command, env, { asOwner: options.asOwner, question: "mark it key as you?" })
      await owned(options, async (store) =>
        markKey(store, await projectOf(store, project), reference, options.reason, by),
      )
    },
  )
  byOption(
    annotate(keys.command("remove"), { effects: LOCAL_WRITE })
      .description("unmark a key document; the note, file or message stays. Only you remove one")
      .argument("<project>", "id, project:<id>, key, exact name or alias")
      .argument("<reference>", "the key document's note:, document: or msg: reference")
      .option("--json", "print JSON; --json=id,title keeps only those fields"),
  ).action(
    async (project: string, reference: string, options: { asOwner?: boolean; json?: boolean }, command: Command) => {
      const by = await deciderOf(command, env, { ...options, question: `unmark ${reference} as you, the owner?` })
      await owned(options, async (store) => unmarkKey(store, await projectOf(store, project), reference, by))
    },
  )
  answerEntity(
    withQuery(
      annotate(keys.command("list"), { effects: LOCAL_READ })
        .description("a project's key documents: why, who marked each and whether it is still there")
        .argument("<project>", "id, project:<id>, key, exact name or alias"),
      KEY_DOCUMENTS_QUERY,
    ),
    "memo_key_document",
    keyDocument,
  )
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((project: string, words: string[], options: { json?: boolean }) => {
      const id = queryTerms(words, KEY_DOCUMENTS_QUERY, "projects key-documents list").get("id")
      return ownedList("projects key-documents list", options, async (store) =>
        keyDocuments(store, await projectOf(store, project), id === undefined ? {} : { id }),
      )
    })
  const relations = program
    .command("relationships")
    .description("relations between people, organizations and projects; never between identities")
  byOption(
    annotate(relations.command("add"), { effects: LOCAL_WRITE })
      .description(
        "state that a person, organization or project belongs to or relates to another, or that a chat is a project's " +
          "(member-of only); an agent's waits for you to confirm it",
      )
      .summary("state that a person, organization, project or chat belongs or relates to another"),
  )
    .argument(
      "<from>",
      "the person:, organization: or project: that belongs or relates, or chat:<provider>/<account>/<chat> of a project",
    )
    .argument("<to>", "the person:, organization: or project: it belongs or relates to")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .option("--kind <kind>", "member-of or related-to", "member-of")
    .option("--role <role>", "the role it has there, from its list, such as approver on a project")
    .option("--role-note <text>", "what the role means here, in your words, beside a role from its list")
    .option("--engagement <level>", ENGAGEMENT_HELP, oneOf(ENGAGEMENT_LEVELS))
    .option("--reason <text>", "why you think so, in a sentence")
    .action(
      async (
        from: string,
        to: string,
        options: {
          kind: KnowledgeRelation["kind"]
          role?: string
          roleNote?: string
          engagement?: Engagement
          reason?: string
          asOwner?: boolean
          json?: boolean
        },
        command: Command,
      ) => {
        const by = await whoRuns(command, env, { asOwner: options.asOwner, question: "state it as yours?" })
        return owned(options, async (store) => {
          const input = {
            from: await withOwner(store, from),
            to: await withOwner(store, to),
            kind: options.kind,
            ...(options.role === undefined ? {} : { role: options.role }),
            ...(options.roleNote === undefined ? {} : { roleNote: options.roleNote }),
            ...(options.engagement === undefined ? {} : { engagement: options.engagement }),
            ...(options.reason === undefined ? {} : { evidence: options.reason }),
          }
          return by === "owner"
            ? store.knowledge.relate(null, { ...input, by })
            : store.knowledge.relate(null, { ...input, by })
        })
      },
    )
  withQuery(
    annotate(relations.command("list"), { effects: LOCAL_READ })
      .description(
        "relationships, all or those of one reference, with titles; confirmed:false lists the proposals waiting for " +
          "you, as memo review kind:relationship does",
      )
      .summary("relationships with titles; confirmed:false lists those waiting for you"),
    RELATIONSHIP_QUERY,
  )
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (words: string[], options: { json?: boolean }) => {
      const found = await withStore(env, (store) => listRelationships(store, words))
      print(
        options.json,
        listAnswer("relationships list", { items: found.items, limit: found.limit, has_more: found.hasMore }),
        relationshipsText(found.items),
      )
    })
  byOption(
    annotate(relations.command("update"), { effects: LOCAL_WRITE })
      .description(
        "set what a relationship is: its role and a note beside it, how much you deal with a person on a project, or " +
          "what a chat is for in a project (work, sales, support, other); an agent's change waits for you in memo review",
      )
      .summary("set a relationship's role, engagement or a chat's purpose in a project")
      .argument("<id>", "the relationship's id, as relationships list gives it")
      .option("--role <role>", "the role it has there, from its list; an empty value clears it")
      .option("--role-note <text>", "what the role means here, in your words; an empty value clears it")
      .option("--engagement <level>", `${ENGAGEMENT_HELP}; an empty value clears it`, (value: string) =>
        value === "" ? "" : oneOf(ENGAGEMENT_LEVELS)(value),
      )
      .option("--purpose <purpose>", "what the chat is for in the project: work, sales, support or other")
      .option("--reason <text>", "why, in a sentence")
      .option("--json", "print JSON; --json=id,title keeps only those fields"),
  ).action(
    async (
      id: string,
      options: {
        role?: string
        roleNote?: string
        engagement?: Engagement | ""
        purpose?: string
        reason?: string
        asOwner?: boolean
        json?: boolean
      },
      command: Command,
    ) => {
      const cleared = (value: string) => (value === "" ? null : value)
      const change = {
        ...(options.role === undefined ? {} : { role: cleared(options.role) }),
        ...(options.roleNote === undefined ? {} : { roleNote: cleared(options.roleNote) }),
        ...(options.engagement === undefined ? {} : { engagement: cleared(options.engagement) as Engagement | null }),
        ...(options.purpose === undefined ? {} : { purpose: options.purpose }),
      }
      const by = await whoRuns(command, env, { asOwner: options.asOwner, question: `change relationship ${id}?` })
      return owned(options, (store) => {
        if (!Object.keys(change).length)
          throw new CliError("validation_error", "say what to change: --role, --role-note, --engagement or --purpose", {
            reason: "input.invalid",
            param: "--purpose",
          })
        if (options.purpose !== undefined) purposesOf([options.purpose])
        return by === "owner"
          ? store.knowledge.updateRelation(null, id, { ...change, by })
          : store.knowledge.updateRelation(null, id, {
              ...change,
              by,
              ...(options.reason === undefined ? {} : { reason: options.reason }),
            })
      })
    },
  )
  for (const [name, description] of [
    ["remove", "remove a relationship; removing a suggested one rejects it"],
    ["confirm", "confirm a suggested relationship"],
  ] as const)
    reasonOption(
      byOption(
        annotate(relations.command(name), { effects: LOCAL_WRITE })
          .description(description)
          .argument("<id>", "the relationship's id, as relationships list gives it")
          .option("--json", "print JSON; --json=id,title keeps only those fields"),
      ),
    ).action(async (id: string, options: { reason?: string; asOwner?: boolean; json?: boolean }, command: Command) => {
      const by = await deciderOf(command, env, {
        ...options,
        question: `${name} relationship ${id} as you, the owner?`,
      })
      await owned(options, async (store) => {
        const suggestion = await pendingLink(store, id)
        if (suggestion === undefined)
          return name === "remove"
            ? store.knowledge.removeRelation(null, id, by)
            : store.knowledge.confirmRelation(null, id, by)
        await decideOne(store, suggestion.id, decisionOf(name === "confirm", by, options.reason))
        if (name === "remove") return { id, removed: true }
        return (await store.knowledge.relations(null, suggestion.subject)).find((one) => one.id === id)
      })
    })
  relationshipsScanCommand(relations, print, env, warn)
  const reminders = program
    .command("reminders")
    .description("durable local reminders; poll hands one out and ack confirms it was shown")
  writeScope(
    annotate(reminders.command("add"), { effects: LOCAL_WRITE })
      .description("add a reminder for an open task")
      .argument("<task>", "the task's id"),
  )
    .requiredOption("--at-time <time>", "when to remind: an ISO 8601 time with its UTC offset")
    .option("--timezone <zone>", "IANA timezone; the computer's when not given")
    .action((task: string, options: WriteOptions & { atTime: string; timezone?: string; json?: boolean }) =>
      act(options, async (store, key) => {
        if ((await store.tasks.get(task)) === undefined && (await store.tasks.projectTask(task)))
          throw new CliError(
            "validation_error",
            `${task} is a task in a project; a reminder belongs to an account, so it needs a task from a message, ` +
              "a note or a file — memo tasks add <source>",
          )
        return itemAnswer(await store.knowledge.schedule(key, task, options.atTime, timezoneOf(options.timezone)))
      }),
    )
  readScope(
    withQuery(
      annotate(reminders.command("list"), { effects: LOCAL_READ }).description(
        "pending reminders of the accounts --source names (default all), soonest first",
      ),
      REMINDERS_QUERY,
    ),
    ACCOUNTS_HELP,
  ).action((words: string[], options: SourceOptions & { json?: boolean }) => {
    const query = listQuery(typedQuery(words), REMINDERS_QUERY, "reminders list")
    return run(options.json, async (store) => {
      const keys = await theAccounts(store, env, options, warn)
      const items = (
        await Promise.all(
          keys.map(async (key) =>
            (
              await store.knowledge.reminders(key, query)
            ).map((reminder) => ({ ...reminder, account: accountName(key) })),
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
    })
  })
  writeScope(
    annotate(reminders.command("claim"), { effects: LOCAL_WRITE }).description(
      "hand out due reminders, each with a receipt to acknowledge",
    ),
  )
    .option("--limit <n>", "most due reminders, at most 500", positive, 100)
    .action((options: WriteOptions & { limit: number; json?: boolean }) =>
      act(options, async (store, key) => {
        const claimed = await store.knowledge.claimReminders(key, { limit: options.limit })
        return listAnswer("reminders claim", {
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
    annotate(reminders.command("acknowledge"), { effects: LOCAL_WRITE })
      .description("confirm that a handed-out reminder was shown")
      .argument("<id>", "the reminder's id")
      .argument("<receipt>", "the receipt reminders claim handed out with it"),
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
