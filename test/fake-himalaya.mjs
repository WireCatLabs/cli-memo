#!/usr/bin/env node
// Stands in for himalaya in tests: answers `imap raw` and `imap fetch` from the mailbox JSON at
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

const person = ([name, address]) => (name ? `"${name}" <${address}>` : address)
const raw = (m) => {
  const type = m.html ? "text/html" : "text/plain"
  const headers = [
    `From: ${person(m.from)}`,
    `To: ${m.to.map(person).join(", ")}`,
    ...(m.cc ? [`Cc: ${m.cc.map(person).join(", ")}`] : []),
    ...(m.listId ? [`List-Id: News <${m.listId}>`, `List-Unsubscribe: <mailto:leave@${m.listId}>`] : []),
    `Subject: ${m.subject}`,
    `Message-ID: <${m.messageId}@example.test>`,
    `Date: ${new Date(m.receivedAt).toUTCString()}`,
    "MIME-Version: 1.0",
    `Content-Type: ${type}; charset=utf-8`,
    "Content-Transfer-Encoding: base64",
  ]
  const body = Buffer.from(m.html ?? m.text ?? "").toString("base64")
  return Buffer.from(`${headers.join("\r\n")}\r\n\r\n${body}\r\n`)
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
    } else if (
      command.startsWith("UID FETCH") &&
      command.includes("HEADER.FIELDS") &&
      !command.includes("INTERNALDATE")
    ) {
      const set = command.split(" ")[2].split(",")
      for (const [index, m] of mailbox.messages.entries()) {
        if (!set.includes(m.uid)) continue
        const head = `${raw(m).toString().split("\r\n\r\n")[0]}\r\n\r\n`
        out.push(
          `* ${index + 1} FETCH (UID ${m.uid} BODY[HEADER.FIELDS (FROM)] {${Buffer.byteLength(head)}}\r\n${head})`,
        )
      }
      out.push(`${tag} OK Success`)
    } else if (command.startsWith("UID FETCH") && command.includes("X-GM-LABELS")) {
      const set = command.split(" ")[2].split(",")
      for (const [index, m] of mailbox.messages.entries()) {
        if (set.includes(m.uid))
          out.push(
            `* ${index + 1} FETCH (UID ${m.uid} X-GM-LABELS (${(m.labels ?? []).join(" ")}) FLAGS (${(m.flags ?? []).join(" ")}))`,
          )
      }
      out.push(`${tag} OK Success`)
    } else if (command.startsWith("UID FETCH")) {
      const set = command.split(" ")[2].split(",")
      for (const [index, m] of mailbox.messages.entries()) {
        if (set.includes(m.uid))
          out.push(
            `* ${index + 1} FETCH (X-GM-THRID ${m.threadId} X-GM-MSGID ${m.messageId} UID ${m.uid} INTERNALDATE "${internal(m.receivedAt)}" RFC822.SIZE ${raw(m).length})`,
          )
      }
      out.push(`${tag} OK Success`)
    }
  }
  process.stdout.write(`${out.join("\r\n")}\r\n`)
} else if (args.includes("imap") && args.includes("fetch")) {
  const set = args[args.indexOf("fetch") + 1].split(",")
  if (set.some((uid) => mailbox.unreadable?.includes(uid))) {
    process.stderr.write("fake himalaya: unreadable message\n")
    process.exit(1)
  }
  const messages = mailbox.messages
    .filter((m) => set.includes(m.uid))
    .map((m, index) => ({ seq: index + 1, uid: Number(m.uid), body: raw(m).toString("base64") }))
  process.stdout.write(JSON.stringify({ messages }))
} else {
  process.stderr.write(`fake himalaya: unexpected ${args.join(" ")}\n`)
  process.exit(2)
}
