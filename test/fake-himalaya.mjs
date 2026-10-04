#!/usr/bin/env node
// Stands in for himalaya in tests: answers `imap raw` and `message read` from the mailbox JSON at
// MEMO_FAKE_MAILBOX, in the shapes Himalaya 2.2.1 printed against a real Gmail account.
import { readFileSync } from "node:fs"

const mailbox = JSON.parse(readFileSync(process.env.MEMO_FAKE_MAILBOX, "utf8"))
const args = process.argv.slice(2)
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const internal = (iso) => {
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, "0")
  return `${pad(d.getUTCDate())}-${months[d.getUTCMonth()]}-${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} +0000`
}

if (mailbox.fail) {
  process.stderr.write(mailbox.fail)
  process.exit(1)
}

if (args[0] === "imap" && args[1] === "raw") {
  const input = readFileSync(0, "utf8")
  const out = []
  for (const line of input.split("\r\n").filter(Boolean)) {
    const [tag, ...rest] = line.split(" ")
    const command = rest.join(" ")
    if (command.startsWith("EXAMINE"))
      out.push("* OK [UIDVALIDITY 12] UIDs valid.", `${tag} OK [READ-ONLY] selected. (Success)`)
    else if (command.startsWith("UID SEARCH SINCE")) {
      const [day, month, year] = command.slice("UID SEARCH SINCE ".length).split("-")
      const since = Date.UTC(Number(year), months.indexOf(month), Number(day))
      const uids = mailbox.messages.filter((m) => Date.parse(m.receivedAt) >= since).map((m) => m.uid)
      out.push(
        `* SEARCH ${uids.join(" ")}`.trimEnd(),
        `${tag} ${mailbox.searchFails ? "NO failed" : "OK SEARCH completed (Success)"}`,
      )
    } else if (command.startsWith("UID FETCH")) {
      const set = command.split(" ")[2].split(",")
      for (const [index, m] of mailbox.messages.entries()) {
        if (set.includes(m.uid))
          out.push(
            `* ${index + 1} FETCH (X-GM-THRID ${m.threadId} X-GM-MSGID ${m.messageId} UID ${m.uid} INTERNALDATE "${internal(m.receivedAt)}")`,
          )
      }
      out.push(`${tag} OK Success`)
    }
  }
  process.stdout.write(`${out.join("\r\n")}\r\n`)
} else if (args.includes("message") && args.includes("read")) {
  const m = mailbox.messages.find((item) => item.uid === args.at(-1))
  const address = (list) => ({ Address: { List: list.map(([name, address]) => ({ name, address })) } })
  const headers = [
    { name: "from", value: address([m.from]) },
    { name: "subject", value: { Text: m.subject } },
    { name: "to", value: address(m.to) },
  ]
  const parts = m.html
    ? [{ headers, body: { Html: m.html } }]
    : [
        { headers, body: { Multipart: [1] } },
        { headers: [], body: { Text: m.text } },
      ]
  process.stdout.write(
    JSON.stringify({ html_body: m.html ? [0] : [], text_body: m.html ? [0] : [1], attachments: [], parts }),
  )
} else {
  process.stderr.write(`fake himalaya: unexpected ${args.join(" ")}\n`)
  process.exit(2)
}
