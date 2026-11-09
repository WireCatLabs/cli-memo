import { fileURLToPath } from "node:url"
import { CliError, createRenderer, type KeyringStore, processStreams, type Streams } from "@wirecat/cli-base"
import { customizeSharedCommand } from "@wirecat/cli-base/commands"
import { skillCommand } from "@wirecat/cli-base/skill"
import { REF_KINDS } from "@wirecat/cli-core"
import {
  addContractInfo,
  assertSharedContracts,
  commandWords,
  entityFields,
  environmentOf,
  groupAware,
  guideCommand,
  installHelp,
  liftProfile,
  overrideSharedContract,
  provide,
  recordRuns,
  refKinds,
  runsCommand,
  skillCommand as sharedSkillCommand,
} from "@wirecat/cli-core/cli"
import type { FetchPageOptions } from "@wirecat/cli-core/documents"
import { groupLockOf } from "@wirecat/cli-core/services"
import { Command } from "commander"
import { actionsCommand } from "./actions/command.js"
import { agentsCommand } from "./agents/command.js"
import { answers, itemAnswer, trackAnswers, withStore } from "./answer.js"
import { askCommand } from "./answers/command.js"
import { APP } from "./app.js"
import { loadConfig } from "./config.js"
import { configCommand } from "./config-command.js"
import { contextCommand } from "./context/command.js"
import { SHELL_OVERRIDES } from "./contract-overrides.js"
import { digestCommand } from "./digest/backfill.js"
import { readBrief, withBrief } from "./digest/brief.js"
import { commandsCommand, placeInSections } from "./discovery/command.js"
import { doctorCommand } from "./doctor/command.js"
import { eventsCommand } from "./events/command.js"
import { addExamples } from "./examples.js"
import { factsCommand } from "./facts/command.js"
import { recognisable } from "./failure.js"
import { financeCommands } from "./finance/command.js"
import { contractCommands } from "./finance/contracts-command.js"
import { dealCommands } from "./finance/deals-command.js"
import { orderCommands } from "./finance/orders-command.js"
import { productCommands } from "./finance/products-command.js"
import { subscriptionCommands } from "./finance/subscriptions-command.js"
import { transactionCommands } from "./finance/transactions-command.js"
import { walletCommands } from "./finance/wallets-command.js"
import { findingsCommand } from "./findings/command.js"
import { jsonFields } from "./json-fields.js"
import { knowledgeCommands } from "./knowledge/command.js"
import { mailCommand } from "./mail/command.js"
import { messagesCommand } from "./mail/messages-command.js"
import { mcpCommand } from "./mcp/command.js"
import { meetingReadCommands } from "./meetings/command.js"
import { meetingPreparationCommand } from "./meetings/preparation-command.js"
import { memoriesCommand } from "./memories/command.js"
import { mentionsCommand } from "./mentions/command.js"
import { modelsCommand } from "./models/command.js"
import { notesCommand } from "./notes/command.js"
import { foldersCommand } from "./notes/folders-command.js"
import { noteCommand, peopleCommand } from "./people/command.js"
import { readOnlyAvailability, refuseWritesUnderLock } from "./read-only.js"
import { REASONS } from "./reasons.js"
import { recordsCommand } from "./records/import.js"
import { reviewCommand } from "./review/command.js"
import { autoCommand } from "./run/auto.js"
import { syncCommand } from "./run/import.js"
import { scheduleCommand } from "./schedule/command.js"
import { searchCommand } from "./search/command.js"
import { showCommand } from "./show/command.js"
import { sourcesCommand } from "./sources/command.js"
import { memoListContext, scopeRunsToGroup } from "./store/group.js"
import { groupsCommand } from "./store/groups-command.js"
import { storeCommand } from "./store/info-command.js"
import { tagsCommand } from "./tags/command.js"
import { tasksCommand } from "./tasks/command.js"
import { templatesCommand } from "./templates/command.js"
import { provideTerminal, type Terminal } from "./terminal.js"
import { upgradeCommand } from "./update.js"
import { VERSION } from "./version.js"
import { vocabularyCommand } from "./vocabulary/command.js"

/** memo's own answers, beyond cli-core's entities, so `--json=<field>` is checked against what each row holds. */
const OWN_ENTITIES = entityFields({
  person_note_links: ["person", "name", "files"],
  added_source: [
    "ref",
    "created",
    "duplicate_of",
    "title",
    "kind",
    "mime",
    "bytes",
    "chars",
    "truncated",
    "extractor",
    "read",
    "url",
    "kept",
    "searchable",
    "subjects",
  ],
  source_detail: [
    "ref",
    "title",
    "added",
    "kind",
    "url",
    "file_name",
    "mime",
    "bytes",
    "kept",
    "chars",
    "text",
    "text_truncated",
    "created_at",
    "updated_at",
    "subjects",
    "facts",
    "memories",
    "batches",
  ],
  source_mention: ["ref", "type", "name", "found_as"],
  source_removal: ["ref", "removed", "copy_deleted", "facts", "memories"],
  project_annotation_snapshot: ["snapshot", "fingerprint", "coverage", "read_bytes", "records"],
  project_annotation_export: [
    "output_file",
    "project",
    "manifest_fingerprint",
    "coverage",
    "counts",
    "read_bytes",
    "records",
  ],
  project_annotation_transfer: [
    "plan",
    "descriptor_conflicts",
    "namespace_conflicts",
    "ready",
    "fingerprint",
    "read_bytes",
    "records",
    "project",
    "mappings",
    "counts",
  ],
  source_tag: [
    "provider",
    "account",
    "tag",
    "type",
    "chat_id",
    "chat_title",
    "person_id",
    "name",
    "message_id",
    "locator",
    "task_id",
    "sources",
    "created_at",
    "id",
    "path",
    "origin",
  ],
  vocabulary: ["entries", "fingerprint", "coverage"],
  meeting_context: [
    "schema_version",
    "kind",
    "source",
    "target_ref",
    "target_fingerprint",
    "fingerprint",
    "revision",
    "limits",
    "content_bytes",
    "coverage",
    "items",
  ],
  vocabulary_inspection: [
    "source",
    "survivor",
    "vocabulary_fingerprint",
    "preview_fingerprint",
    "assignments",
    "aliases",
    "automatic_claims",
    "links",
    "coverage",
  ],
  proposed_action: [
    "id",
    "kind",
    "account",
    "target",
    "payload",
    "reason",
    "status",
    "proposed_by",
    "decided_by",
    "decided_at",
    "executed_at",
    "result",
    "error",
    "verdict",
    "created_at",
    "summary",
    "project",
    "project_name",
    "fingerprint",
    "subject",
    "subject_name",
    "verb",
    "target_name",
    "chat_name",
    "text",
    "counts",
    "sources",
  ],
  agent_action: ["id", "actor", "tool", "tier", "target", "status", "error", "started_at", "finished_at"],
  meeting_project: ["id", "meeting", "project", "confirmed", "provenance", "fingerprint"],
  notes_folder: ["id", "name", "path", "format", "kept_by"],
  account_group: ["group", "members", "duplicates", "suggested"],
  relationship_role: ["list", "id", "label", "built_in"],
  person_context_memo: [
    "messages",
    "events",
    "notes",
    "your_notes",
    "not_read",
    "tasks",
    "relationships",
    "business",
    "coverage",
    "files",
    "untrusted",
    "proposals",
  ],
  organization_context_memo: [
    "organization",
    "categories",
    "people",
    "customers",
    "suppliers",
    "partners",
    "projects",
    "deals",
    "money",
    "communications",
    "tasks",
    "coverage",
    "notes",
    "tags",
  ],
  order: [
    "id",
    "ref",
    "title",
    "customer",
    "purpose",
    "supplier",
    "supplier_name",
    "number",
    "currency",
    "total",
    "status",
    "order_date",
    "fulfilled_date",
    "invoice",
    "payment",
    "direction",
    "contract",
    "deal",
    "lines",
    "review",
    "author",
    "model",
    "confirmed_by",
    "source",
    "reason",
    "project",
    "project_name",
    "created_at",
    "updated_at",
    "evidence",
  ],
  invoice: [
    "id",
    "ref",
    "title",
    "direction",
    "number",
    "issuer",
    "counterparty",
    "currency",
    "total",
    "paid",
    "open",
    "issue_date",
    "due_date",
    "status",
    "review",
    "author",
    "model",
    "confirmed_by",
    "source",
    "reason",
    "project",
    "project_name",
    "created_at",
    "updated_at",
    "evidence",
    "lines",
    "allocations",
  ],
  payment: [
    "id",
    "ref",
    "title",
    "direction",
    "payer",
    "payee",
    "amount",
    "currency",
    "date",
    "reference",
    "allocated",
    "unallocated",
    "refund_of",
    "subscription",
    "evidence",
    "review",
    "author",
    "model",
    "confirmed_by",
    "source",
    "reason",
    "project",
    "project_name",
    "created_at",
    "updated_at",
    "allocations",
  ],
  source_record: [
    "provider",
    "account",
    "type",
    "external_id",
    "fields",
    "revision",
    "fingerprint",
    "relations",
    "incoming",
    "entity",
    "created_entity",
    "flagged",
    "batch_id",
    "created_at",
    "updated_at",
    "deleted_at",
  ],
  records_receipt: [
    "dry_run",
    "source",
    "created",
    "updated",
    "unchanged",
    "deleted",
    "refused",
    "proposed",
    "waiting",
    "flagged",
    "unmatched",
    "ignored",
    "vcard",
    "errors",
    "truncated",
  ],
  product: [
    "id",
    "ref",
    "title",
    "kind",
    "name",
    "sku",
    "supplier",
    "unit",
    "unit_price",
    "currency",
    "description",
    "archived_date",
    "author",
    "model",
    "source",
    "created_at",
    "updated_at",
  ],
  contract: [
    "id",
    "ref",
    "title",
    "name",
    "number",
    "kind",
    "status",
    "signed_date",
    "effective_date",
    "expiration_date",
    "auto_renew",
    "renewal",
    "notice_days",
    "notice_deadline",
    "terms",
    "value",
    "currency",
    "deal",
    "review",
    "author",
    "model",
    "confirmed_by",
    "source",
    "reason",
    "evidence",
    "project",
    "project_name",
    "created_at",
    "updated_at",
  ],
  subscription: [
    "id",
    "ref",
    "title",
    "name",
    "direction",
    "supplier",
    "customer",
    "product",
    "contract",
    "status",
    "interval",
    "start_date",
    "trial_end_date",
    "next_renewal_date",
    "cancelled_date",
    "end_date",
    "current_price",
    "prices",
    "review",
    "author",
    "model",
    "confirmed_by",
    "source",
    "reason",
    "evidence",
    "project",
    "project_name",
    "created_at",
    "updated_at",
  ],
  subscription_price: [
    "id",
    "ref",
    "title",
    "subscription",
    "amount",
    "currency",
    "effective_from",
    "review",
    "author",
    "reason",
    "project",
    "created_at",
  ],
  wallet: [
    "id",
    "ref",
    "title",
    "name",
    "kind",
    "currency",
    "institution",
    "number_hint",
    "holder",
    "opening_balance",
    "opening_date",
    "closed_date",
    "balance",
    "until",
    "pending",
    "source_says",
    "author",
    "model",
    "source",
    "created_at",
    "updated_at",
  ],
  transaction: [
    "id",
    "ref",
    "title",
    "wallet",
    "wallet_name",
    "direction",
    "amount",
    "currency",
    "status",
    "statement_date",
    "booked_date",
    "description",
    "counterparty_name",
    "counterparty",
    "reference",
    "payment",
    "splits",
    "uncategorized",
    "review",
    "author",
    "model",
    "confirmed_by",
    "source",
    "reason",
    "evidence",
    "project",
    "project_name",
    "created_at",
    "updated_at",
  ],
  records_match: ["linked", "created", "unmatched", "proposed", "errors", "truncated"],
  payment_allocation: ["payment", "invoice", "amount", "currency", "created_at"],
})

/**
 * The commands that keep to the run's account group (WC-ACCT-13): each reads only the group's accounts and its
 * references are checked, so under MEMO_GROUP_LOCK these run and every other command is refused. Add a command only
 * once its reads are scoped.
 */
const GROUP_AWARE = [
  "context",
  "show",
  "messages show",
  "search all",
  "search messages",
  "search mail",
  "search notes",
  "search people",
  "groups",
  "tags add",
  "tags remove",
  "deals",
  "leads",
  "pipelines list",
  "pipelines show",
  "stages",
  "organizations",
  "people list",
  "people add",
  "notes list",
  "notes show",
  "relationships list",
  "relationships add",
  "relationships update",
  "relationships end",
  "relationships remove",
  "relationships confirm",
  "relationships roles",
  "mcp serve",
  "memories",
  "facts",
  "actions",
  "review",
  "tasks",
  "projects list",
  "projects add",
  "projects context",
  "projects status",
  "projects key-documents",
]

const isSimpleKind = (name: string) => REF_KINDS.some(({ type }) => type === name)

/** What a `<ref>` or `<id>` argument names in each top-level group; ids of owner-only queues name no account. */
const REF_KINDS_OF: Record<string, Record<string, string>> = {
  deals: { ref: "deal" },
  leads: { ref: "lead" },
  memories: { ref: "memory" },
  facts: { ref: "fact" },
  tasks: { id: "task", "other-task": "task" },
  actions: { id: "action" },
  review: { id: "proposal", ids: "proposal" },
}
/** Argument names that are ids of something cli-core's lock cannot map yet: such a command stays refused under it. */
const UNMAPPED_IDS = new Set(["id", "ids", "ref", "meeting-id"])

const leaves = (command: Command): Command[] =>
  command.commands.length === 0 ? [command] : command.commands.flatMap(leaves)

const topOf = (command: Command): string => {
  let at = command
  while (at.parent?.parent) at = at.parent
  return at.name()
}

const markGroupAware = (program: Command) => {
  for (const path of GROUP_AWARE) {
    let command: Command | undefined = program
    for (const name of path.split(" ")) command = command?.commands.find((child) => child.name() === name)
    if (!command) throw new Error(`no command to mark group-aware: ${path}`)
    groupAware(command)
    // Every argument is declared: an id as what it names, free text as none, so a search word or an amount passes
    // the lock while an id is checked. An id no reference maps stays undeclared, and the lock refuses its command.
    for (const leaf of leaves(command)) {
      const top = topOf(leaf)
      const kinds: Record<string, string> = {}
      let mapped = true
      for (const name of leaf.registeredArguments.map((argument) => argument.name())) {
        const kind = REF_KINDS_OF[top]?.[name] ?? (isSimpleKind(name) ? name : undefined)
        if (kind !== undefined) kinds[name] = kind
        else if (UNMAPPED_IDS.has(name)) mapped = false
      }
      if (mapped) refKinds(leaf, kinds as Parameters<typeof refKinds>[1])
    }
  }
}

/** The parts of the skill an agent reads only when a task needs them; the primary SKILL.md is read every session. */
export const SKILL_TOPICS = [
  "search",
  "projects",
  "meetings",
  "mail",
  "proposals",
  "money",
  "mcp",
  "vocabulary",
] as const

const FIRST_SCREEN = {
  pitch: "your notes, mail and messages in one local store, linked to people; every answer cites its source.",
  can: [
    { command: "context <person>", does: "one person's messages, mail, notes and tasks" },
    { command: 'search all "budget"', does: "messages, mail and notes ranked together" },
    { command: 'answers create "…" --all', does: "evidence with sources, ready for your agent" },
    { command: "tasks agenda", does: "overdue tasks, replies you owe and wait for" },
    { command: "meetings prepare <series-id>", does: "a briefing with sources for a meeting" },
    { command: "jobs start", does: "sync notes and embed new mail every 5 minutes" },
    { command: "agents list", does: "every agent tool call, without its arguments" },
    { command: "mcp", does: "search, people, memories and facts for any MCP agent" },
  ],
  profile: false,
  start: "memo folders add <path>",
}

export const createProgram = ({
  streams: raw = processStreams,
  env: given = process.env,
  signal,
  terminal,
  keyring,
  fetchPage,
  group,
  stdin,
}: {
  streams?: Streams
  env?: NodeJS.ProcessEnv
  /** Where enrichment looks for its provider key; the system keyring unless a test hands in memoryKeyring(). */
  keyring?: KeyringStore
  /** Where `models keys set` reads the key; the process's stdin unless a test hands one in. */
  stdin?: NodeJS.ReadableStream
  /** Ctrl-C or SIGTERM from `startCli`: a sync stops at its next safe point. */
  signal?: AbortSignal
  /** Whether a person is at the terminal; the process's stdin and stdout unless a test hands one in. */
  terminal?: Terminal
  /** How `sources add <url>` reaches the page; a test hands in its own lookup and transport. */
  fetchPage?: FetchPageOptions
  /** The account group the first word named (`memo work …`), as `liftGroup` took it off the command line. */
  group?: string
} = {}): Command => {
  // Every reader of the run's group reads MEMO_GROUP, so the first word is that, said shorter (WC-ACCT-13).
  const env = group === undefined ? given : { ...given, MEMO_GROUP: group }
  const fields = jsonFields(raw, OWN_ENTITIES)
  const { streams } = fields
  const program = new Command("memo")
    .description("context about people across messengers, notes and mail")
    .version(VERSION)
    .option("--debug", "on failure, show the full error record: cause and stack")
  refuseWritesUnderLock(program, env)
  scopeRunsToGroup(program, env, group)
  provideTerminal(program, terminal)

  contextCommand(program, streams, env)
  showCommand(program, streams, env)
  notesCommand(program, streams, env)
  sourcesCommand(program, streams, env, fetchPage ? { fetch: fetchPage } : {})
  foldersCommand(program, streams, env)
  messagesCommand(program, streams, env)
  mailCommand(program, streams, env)
  noteCommand(program, streams, env)
  peopleCommand(program, streams, env)
  tagsCommand(program, streams, env)
  tasksCommand(program, streams, env)
  knowledgeCommands(program, streams, env)
  vocabularyCommand(program, streams, env)
  memoriesCommand(program, streams, env)
  mentionsCommand(program, streams, env)
  factsCommand(program, streams, env)
  financeCommands(program, streams, env)
  orderCommands(program, streams, env)
  dealCommands(program, streams, env)
  productCommands(program, streams, env)
  contractCommands(program, streams, env)
  subscriptionCommands(program, streams, env)
  walletCommands(program, streams, env)
  transactionCommands(program, streams, env)
  recordsCommand(program, streams, env)
  findingsCommand(program, streams, env)
  actionsCommand(program, streams, env)
  reviewCommand(program, streams, env)
  agentsCommand(program, streams, env)
  mcpCommand(program, streams, env, createProgram)
  modelsCommand(program, streams, env, keyring, stdin)
  templatesCommand(program, streams, env)
  searchCommand(program, streams, env)
  meetingReadCommands(program, streams, env)
  meetingPreparationCommand(program, streams, env)
  eventsCommand(program, streams, env)
  askCommand(program, streams, env)
  syncCommand(program, streams, env, signal, keyring)
  storeCommand(program, streams, env)
  groupsCommand(program, streams, env)
  autoCommand(program, streams, env)
  configCommand(program, streams, env)
  doctorCommand(program, streams, env)
  program.addCommand(upgradeCommand(streams))
  program.addCommand(scheduleCommand(env))
  digestCommand(program, streams, env)
  commandsCommand(program, streams)
  const skill = customizeSharedCommand(
    sharedSkillCommand(APP, new URL("../skills/cli-memo/SKILL.md", import.meta.url)),
    "Memo installs its own stored-data instructions through its environment, prints the packaged skills (morning-digest with the owner's brief from the store after it), and takes --json on each skill command because it has no global one.",
    () => {
      const out = answers(program, streams, env)
      let brief: string | undefined
      const skill = skillCommand(
        APP,
        new URL("../skills/cli-memo/SKILL.md", import.meta.url),
        (command) => {
          const json = command.opts().json === true
          const renderer = createRenderer({ format: json ? "json" : "pretty", color: false, streams })
          // cli-base prints each answer bare; the { item, meta } envelope is ours, as in cli-core.
          const result = (value: unknown) => {
            const shown = value as { content?: string }
            out.print(
              true,
              itemAnswer(shown.content === undefined ? value : { ...shown, content: withBrief(shown.content, brief) }),
            )
          }
          return {
            renderer: json ? { ...renderer, result } : renderer,
            streams: { ...streams, data: (text: string) => streams.data(withBrief(text, brief)) },
            env,
          }
        },
        {
          ...Object.fromEntries(
            SKILL_TOPICS.map((topic) => [topic, new URL(`../skills/cli-memo/topics/${topic}.md`, import.meta.url)]),
          ),
          "mail-triage": new URL("../skills/mail-triage/SKILL.md", import.meta.url),
          "morning-digest": new URL("../skills/morning-digest/SKILL.md", import.meta.url),
        },
      )
      // memo has no global --json, so each skill command takes its own, as guide does.
      for (const command of skill.commands) command.option("--json", "print JSON")
      const show = skill.commands.find((command) => command.name() === "show")
      // cli-base's show is synchronous, so the owner's brief is read before it runs.
      show?.description(
        `${show.description()}; morning-digest ends with your brief from \`memo digest brief\` when you wrote one`,
      )
      show?.hook("preAction", async (command) => {
        brief = command.args[0] === "morning-digest" ? await readBrief(env) : undefined
      })
      return skill
    },
    SHELL_OVERRIDES.skill,
  )
  program.addCommand(skill)
  // tg and max have a global --json; memo's is per command, so guide gets its own.
  program.addCommand(
    overrideSharedContract(
      guideCommand(APP, { directory: fileURLToPath(new URL("../scenarios", import.meta.url)), profile: false }),
      "Memo's output flag is command-local because this provider does not use the messenger program shell.",
      (command) => {
        command.option("--json", "print JSON")
      },
    ),
  )
  const runs = program.addCommand(runsCommand(APP)).commands.at(-1)
  for (const one of runs?.commands ?? [])
    overrideSharedContract(
      one,
      "Memo's output flag is command-local because this provider does not use the messenger program shell.",
      (command) => {
        command.option("--json", "print JSON")
      },
    )
  addExamples(program)
  fields.install(program)
  recordRuns(program, {
    app: APP,
    settings: () => {
      const config = loadConfig(env)
      return {
        record: config.record,
        keepRunsForDays: config.keep_runs_for_days,
        keepSuccessfulRunsForDays: config.keep_successful_runs_for_days,
        runsSizeLimitMb: config.runs_size_limit_mb,
        recordInput: config.record_input,
      }
    },
    recognise: recognisable,
    env,
    streams,
  })
  trackAnswers(program)
  placeInSections(program)
  markGroupAware(program)
  installHelp(program, FIRST_SCREEN)
  provide(program, {
    ...environmentOf(program),
    env,
    discoveryAvailability: (info) => {
      let command: Command | undefined = program
      for (const word of info.path) command = command?.commands.find((child) => child.name() === word)
      return command ? readOnlyAvailability(command, env) : undefined
    },
  })

  addContractInfo(program, (value) => createRenderer({ format: "json", color: false, streams }).result(value), {
    fields: OWN_ENTITIES,
    errors: { reasons: REASONS },
  })
  assertSharedContracts(program)
  return program
}

/**
 * `memo work search all …`: a first word that is no command is an account group (WC-ACCT-13), lifted off before
 * parsing, as `liftProfile` lifts a profile. A command must follow it; a word that is neither names the groups.
 */
export const liftGroup = async (
  program: Command,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
): Promise<{ group?: string; rest: string[] }> => {
  const words = commandWords(program)
  // memo's root options (--debug, --version) take no value, so none can hide the first word.
  const { profile: group, rest } = liftProfile([...args], words)
  if (group === undefined) return { rest }
  const next = rest.find((arg) => !arg.startsWith("-"))
  const groups = await withStore(env, async (store) => Object.keys((await memoListContext(store, env)).groups))
  // `all`, every account, is no saved group but always a word.
  const known = group === "all" || groups.includes(group)
  // Under the lock another group is a permission_error, which the run's own check gives.
  if ((known || groupLockOf(APP, env) !== undefined) && next !== undefined && words.has(next)) return { group, rest }
  throw new CliError(
    "validation_error",
    known
      ? `"${group}" is a group, and a command follows it: memo ${group} search all …`
      : `"${group}": unknown command or group — groups here: ${groups.join(", ")}; memo commands lists the commands`,
    { reason: "input.invalid", groups },
  )
}

/**
 * Commander settles `--help` for an unknown first word before any hook runs, so `"projects add" --help` —
 * a shell loop over `"$c"` passes it whole — printed the root help. Checked on the words before parsing.
 */
export const refuseJoinedPath = (program: Command, args: readonly string[]): void => {
  let command = program
  const path: string[] = []
  for (const arg of args) {
    if (arg.startsWith("-")) return
    const [first = "", ...rest] = arg.trim().split(/\s+/)
    const next = command.commands.find((child) => child.name() === first || child.aliases().includes(first))
    if (next === undefined) return
    if (rest.length > 0)
      throw new CliError(
        "validation_error",
        `"${arg}" was given as one argument; run: ${[program.name(), ...path, first, ...rest].join(" ")}`,
      )
    path.push(first)
    command = next
  }
}
