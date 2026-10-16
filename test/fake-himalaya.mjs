#!/usr/bin/env node
// Stands in for himalaya in tests: answers `imap raw` and `imap fetch` from the mailbox JSON at
// MEMO_FAKE_MAILBOX, in the shapes Himalaya 2.2.1 printed against a real Gmail account.
import { appendFileSync, readFileSync, writeFileSync } from "node:fs"

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
  ]
  const body = Buffer.from(m.html ?? m.text ?? "").toString("base64")
  if (!m.attachment)
    return Buffer.from(
      `${[...headers, `Content-Type: ${type}; charset=utf-8`, "Content-Transfer-Encoding: base64"].join("\r\n")}\r\n\r\n${body}\r\n`,
    )
  const parts = [
    `--b1\r\nContent-Type: ${type}; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${body}`,
    `--b1\r\nContent-Type: ${m.attachment.mime}\r\nContent-Disposition: attachment; filename="${m.attachment.name}"\r\n` +
      `Content-Transfer-Encoding: base64\r\n\r\n${Buffer.from(m.attachment.content).toString("base64")}`,
  ]
  return Buffer.from(
    `${[...headers, 'Content-Type: multipart/mixed; boundary="b1"'].join("\r\n")}\r\n\r\n${parts.join("\r\n")}\r\n--b1--\r\n`,
  )
}

if (mailbox.fail) {
  process.stderr.write(mailbox.fail)
  process.exit(1)
}

// UK English names Trash "Bin"; a client that assumes "[Gmail]/Trash" gets what Gmail answers it.
const TRASH = "[Gmail]/Bin"
const MISSING = (tag, name) => `${tag} NO [NONEXISTENT] Unknown Mailbox: ${name} (Failure) [THROTTLED]`
// Gmail names All Mail in the account's language too; `allMail` sets it for one test.
const ALL = mailbox.allMail ?? "[Gmail]/All Mail"
// Messages live in All Mail unless a move put them in Trash; INBOX is All Mail with the \\Inbox label, as on Gmail.
let current = ALL
const here = () => mailbox.messages.filter((m) => (current === TRASH ? m.folder === TRASH : m.folder !== TRASH))
const isInbox = (label) => label.includes("Inbox")
// One spelling per label, so a label put back is not counted twice: a quoted plain name is the bare atom.
const plain = (label) => (/^"[\w -]*"$/.test(label) && !label.includes(" ") ? label.slice(1, -1) : label)

if (args[0] === "imap" && args[1] === "raw") {
  const input = readFileSync(0, "utf8")
  const out = []
  let changed = false
  for (const line of input.split("\r\n").filter(Boolean)) {
    const [tag, ...rest] = line.split(" ")
    const command = rest.join(" ")
    if (command.startsWith("LIST")) {
      out.push(
        `* LIST (\\All \\HasNoChildren) "/" ${JSON.stringify(ALL)}`,
        `* LIST (\\HasNoChildren \\Trash) "/" ${JSON.stringify(TRASH)}`,
        '* LIST (\\HasNoChildren \\Sent) "/" "[Gmail]/Sent Mail"',
        `${tag} OK Success [THROTTLED]`,
      )
    } else if (
      (command.startsWith("EXAMINE") || command.startsWith("SELECT")) &&
      ![ALL, TRASH, "INBOX"].includes(JSON.parse(command.slice(command.indexOf(" ") + 1)))
    ) {
      out.push(MISSING(tag, JSON.parse(command.slice(command.indexOf(" ") + 1))))
    } else if (command.startsWith("EXAMINE") || command.startsWith("SELECT")) {
      current = JSON.parse(command.slice(command.indexOf(" ") + 1))
      out.push(`* OK [UIDVALIDITY ${mailbox.validity ?? 12}] UIDs valid.`, `${tag} OK selected. (Success)`)
    } else if (command.startsWith("UID MOVE")) {
      const [, , set, ...target] = command.split(" ")
      const to = JSON.parse(target.join(" "))
      for (const m of here().filter((m) => set.split(",").includes(m.uid))) {
        if (to === TRASH) {
          m.folder = TRASH
          m.labels = (m.labels ?? []).filter((label) => !isInbox(label))
        } else {
          delete m.folder
          if (to === "INBOX" && !(m.labels ?? []).some(isInbox)) m.labels = ['"\\\\Inbox"', ...(m.labels ?? [])]
        }
      }
      changed = true
      out.push(`${tag} ${mailbox.moveFails ? "NO [THROTTLED]" : "OK [COPYUID 2 1 1] (Success)"}`)
    } else if (command.startsWith("UID STORE") && command.includes("+X-GM-LABELS")) {
      const set = command.split(" ")[2].split(",")
      const added =
        command.slice(command.indexOf("(") + 1, command.lastIndexOf(")")).match(/"(?:[^"\\]|\\.)*"|\S+/g) ?? []
      for (const m of here().filter((m) => set.includes(m.uid)))
        m.labels = [...new Set([...(m.labels ?? []), ...added].map(plain))]
      changed = true
      out.push(`${tag} OK Success`)
    } else if (command.startsWith("UID SEARCH SINCE")) {
      const [day, month, year] = command.slice("UID SEARCH SINCE ".length).split("-")
      const since = Date.UTC(Number(year), months.indexOf(month), Number(day))
      const uids = here()
        .filter((m) => Date.parse(m.receivedAt) >= since)
        .map((m) => m.uid)
      out.push(
        `* SEARCH ${uids.join(" ")}`.trimEnd(),
        `${tag} ${mailbox.searchFails ? "NO failed" : "OK SEARCH completed (Success)"}`,
      )
    } else if (command.startsWith("UID SEARCH UID ")) {
      const set = command.slice("UID SEARCH UID ".length).split(",")
      const uids = here()
        .filter((m) => set.includes(m.uid))
        .map((m) => m.uid)
      out.push(`* SEARCH ${uids.join(" ")}`.trimEnd(), `${tag} OK SEARCH completed (Success)`)
    } else if (command.startsWith("UID SEARCH X-GM-MSGID")) {
      const id = command.slice("UID SEARCH X-GM-MSGID ".length)
      // Which Gmail ids a retry looked up, so a test can see that nothing else was asked for.
      if (mailbox.log) appendFileSync(mailbox.log, `msgid:${id}\n`)
      const uids = here()
        .filter((m) => m.messageId === id)
        .map((m) => m.uid)
      out.push(`* SEARCH ${uids.join(" ")}`.trimEnd(), `${tag} OK SEARCH completed (Success)`)
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
      out.push(`${tag} ${mailbox.headersFail ? "NO [THROTTLED]" : "OK Success"}`)
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
      // Which messages a listing asked for, so a test can see what a resumed run lists.
      if (mailbox.log) appendFileSync(mailbox.log, `${set.join(",")}\n`)
      for (const [index, m] of mailbox.messages.entries()) {
        if (set.includes(m.uid))
          out.push(
            `* ${index + 1} FETCH (X-GM-THRID ${m.threadId} X-GM-MSGID ${m.messageId} UID ${m.uid} INTERNALDATE "${internal(m.receivedAt)}" RFC822.SIZE ${raw(m).length})`,
          )
      }
      out.push(`${tag} OK Success`)
    }
  }
  if (changed) writeFileSync(process.env.MEMO_FAKE_MAILBOX, JSON.stringify(mailbox))
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
