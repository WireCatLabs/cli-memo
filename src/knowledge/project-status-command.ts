import { CliError } from "@wirecat/cli-base"
import { annotate, annotateOption } from "@wirecat/cli-base/commands"
import type { NextStep } from "@wirecat/cli-base/standards"
import { parseReference } from "@wirecat/cli-core"
import {
  answerEntity,
  type Body,
  itemOf,
  LOCAL_READ,
  type ProjectStatusHints,
  projectCutoffTime,
  projectStatusAnswer,
  projectStatusRow,
  projectStatusSchema,
  projectStatusText,
  projectWindowOf,
} from "@wirecat/cli-core/cli"
import {
  type ProjectStatus,
  projectStatus,
  purposeList,
  STATUS_SIGNALS,
  type StatusChatSummary,
} from "@wirecat/cli-core/services"
import type { MessageStore } from "@wirecat/cli-core/store"
import { type Command, Option } from "commander"
import { withStore } from "../answer.js"
import { dealsText, openDealsOf } from "../finance/deals-command.js"
import { financeOf, financeText } from "../finance/finance.js"
import { collect } from "../options.js"
import { chatRead, chatSync, syncProfileOf } from "./messenger-sync.js"

interface Options {
  sinceTime: string
  beforeTime?: string
  contextQuery: string[]
  syncProfile?: Record<string, string>
  purpose?: string[]
  compact?: boolean
  json?: boolean
}

const withFinance = (row: ReturnType<typeof projectStatusRow>) => ({
  ...row,
  sections: { ...row.sections, finance: "memo_finance", deals: "memo_deal" },
})

type Print = (json: boolean | undefined, body: Body, text?: string, compact?: boolean) => void

/** Chat titles the store knows better than the chat list did; one read per answer. */
const titled = async (store: MessageStore, found: ProjectStatus) => {
  const summaries = await store.refs.summaries(found.chats.map((chat) => chat.ref))
  return {
    ...found,
    chats: found.chats.map((chat) => ({ ...chat, title: summaries.get(chat.ref)?.title ?? chat.title })),
  }
}

const linked = (chat: StatusChatSummary) => {
  const reference = parseReference(chat.ref)
  if (reference.type !== "chat") throw new Error(`${chat.ref} is not a chat reference`)
  return { provider: reference.provider, account: reference.account, chat: reference.chat }
}

/**
 * The chats to read are in tg, max or wa, which memo cannot run: a step names the command to type, with the profile
 * signed in to that chat's account, or `<profile>` when there is none or more than one; `blocked` keeps why. It is a
 * command step only while cli-core builds the answer, which keeps `line`; `asAction` hands it out as a user action.
 */
const outside =
  (blocked: Set<string>) =>
  (step: string, found: ReturnType<typeof chatSync>): NextStep | null => {
    if (!found) return null
    if (found.command === null) blocked.add(found.why)
    return {
      kind: "command",
      step,
      command: "projects status",
      args: {},
      line: found.command ?? found.line,
      why: "",
      safe_to_auto_execute: true,
    }
  }

const asAction = (step: NextStep): NextStep =>
  step.kind === "command"
    ? { kind: "user_action", step: step.step, why: `${step.why}: ${step.line}`, safe_to_auto_execute: false }
    : step

export const projectStatusCommand = (projects: Command, print: Print, env: NodeJS.ProcessEnv) =>
  answerEntity(
    annotate(projects.command("status"), { effects: LOCAL_READ, partial: true }),
    "project_status",
    projectStatusSchema,
    { row: withFinance(projectStatusRow(STATUS_SIGNALS)) },
  )
    .description(
      "where a project stands, from the stored messages of every chat confirmed as the project's or its child " +
        "projects', in every account those links name (meta.accounts lists them): the last message, who replies " +
        "next, open questions both ways, promises, amounts with their direction, payments recorded, billed, paid and " +
        "owed per currency from confirmed invoices and payments (finance), up to five open confirmed deals (deals), how long each " +
        "--context-query has been quiet on their side, and how much of each chat is held. Amounts, directions and " +
        "promises found by words are marked pattern: read the cited message before trusting one. Others' questions " +
        "in a group with no role, and others' word-found promises in a group, are counted on the chat's row as " +
        "unlisted, not listed. next names at most " +
        "two chats to read, with the messenger command that reads them. No model call; nothing leaves this machine",
    )
    .summary("where a project stands: whose move, open asks, money, chats to read next")
    .argument("<project>", "an existing project's id, project:<id>, key, exact name or alias")
    .option("--since-time <time>", "how far back: days (60d, at most 730d) or a start date (2026-09-01)", "60d")
    .option("--before-time <time>", "fixed exclusive end: ISO 8601 timestamp with UTC offset; days back count from it")
    .option(
      "--context-query <words>",
      "words that all appear in one text; reports their last mention per side. Repeat for another",
      collect,
      [],
    )
    .option(
      "--sync-profile <tool=profile>",
      "the messenger profile the next steps name when several are signed in to a chat's account, such as " +
        "max=default; repeat for another tool",
      syncProfileOf,
    )
    .option(
      "--purpose <purpose>",
      "the linked chats' purposes to read, comma-separated: work, sales, support, other, or all; default work",
      purposeList,
    )
    .addOption(
      annotateOption(new Option("--compact", "one line per signal, chat and next step, for an agent"), { mcp: false }),
    )
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (project: string, options: Options) => {
      if (options.compact && options.json)
        throw new CliError("validation_error", "--compact and --json ask for different output — pick one", {
          reason: "output.conflict",
          param: "--compact",
        })
      const chosen = options.syncProfile ?? {}
      const { found, finance, open } = await withStore(env, async (store) => {
        const status = await projectStatus(store, {
          project,
          ...projectWindowOf(options.sinceTime),
          ...(options.beforeTime === undefined ? {} : { asOf: projectCutoffTime(options.beforeTime) }),
          contextQueries: options.contextQuery,
          ...(options.purpose ? { purposes: options.purpose } : {}),
        })
        const projects = [status.project.ref, ...status.children.map((child) => child.ref)]
        const books = await financeOf(store, projects)
        return { found: await titled(store, status), finance: books, open: await openDealsOf(store, projects) }
      })
      const blocked = new Set<string>()
      const step = outside(blocked)
      const hints: ProjectStatusHints = {
        sync: (chat, since) => step("messages.sync", chatSync(linked(chat), since, env, chosen)),
        read: (chat, since) => step("messages.list", chatRead(linked(chat), since, env, chosen)),
        line: (one) => (one.kind === "command" ? (one.line ?? one.command) : one.why),
      }
      const { item, next, missing, meta } = projectStatusAnswer(found, hints)
      const gaps = [...missing, ...(blocked.size ? [{ field: "next_command", why: [...blocked].join("; ") }] : [])]
      print(
        options.json,
        itemOf(
          {
            ...item,
            ...(finance.length ? { finance } : {}),
            ...(open.deals.length ? { deals: open.deals } : {}),
            ...(open.more ? { deals_more: open.more } : {}),
          },
          {
            ...(next.length ? { next: next.map(asAction) } : {}),
            ...(gaps.length ? { missing: gaps } : {}),
            meta,
          },
        ),
        [projectStatusText(found, hints), ...financeText(finance), ...dealsText(open)].join("\n"),
        options.compact === true,
      )
    })
