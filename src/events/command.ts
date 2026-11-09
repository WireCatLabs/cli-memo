import type { Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { LOCAL_READ, withQuery } from "@wirecat/cli-core/cli"
import { type Command, InvalidArgumentError } from "commander"
import { answers, itemAnswer, plainText, withStore } from "../answer.js"
import { accountsLine, EVENTS_NOTE, EVENTS_QUERY, listEvents, showEvent } from "./events.js"

const upTo1000 = (value: string): number => {
  const number = Number(value)
  if (!Number.isInteger(number) || number < 1 || number > 1000)
    throw new InvalidArgumentError("a whole number, 1 to 1000")
  return number
}

export const eventsCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const { print } = answers(program, streams, env)
  const events = program
    .command("events")
    .description("calendar events of every account in the store, phone calls included")
    .summary("calendar events and phone calls of every account")

  withQuery(
    annotate(events.command("list"), { effects: LOCAL_READ, partial: true })
      .description(
        "events of every calendar account in the store, latest start first: calendars and imported phone calls",
      )
      .summary("events and phone calls of every account, latest first"),
    EVENTS_QUERY,
  )
    .addHelpText("after", EVENTS_NOTE)
    .option("--limit <n>", "events at most, 1–1000", upTo1000, 100)
    .option("--json", "print JSON; --json=ref,title keeps only those fields")
    .action(async (words: string[], { json, limit }: { limit: number; json?: boolean }, command: Command) => {
      const body = await withStore(env, (store) => listEvents(store, words, limit))
      const accounts = (body.meta?.accounts as string[] | undefined) ?? []
      print(json, body, `${accountsLine(accounts)}\n${plainText(body, command)}`)
    })

  annotate(events.command("show"), { effects: LOCAL_READ, output: { entity: "event" } })
    .description("one event: its time, the accounts and calendars that hold it, and its attendees")
    .argument("<ref>", "event:<id>")
    .option("--json", "print JSON; --json=ref,title keeps only those fields")
    .action(async (ref: string, { json }: { json?: boolean }) =>
      print(json, itemAnswer(await withStore(env, (store) => showEvent(store, ref)))),
    )
}
