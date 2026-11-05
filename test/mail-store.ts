import { headersOf, type Listed, type MailSource, syncMail } from "@wirecat/cli-core/mail"
import type { MessageStore } from "@wirecat/cli-core/store"

/** A synthetic email, as the tests write one. */
export interface FakeEmail {
  uid: string
  messageId: string
  threadId: string
  receivedAt: string
  subject: string
  from: [string | null, string]
  to: [string | null, string][]
  cc?: [string | null, string][]
  listId?: string
  text?: string
  html?: string
  labels?: string[]
  attachment?: { name: string; mime: string; content: string }
}

const person = ([name, address]: [string | null, string]) => (name ? `"${name}" <${address}>` : address)

const rawOf = (m: FakeEmail): Buffer => {
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

const sourceOf = (emails: FakeEmail[]): MailSource => ({
  list: async (since, folder) =>
    emails
      .filter((m) => Date.parse(m.receivedAt) >= since.getTime())
      .map(
        (m): Listed => ({
          uid: m.uid,
          messageId: m.messageId,
          threadId: m.threadId,
          receivedAt: new Date(m.receivedAt).toISOString(),
          folder,
          size: rawOf(m).length,
          labels: m.labels ?? [],
          headers: headersOf(rawOf(m).toString().split("\r\n\r\n")[0] ?? ""),
        }),
      ),
  fetchRaw: async (items) =>
    items.map((item) => {
      const found = emails.find((m) => m.uid === item.uid)
      return found ? new Uint8Array(rawOf(found)) : new Error(`email ${item.uid} is not in the fake mailbox`)
    }),
})

/** Stores synthetic Gmail mail as the `mail` CLI does: cli-core's sync, so memo reads it as it reads real mail. */
export const storeMail = (
  store: MessageStore,
  address: string,
  emails: FakeEmail[],
  { since = new Date(0), now }: { since?: Date; now?: () => number } = {},
) =>
  syncMail(sourceOf(emails), store, {
    account: { address, mode: "gmail", folders: ["[Gmail]/All Mail"] },
    since,
    ...(now ? { now } : {}),
  })
