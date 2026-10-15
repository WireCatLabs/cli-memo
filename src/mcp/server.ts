import { randomUUID } from "node:crypto"
import { type CallToolResult, McpServer } from "@modelcontextprotocol/server"
import { toStandardJsonSchema } from "@valibot/to-json-schema"
import { CliError } from "@wirecat/cli-base"
import { agentResult, type Body, inRun, sealed, UNTRUSTED, UNTRUSTED_INSTRUCTION } from "@wirecat/cli-core/cli"
import { FACT_TYPES, MEMORY_KINDS, MEMORY_SCOPES, openStore } from "@wirecat/cli-core/store"
import * as v from "valibot"
import { ACTION_QUERY, listActions, propose } from "../actions/actions.js"
import { AGENT_LOG_QUERY, listAgentActions } from "../agents/log.js"
import { itemAnswer } from "../answer.js"
import { FACT_QUERY, factItem, listFacts } from "../facts/fact.js"
import { mcpFailure } from "../failure.js"
import { queryArgument } from "../list-query.js"
import { addMemory } from "../memories/memories.js"
import { listMemories, MEMORY_QUERY, memoryItem } from "../memories/memory.js"
import { pageOf } from "../page.js"
import { VERSION } from "../version.js"
import { knowledgeTools } from "./knowledge.js"
import { taskRelationTools } from "./task-relations.js"
import { define, type MemoTool } from "./tool.js"
import { vocabularyTools } from "./vocabulary.js"

/** Every call is logged as this agent, and what it writes is authored by it. */
export const AGENT = "memo-mcp"
const by = { bot: AGENT }

/** What a client keeps when it defers the tools; Claude Code cuts it at 2048 characters. */
export const INSTRUCTIONS = [
  "The owner's own records: facts, memories and proposed actions, kept beside their messages, mail, notes and meetings.",
  "Search here across every source: search_all when you do not know where something was written; search_messages,",
  "search_mail, search_notes for one kind; person_context for one person across messengers and mail. tg, max and zm",
  "search only their own messages. Then keep what a conversation showed:",
  "",
  "- What happened — said, asked, decided, promised — is a fact: facts_add with its kind.",
  "- What you concluded — a summary, a digest, a preference — is a memory: memories_add.",
  "- Something to do in an account — a reply, an invitation — is actions_add. Nothing is sent.",
  "- Keep only what will matter later. Not every message is a fact; when unsure, do not save.",
  "- Every write cites evidence: the msg:, note: or meeting: reference you read it in.",
  "- Your writes wait as proposed until the owner confirms them, and every call is logged as memo-mcp.",
  "- Look first (facts_list, search_memories) so you do not propose what is already kept.",
  `- ${UNTRUSTED_INSTRUCTION}`,
].join("\n")
const limit = (most: number) => v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(most)))

export const MEMO_TOOLS: Record<string, MemoTool> = {
  ...knowledgeTools,
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
    description: `Memories holding every word, best first.`,
    writes: false,
    input: v.object({
      text: v.pipe(v.string(), v.minLength(1)),
      scope: v.optional(v.picklist(MEMORY_SCOPES)),
      limit: limit(500),
    }),
    run: (store, { text, ...options }) =>
      pageOf(
        "search memories",
        options.limit,
        async (limit) => (await store.memories.search(text, { ...options, limit })).map(memoryItem),
        { fallback: 20, cap: 200 },
      ),
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
      occurredAt: v.optional(v.string()),
      scope: v.optional(v.picklist(MEMORY_SCOPES)),
      supersedes: v.optional(v.string()),
    }),
    run: async (store, { kind, text, ...args }) =>
      itemAnswer(factItem(await store.facts.add({ ...args, type: kind, statement: text, by }))),
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
      "Propose what should be done in one account — a reply, a ban, an invitation — and why. Nothing is sent: the owner confirms it as a task or rejects it.",
    writes: true,
    input: v.object({
      kind: v.pipe(v.string(), v.regex(/^[a-z][a-z_]{0,39}$/)),
      reason: v.pipe(v.string(), v.minLength(1)),
      provider: v.string(),
      account: v.optional(v.string()),
      target: v.optional(v.string()),
      payload: v.optional(v.unknown()),
    }),
    run: async (store, { payload, ...proposal }) =>
      itemAnswer(
        await propose(
          store,
          { ...proposal, ...(payload === undefined ? {} : { payload: JSON.stringify(payload) }) },
          by,
        ),
      ),
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
export const createMemoServer = (env: NodeJS.ProcessEnv): McpServer => {
  const server = new McpServer({ name: "memo", version: VERSION }, { instructions: INSTRUCTIONS })
  for (const [name, tool] of Object.entries(MEMO_TOOLS)) {
    server.registerTool(
      name,
      {
        title: tool.title,
        // Said on every read tool, not only in the instructions: a host may show a model the tool alone.
        description: tool.writes ? tool.description : `${tool.description} ${UNTRUSTED}`,
        inputSchema: advertised(tool.input),
        annotations: { readOnlyHint: !tool.writes, destructiveHint: false, openWorldHint: false },
      },
      async (args: Record<string, unknown>) => {
        const startedAt = Date.now()
        let store: Awaited<ReturnType<typeof openStore>>
        try {
          store = await openStore({ env })
        } catch (error) {
          return mcpFailure(error)
        }
        try {
          let result: CallToolResult
          try {
            const body = await tool.run(store, v.parse(tool.input, args) as never, env)
            result = inRun({ runId: randomUUID(), command: name, startedAt }, () => answer(body))
          } catch (error) {
            result = mcpFailure(error)
          }
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
          return result
        } finally {
          await store.close()
        }
      },
    )
  }
  return server
}
