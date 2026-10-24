import { randomUUID } from "node:crypto"
import { type CallToolResult, McpServer } from "@modelcontextprotocol/server"
import { toStandardJsonSchema } from "@valibot/to-json-schema"
import { CliError, mcpErrorResult } from "@wirecat/cli-base"
import {
  agentResult,
  type Body,
  inRun,
  queryArgument,
  sealed,
  UNTRUSTED,
  UNTRUSTED_INSTRUCTION,
} from "@wirecat/cli-core/cli"
import type { AgentTool } from "@wirecat/cli-core/mcp"
import { type Level, levelFor } from "@wirecat/cli-core/sends"
import { FACT_TYPES, MEMORY_KINDS, MEMORY_SCOPES, openStore } from "@wirecat/cli-core/store"
import * as v from "valibot"
import { ACTION_QUERY, listActions, propose } from "../actions/actions.js"
import { AGENT_LOG_QUERY, listAgentActions } from "../agents/log.js"
import { itemAnswer } from "../answer.js"
import { FACT_QUERY, factItem, listFacts } from "../facts/fact.js"
import { mcpFailure } from "../failure.js"
import { addMemory } from "../memories/memories.js"
import { listMemories, MEMORY_QUERY, memoryItem, searchMemories } from "../memories/memory.js"
import { readOnly } from "../read-only.js"
import { writeAccount } from "../store/source-list.js"
import { VERSION } from "../version.js"
import { commandCatalogue, type ProgramFactory } from "./catalogue.js"
import { knowledgeTools } from "./knowledge.js"
import { meetingActionTools } from "./meeting-actions.js"
import { meetingPreparationTools } from "./meeting-preparation.js"
import { meetingTools } from "./meetings.js"
import { memoLevels, OWNER_PERMISSIONS } from "./permissions.js"
import { projectActionTools } from "./project-actions.js"
import { projectTransferTools } from "./project-transfer.js"
import { taskRelationTools } from "./task-relations.js"
import { define, type MemoTool } from "./tool.js"
import { vocabularyTools } from "./vocabulary.js"

/** Every call is logged as this agent, and what it writes is authored by it. */
export const AGENT = "memo-mcp"
const by = { bot: AGENT }

/** What a client keeps when it defers the tools; Claude Code cuts it at 2048 characters. */
export const INSTRUCTIONS = [
  "The owner's own records: facts, memories and proposed actions, kept beside their messages, mail, notes and meetings.",
  "search_all combines messages, mail and notes; search_messages, search_mail, search_notes select one kind.",
  "search_meetings reads stored meetings in one explicit source account; meeting_passage reads cited cues.",
  "meeting_prepare gathers stored series context; select communications explicitly. Future times stay unverified.",
  "meeting_actions_add stages cited follow-ups; meeting_actions_show/list inspect them. Only the owner reviews.",
  "Project aliases select confirmed links, not mentions. Preserve unknown speakers and archive coverage.",
  "person_context gathers one person across messengers and mail. Then keep what a conversation showed:",
  "",
  "- What happened — said, asked, decided, promised — is a fact: facts_add with its kind.",
  "- What you concluded — a summary, a digest, a preference — is a memory: memories_add.",
  "- Something to do in an account — a reply, an invitation — is actions_add. Nothing is sent.",
  "- Keep only what will matter later. Not every message is a fact; when unsure, do not save.",
  "- Every write cites evidence: the msg:, note: or meeting: reference you read it in.",
  "- Direct facts/memories and outbound actions stay proposed. Project proposals follow agent_decisions; meeting findings and annotation restore need the owner.",
  "- Every MCP call is logged without its arguments.",
  "- Look first (facts_list, search_memories) so you do not propose what is already kept.",
  `- ${UNTRUSTED_INSTRUCTION}`,
].join("\n")
const limit = (most: number) => v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(most)))

export const MEMO_TOOLS: Record<string, MemoTool> = {
  ...knowledgeTools,
  ...meetingTools,
  ...meetingActionTools,
  ...projectActionTools,
  ...projectTransferTools,
  ...meetingPreparationTools,
  ...vocabularyTools,
  ...taskRelationTools,
  memories_add: define({
    title: "Propose a memory",
    description:
      "Save what you concluded — a summary, digest or preference — with the references that show it and a personal or work scope. What happened (said, asked, decided, promised) is a fact: facts_add. It waits as proposed until the owner confirms it.",
    writes: true,
    input: v.object({
      text: v.pipe(v.string(), v.minLength(1)),
      kind: v.picklist(MEMORY_KINDS),
      scope: v.picklist(MEMORY_SCOPES),
      evidence: v.pipe(v.array(v.string()), v.minLength(1)),
      subject: v.optional(v.string()),
    }),
    run: async (store, args) => itemAnswer(memoryItem(await addMemory(store, args, by))),
  }),
  memories_list: define({
    title: "List memories",
    description: `Memories, newest first, narrowed by a query such as kind:preference status:proposed.`,
    writes: false,
    input: v.object({ query: queryArgument(MEMORY_QUERY), limit: limit(500) }),
    run: (store, args) => listMemories(store, args.query, args.limit),
  }),
  memories_show: define({
    title: "Show a memory",
    description: `One memory with its evidence.`,
    writes: false,
    input: v.object({ ref: v.string() }),
    run: async (store, args) => itemAnswer(memoryItem(await store.memories.get(args.ref))),
  }),
  search_memories: define({
    title: "Search memories",
    description: "Memories holding every word, best first; scope:personal or scope:work in the text narrows them.",
    writes: false,
    input: v.object({
      text: v.pipe(v.string(), v.minLength(1)),
      limit: limit(500),
    }),
    run: (store, { text, limit }) => searchMemories(store, text, limit),
  }),
  facts_add: define({
    title: "Propose a fact",
    description:
      "Record what happened — a fact, a statement, a question, a decision or a promise — with the references that show it. It waits as proposed until the owner confirms it.",
    writes: true,
    input: v.object({
      kind: v.picklist(FACT_TYPES),
      text: v.pipe(v.string(), v.minLength(1)),
      evidence: v.pipe(v.array(v.string()), v.minLength(1)),
      project: v.optional(v.string()),
      subject: v.optional(v.string()),
      occurred_time: v.optional(v.string()),
      scope: v.optional(v.picklist(MEMORY_SCOPES)),
      supersedes: v.optional(v.string()),
    }),
    run: async (store, { kind, text, occurred_time, ...args }) =>
      itemAnswer(
        factItem(
          await store.facts.add({
            ...args,
            ...(occurred_time === undefined ? {} : { occurredAt: occurred_time }),
            type: kind,
            statement: text,
            by,
          }),
        ),
      ),
  }),
  facts_list: define({
    title: "List facts",
    description: `Facts, latest first, narrowed by a query such as kind:decision status:proposed.`,
    writes: false,
    input: v.object({ query: queryArgument(FACT_QUERY), limit: limit(500) }),
    run: (store, args) => listFacts(store, args.query, args.limit),
  }),
  facts_show: define({
    title: "Show a fact",
    description: `One fact with its evidence.`,
    writes: false,
    input: v.object({ ref: v.string() }),
    run: async (store, args) => itemAnswer(factItem(await store.facts.get(args.ref))),
  }),
  actions_add: define({
    title: "Propose an action",
    description:
      "Propose what should be done in one account — a reply, a ban, an invitation — and why. account is the one that would act, as provider:account (telegram:1). Nothing is sent: the owner confirms it as a task or rejects it.",
    writes: true,
    input: v.object({
      kind: v.pipe(v.string(), v.regex(/^[a-z][a-z_]{0,39}$/)),
      reason: v.pipe(v.string(), v.minLength(1)),
      account: v.pipe(v.string(), v.minLength(1)),
      target: v.optional(v.string()),
      payload: v.optional(v.unknown()),
    }),
    run: async (store, { payload, account, ...proposal }, env) => {
      const key = await writeAccount(store, env, { account }, () => {})
      return itemAnswer(
        await propose(
          store,
          { ...proposal, ...key, ...(payload === undefined ? {} : { payload: JSON.stringify(payload) }) },
          by,
        ),
      )
    },
  }),
  actions_list: define({
    title: "List proposed actions",
    description: `Proposed actions, newest first, narrowed by a query such as status:proposed.`,
    writes: false,
    input: v.object({ query: queryArgument(ACTION_QUERY), limit: limit(500) }),
    run: (store, args) => listActions(store, args.query, args.limit),
  }),
  actions_show: define({
    title: "Show a proposed action",
    description: `One proposed action with its payload and the task it became.`,
    writes: false,
    input: v.object({ id: v.string() }),
    run: async (store, args) => itemAnswer(await store.proposedActions.get(args.id)),
  }),
  agents_log: define({
    title: "Read the agent log",
    description:
      "What agents did through the MCP servers, newest first: agent, tool, tier, outcome and times; a query such as agent:tg-mcp tool:search_all narrows it.",
    writes: false,
    input: v.object({ query: queryArgument(AGENT_LOG_QUERY), limit: limit(500) }),
    run: (store, args) => listAgentActions(store, args.query, args.limit),
  }),
}

/** What an MCP answer may hold, as cli-core's tools allow: a bigger one is refused, never cut. */
const MAX_ANSWER_BYTES = 4 * 1024 * 1024

const answer = (body: Body): CallToolResult => {
  const value = sealed(body)
  const result = agentResult({
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    structuredContent: value as Record<string, unknown>,
  })
  if (Buffer.byteLength(result.content[0]?.text ?? "") > MAX_ANSWER_BYTES)
    throw new CliError("invalid_response", "the answer exceeds 4 MiB — lower limit or ask for less", {
      reason: "output.too-large",
      max_bytes: MAX_ANSWER_BYTES,
    })
  return result
}

/**
 * The SDK would refuse a bad argument with its own text before the handler runs; passing everything through
 * lets the handler's parse answer with the shared error object, and the agent log record the call.
 */
const advertised = (input: MemoTool["input"]) => {
  const schema = toStandardJsonSchema(input)
  return { "~standard": { ...schema["~standard"], validate: (value: unknown) => ({ value }) } } as typeof schema
}

/** One store per call: memo serves rarely and briefly, and a held store would keep its file open between calls. */
export const LEGACY_PATHS: Record<string, readonly string[]> = {
  person_context: ["context"],
  project_context: ["projects", "context"],
  project_evidence: ["projects", "evidence"],
  project_annotations_snapshot: ["projects", "annotations", "snapshot"],
  project_annotations_preview: ["projects", "annotations", "check"],
  meeting_passage: ["meetings", "passage"],
  meeting_prepare: ["meetings", "prepare"],
}

export const pathOfTool = (name: string): readonly string[] =>
  LEGACY_PATHS[name] ??
  name
    .replace(/^project_/, "projects_")
    .replace(/^meeting_/, "meetings_")
    .split("_")

export const createMemoServer = (
  env: NodeJS.ProcessEnv,
  createProgram: ProgramFactory,
  overrides: readonly string[] = [],
): McpServer => {
  const server = new McpServer({ name: "memo", version: VERSION }, { instructions: INSTRUCTIONS })
  const catalogue = commandCatalogue(env, createProgram)
  const defaults: Record<string, Level> = Object.fromEntries(
    catalogue.tools.filter((tool) => tool.writes).map((tool) => [catalogue.keyOf(tool.path), "ask" as const]),
  )
  defaults["mcp.authority"] = "deny"
  for (const key of OWNER_PERMISSIONS) defaults[key] = "deny"
  memoLevels(env, overrides, defaults)
  const generated = new Map<string, AgentTool>()
  const tools: Record<string, Omit<MemoTool, "run"> & { run?: MemoTool["run"] }> = { ...MEMO_TOOLS }
  for (const tool of catalogue.tools) {
    const name = tool.path.join("_").replaceAll("-", "_")
    if (tools[name]) continue
    generated.set(name, tool)
    tools[name] = {
      title: tool.title,
      description: tool.description,
      writes: tool.writes,
      input: v.strictObject(tool.input.entries),
    }
  }
  const allowed = (name: string, tool: Omit<MemoTool, "run">) => {
    const path = generated.get(name)?.path ?? pathOfTool(name)
    const levels = memoLevels(env, overrides, defaults)
    if (readOnly(env) && tool.writes) throw new CliError("permission_error", "memo is locked to reads")
    if (catalogue.authority(path)) {
      const level = levelFor(levels, "mcp.authority").level
      if (level !== "allow" && level !== "ask")
        throw new CliError("permission_error", `${path.join(" ")}: mcp.authority is ${level}`)
    }
    const key = catalogue.keyOf(path)
    const level = levelFor(levels, key, { [key]: tool.writes ? "ask" : "allow" }).level
    if (level === "deny" || (level === "readonly" && tool.writes))
      throw new CliError("permission_error", `${key} is ${level}`)
    return levels
  }
  for (const [name, tool] of Object.entries(tools)) {
    try {
      allowed(name, tool)
    } catch (error) {
      if (error instanceof CliError && error.code === "permission_error") continue
      throw error
    }
    const path = generated.get(name)?.path ?? pathOfTool(name)
    server.registerTool(
      name,
      {
        title: tool.title,
        description: tool.writes ? tool.description : `${tool.description} ${UNTRUSTED}`,
        inputSchema: advertised(tool.input),
        annotations: {
          readOnlyHint: !tool.writes,
          destructiveHint: tool.writes,
          openWorldHint: path[0] === "mail" && ["trash", "restore"].includes(path[1] ?? ""),
        },
      },
      async (args: Record<string, unknown>) => {
        const startedAt = Date.now()
        let result: CallToolResult
        try {
          const levels = allowed(name, tool)
          const parsed = v.parse(tool.input, args)
          const command = generated.get(name)
          if (command) {
            const run = await catalogue.run(command.path, parsed, levels)
            result = "error" in run ? agentResult(mcpErrorResult(run.error)) : answer(run.result as Body)
          } else {
            const store = await openStore({ env })
            try {
              const body = await tool.run?.(store, parsed as never, env)
              if (body === undefined) throw new Error(`no handler for ${name}`)
              result = inRun({ runId: randomUUID(), command: name, startedAt }, () => answer(body))
            } finally {
              await store.close()
            }
          }
        } catch (error) {
          result = mcpFailure(error)
        }
        const store = await openStore({ env }).catch(() => undefined)
        if (store) {
          try {
            const code = (result.structuredContent as { error?: { code?: string } } | undefined)?.error?.code
            await store.agentActions.record({
              actor: by,
              tool: name,
              tier: tool.writes ? "write-private" : "read",
              status: result.isError ? "failed" : "ok",
              ...(code === undefined ? {} : { error: code }),
              startedAt,
              finishedAt: Date.now(),
            })
          } finally {
            await store.close()
          }
        }
        return result
      },
    )
  }
  return server
}
