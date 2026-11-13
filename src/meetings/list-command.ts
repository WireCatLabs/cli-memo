import type { Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { accountsMeta } from "@wirecat/cli-core/calendar"
import {
  LOCAL_READ,
  MEETINGS_AHEAD_DAYS,
  MEETINGS_LIST_QUERY,
  MEETINGS_RECENT_DAYS,
  meetingListRequest,
  withQuery,
} from "@wirecat/cli-core/cli"
import { listMeetingEntries, showMeetingEntry } from "@wirecat/cli-core/services"
import type { Command } from "commander"
import { answers, itemAnswer, listAnswer, plainText, withStore } from "../answer.js"
import { between, oneOf, positive } from "../options.js"

const ORDERS = ["recent", "start"] as const

interface ListOptions {
  limit: number
  page: number
  order: (typeof ORDERS)[number]
  json?: boolean
}

const NOTE =
  "\nEvery calendar and meeting account in the store is read, phone imports included. A calendar event and its " +
  "Zoom or Meet meeting are one row when the store linked them, or when they share a room (join key) and their " +
  `times overlap. Without started_at: the last ${MEETINGS_RECENT_DAYS} days and the next ${MEETINGS_AHEAD_DAYS}. ` +
  "Latest start first."

/** `memo meetings list` and `show`, in the `meetings` group `meetings actions` made. */
export const meetingListCommands = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const { print } = answers(program, streams, env)
  const meetings = program.commands.find((command) => command.name() === "meetings")
  if (!meetings) throw new Error("the meetings group is registered before its list")

  withQuery(
    annotate(meetings.command("list"), { effects: LOCAL_READ, partial: true, output: { entity: "meeting_entry" } })
      .description(
        "meetings, calls and calendar events of every account as one row per real meeting, latest start first",
      )
      .summary("meetings, calls and events of every account"),
    MEETINGS_LIST_QUERY,
  )
    .addHelpText("after", NOTE)
    .option("--limit <n>", "rows per page, 1–1000; a month for a calendar fits in 1000", between(1, 1000), 50)
    .option("--page <n>", "which page, from 1", positive, 1)
    .option(
      "--order <recent|start>",
      "recent: latest start first; start: oldest first, for a calendar window",
      oneOf(ORDERS),
      "recent",
    )
    .option("--json", "print JSON; --json=ref,title keeps only those fields")
    .action(async (words: string[], { json, limit, page, order }: ListOptions, command: Command) => {
      const { request, meta } = meetingListRequest(words, {
        limit,
        page,
        order: order === "start" ? "start" : "newest",
      })
      const body = await withStore(env, async (store) => {
        const found = await listMeetingEntries(store, request)
        // Calendars a sync left behind make the answer partial, as `events list` says; a meeting account has none.
        const held = []
        for (const { id, provider, account } of found.read)
          if ((await store.calendar.calendars(id)).length > 0) held.push({ id, key: { provider, account } })
        const calendars = await accountsMeta(store.calendar, held, [], Date.now())
        return listAnswer("meetings list", {
          items: found.items,
          limit,
          page,
          total: found.total,
          has_more: request.offset + found.items.length < found.total.value,
          args: { query: words.join(" ") || undefined, limit, ...(order === "start" ? { order } : {}) },
          meta: { ...calendars, accounts: found.accounts, ...meta },
        })
      })
      print(json, body, plainText(body, command))
    })

  annotate(meetings.command("show"), { effects: LOCAL_READ, output: { entity: "meeting_entry_details" } })
    .description(
      "one meeting row: its people, transcript lines with times, summaries, findings, calendar text and documents",
    )
    .summary("one meeting with its transcript")
    .argument("<meeting>", "event:<id> or meeting:<account>/<id>, from meetings list")
    .option(
      "--cursor <cursor>",
      "the transcript line to start at: where the last read ended",
      between(0, Number.MAX_SAFE_INTEGER),
      0,
    )
    .option("--limit <n>", "transcript lines at most, 1–2000", between(1, 2000), 200)
    .option("--json", "print JSON; --json=ref,transcript keeps only those fields")
    .action(async (ref: string, { json, cursor, limit }: { cursor: number; limit: number; json?: boolean }) =>
      print(json, itemAnswer(await withStore(env, (store) => showMeetingEntry(store, ref, { offset: cursor, limit })))),
    )
}
