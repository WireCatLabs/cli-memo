import { type Progress, progressLine, progressOf } from "@wirecat/cli-core/background"
import type { MessageStore } from "@wirecat/cli-core/store"
import { mailFolders } from "./accounts.js"
import type { MailAccount } from "./import.js"
import { MBOX_RESUME, type MboxPoint, parsePoint, type ResumePoint, resumeKey } from "./resume.js"
import { ENVELOPE } from "./rules.js"

export interface MailStatus {
  account: string
  /** Emails stored with their text. */
  stored: number
  /** Emails a rule recorded without their text. */
  envelopes: number
  /** Mail whose outcome is final, of the mail in the widest window searched. */
  progress: Progress
  folders: { folder: string; done: number; total: number; fullAt: string; updatedAt: string }[]
  /** An mbox account: the file read last, and whether it was read to the end. */
  file?: MboxPoint
}

/** Read from the store only; the mailbox is not asked, so this answers while a sync runs. */
export const mailStatus = async (store: MessageStore, account: MailAccount, now = new Date()): Promise<MailStatus> => {
  const key = { provider: "email", account: account.address.toLowerCase() }
  const stored = await store.storedAccount(key).catch(() => null)
  const refs = stored === null ? [] : await store.mail.emailRefs({ accountId: stored.id })
  const envelopes = refs.filter(({ mailboxes }) => mailboxes.some(({ kind }) => kind === ENVELOPE)).length
  const folders: MailStatus["folders"] = []
  for (const folder of mailFolders(account)) {
    const point = parsePoint<ResumePoint>((await store.syncState(key, resumeKey(folder)))?.value)
    if (point !== undefined)
      folders.push({
        folder,
        done: point.window.done,
        total: point.window.total,
        fullAt: point.full.at,
        updatedAt: point.updatedAt,
      })
  }
  const file = parsePoint<MboxPoint>((await store.syncState(key, MBOX_RESUME))?.value)
  const updatedAt = [...folders.map((each) => each.updatedAt), ...(file ? [file.updatedAt] : [])].sort().at(-1)
  const progress = folders.length
    ? progressOf({
        job: "mail",
        profile: account.name,
        done: folders.reduce((sum, each) => sum + each.done, 0),
        total: folders.reduce((sum, each) => sum + each.total, 0),
        ...(updatedAt === undefined ? {} : { updatedAt }),
        now,
      })
    : progressOf({
        job: "mail",
        profile: account.name,
        done: refs.length,
        ...(file === undefined ? {} : { complete: file.complete }),
        ...(updatedAt === undefined ? {} : { updatedAt }),
        now,
      })
  return {
    account: account.name,
    stored: refs.length - envelopes,
    envelopes,
    progress,
    folders,
    ...(file === undefined ? {} : { file }),
  }
}

export const statusText = (status: MailStatus): string =>
  [
    progressLine(status.progress),
    `${status.stored} stored in full, ${status.envelopes} recorded as envelopes`,
    ...status.folders.map(
      ({ folder, done, total, fullAt }) =>
        `${folder}: ${done} of ${total} done; last whole listing ${fullAt.slice(0, 16).replace("T", " ")} UTC`,
    ),
    ...(status.file === undefined
      ? []
      : [`file: ${status.file.size} bytes, ${status.file.complete ? "read to the end" : "partly read"}`]),
  ].join("\n")
