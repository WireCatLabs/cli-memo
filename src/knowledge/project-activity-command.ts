import type { Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { LOCAL_READ, projectWindowOf } from "@wirecat/cli-core/cli"
import { type ProjectActivity, projectActivity } from "@wirecat/cli-core/services"
import { Command } from "commander"
import { answers, listAnswer, withStore } from "../answer.js"
import { positive } from "../options.js"
import { groupScopeOf } from "../store/group.js"

const DAY = 86_400_000

/** `all`, or days back (30d) or a start date as `projects status` takes them. */
const sinceOf = (value: string, now: number): number => {
  if (value.trim().toLowerCase() === "all") return 0
  const window = projectWindowOf(value)
  return "days" in window ? now - window.days * DAY : window.after
}

const textOf = (one: ProjectActivity): string =>
  [
    `${one.key ?? one.ref}  ${one.name} · ${one.chats} chats${one.muted ? ` (${one.muted} muted, not counted)` : ""} · ` +
      `${one.messages} messages (${one.sent} yours)${one.lastAt ? ` · last ${one.lastAt.slice(0, 10)}` : ""}` +
      (one.partial ? " · some sub-projects not counted" : ""),
    ...one.top.map((chat) => `  ${chat.messages}  ${chat.title ?? chat.ref}`),
  ].join("\n")

/** How busy each project's linked chats were: one light read for a dashboard, where `projects status` is per project. */
export const projectActivityCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const { print } = answers(program, streams, env)
  const stats =
    program.commands.find((command) => command.name() === "stats") ??
    program.command("stats").description("statistics about what the store holds")
  const projects = new Command("projects").description("project statistics")
  stats.addCommand(projects)
  annotate(projects.command("show"), { effects: LOCAL_READ })
    .summary("each project's linked chats: messages in a period, last activity, busiest chats")
    .description(
      "for each of your projects, the chats linked to it or its child projects (every confirmed link, any purpose, " +
        "no chat limit, unlike projects status): how many, how many are muted, messages and yours in the period by when they " +
        "were sent, the newest message and the three busiest chats; a muted chat's messages are not counted. Busiest " +
        "first. One read for all projects; projects status <project> says where one stands",
    )
    .option("--since-time <time>", "how far back: days (30d, at most 730d), a start date (2026-09-01) or all", "30d")
    .option("--limit <n>", "most projects on a page, up to 200", positive, 20)
    .option("--page <n>", "which page, from 1", positive, 1)
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (options: { sinceTime: string; limit: number; page: number; json?: boolean }) => {
      const now = Date.now()
      const since = sinceOf(options.sinceTime, now)
      const limit = Math.min(options.limit, 200)
      const found = await withStore(env, async (store) => {
        const scope = await groupScopeOf(store, env)
        return projectActivity(store, {
          since,
          until: now,
          limit,
          offset: (options.page - 1) * limit,
          ...(scope === undefined ? {} : { accounts: scope.accounts }),
        })
      })
      print(
        options.json,
        listAnswer("stats projects show", {
          items: found.items,
          limit,
          page: options.page,
          has_more: found.hasMore,
          total: { value: found.total, relation: "eq" as const },
          args: { since_time: options.sinceTime, limit },
        }),
        [
          since === 0 ? "all time" : `since ${new Date(since).toISOString().slice(0, 10)}`,
          ...(found.items.length
            ? found.items.map(textOf)
            : [options.page > 1 ? "no projects on this page" : "no projects"]),
          ...(found.hasMore
            ? [`more: --since-time ${options.sinceTime} --limit ${limit} --page ${options.page + 1}`]
            : []),
        ].join("\n\n"),
      )
    })
}
