import { CliError } from "@leemour/cli-core"
import type { Himalaya } from "./himalaya.js"

export interface Listed {
  uid: string
  /** Gmail's own ids: the same in every folder, and they survive a UID reset. */
  messageId: string
  threadId: string
  receivedAt: string
}

const ALL_MAIL = '"[Gmail]/All Mail"'
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const FETCH_BATCH = 500

const imapDate = (day: Date): string => `${day.getUTCDate()}-${MONTHS[day.getUTCMonth()]}-${day.getUTCFullYear()}`

/** IMAP's `INTERNALDATE`: `"04-Oct-2026 19:51:09 +0000"`. */
const isoOf = (internal: string): string => {
  const match = /^\s*(\d{1,2})-(\w{3})-(\d{4}) (\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2})$/.exec(internal)
  if (match === null) throw new CliError("invalid_response", `unexpected IMAP date "${internal}"`)
  const [, day, month, year, hour, minute, second, sign, offsetHours, offsetMinutes] = match
  const local = Date.UTC(
    Number(year),
    MONTHS.indexOf(month ?? ""),
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  )
  const offset = (Number(offsetHours) * 60 + Number(offsetMinutes)) * 60_000 * (sign === "-" ? -1 : 1)
  return new Date(local - offset).toISOString()
}

/** A tagged NO or BAD comes back as output, not as an error, so every tag must end in OK. */
const assertCompleted = (output: string, tags: string[]): void => {
  for (const tag of tags) {
    if (!new RegExp(`^${tag} OK`, "m").test(output)) {
      const line = output.split(/\r?\n/).find((text) => text.startsWith(`${tag} `)) ?? "no answer"
      throw new CliError("provider_error", `IMAP command ${tag} did not complete: ${line}`)
    }
  }
}

/**
 * Every message in All Mail received since `since`, read with EXAMINE so nothing can change a flag.
 * All Mail rather than INBOX: an archived message leaves INBOX but is not deleted.
 */
export const listAllMail = async (run: Himalaya, account: string, since: Date): Promise<Listed[]> => {
  const search = await run(
    ["imap", "raw", "-a", account],
    `a EXAMINE ${ALL_MAIL}\r\nb UID SEARCH SINCE ${imapDate(since)}\r\n`,
  )
  assertCompleted(search, ["a", "b"])
  const uids = (/^\* SEARCH(.*)$/m.exec(search)?.[1] ?? "").trim().split(/\s+/).filter(Boolean)
  if (uids.length === 0) return []

  const batches: string[] = []
  for (let start = 0; start < uids.length; start += FETCH_BATCH)
    batches.push(uids.slice(start, start + FETCH_BATCH).join(","))
  const tags = batches.map((_, index) => `f${index}`)
  const fetched = await run(
    ["imap", "raw", "-a", account],
    `a EXAMINE ${ALL_MAIL}\r\n${batches
      .map((set, index) => `${tags[index]} UID FETCH ${set} (UID X-GM-MSGID X-GM-THRID INTERNALDATE)\r\n`)
      .join("")}`,
  )
  assertCompleted(fetched, ["a", ...tags])

  const listed = [...fetched.matchAll(/^\* \d+ FETCH \((.*)\)\s*$/gm)].map(([, items = ""]) => {
    const item = (name: string) => new RegExp(`${name} (\\d+)`).exec(items)?.[1]
    const internal = /INTERNALDATE "([^"]+)"/.exec(items)?.[1]
    const uid = item("UID")
    const messageId = item("X-GM-MSGID")
    const threadId = item("X-GM-THRID")
    if (!uid || !messageId || !threadId || !internal)
      throw new CliError("invalid_response", `IMAP FETCH answer without the Gmail ids: ${items}`)
    return { uid, messageId, threadId, receivedAt: isoOf(internal) }
  })
  if (listed.length !== uids.length)
    throw new CliError("invalid_response", `IMAP listed ${uids.length} messages but fetched ${listed.length}`)
  return listed
}
