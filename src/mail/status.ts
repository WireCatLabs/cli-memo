import { type Progress, progressLine, progressOf } from "@wirecat/cli-core/background"
import type { MessageStore } from "@wirecat/cli-core/store"
import { mailFolders } from "./accounts.js"
import type { MailAccount } from "./import.js"
import { MBOX_RESUME, type MboxPoint, parsePoint, type ResumePoint, resumeKey } from "./resume.js"
import { ENVELOPE } from "./rules.js"

export interface FolderStatus {
  folder: string
  /** The widest window ever listed, and how much of it is stored. */
  since: string
  done: number
  total: number
  /** The latest run, which may be the timer's few days and must not be read as the whole mailbox. */
  last?: { since: string; done: number; total: number; at: string }
  fullAt: string
  updatedAt: string
}

export interface MailStatus {
  account: string
  /** Emails stored with their text. */
  stored: number
  /** Emails a rule recorded without their text. */
  envelopes: number
  /** Mail whose outcome is final, of the mail in the widest window ever listed. */
  progress: Progress
  folders: FolderStatus[]
  /** An mbox account: the file read last, and whether it was read to the end. */
  file?: MboxPoint
}

/** Read from the store only; the mailbox is not asked, so this answers while a sync runs. */
export const mailStatus = async (store: MessageStore, account: MailAccount, now = new Date()): Promise<MailStatus> => {
  const key = { provider: "email", account: account.address.toLowerCase() }
  const stored = await store.accounts.storedAccount(key).catch(() => null)
  const refs = stored === null ? [] : await store.mail.emailRefs({ accountId: stored.id })
  const envelopes = refs.filter(({ mailboxes }) => mailboxes.some(({ kind }) => kind === ENVELOPE)).length
  // Read from the store alone, so a Gmail account's All Mail is the folder the import stored, in its own language.
  const storedFolders =
    stored === null || account.folders !== undefined || account.mode === "imap"
      ? []
      : (await store.mail.mailboxes(stored.id)).filter(({ kind }) => kind === null).map(({ externalId }) => externalId)
  const folders: FolderStatus[] = []
  for (const folder of storedFolders.length ? storedFolders : await mailFolders(account)) {
    const point = parsePoint<ResumePoint>((await store.sync.syncState(key, resumeKey(folder)))?.value)
    if (point === undefined) continue
    const widest = point.widest ?? { since: point.window.since, total: point.window.total, at: point.updatedAt }
    // The UID ranges count only while the window they describe is the widest; after a rule change or a new
    // UIDVALIDITY they start over, and the stored mail is what is known to be done.
    const ranged = point.window.since === widest.since ? point.window.done : 0
    const inStore =
      stored === null
        ? 0
        : (
            await store.mail.emailRefs({ accountId: stored.id, mailbox: folder, since: Date.parse(widest.since) })
          ).filter(({ deleted }) => !deleted).length
    folders.push({
      folder,
      since: widest.since,
      done: Math.min(widest.total, Math.max(ranged, inStore)),
      total: widest.total,
      ...(point.last === undefined ? {} : { last: point.last }),
      fullAt: point.full.at,
      updatedAt: point.updatedAt,
    })
  }
  const file = parsePoint<MboxPoint>((await store.sync.syncState(key, MBOX_RESUME))?.value)
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

const day = (iso: string): string => iso.slice(0, 10)
const minute = (iso: string): string => `${iso.slice(0, 16).replace("T", " ")} UTC`

export const statusText = (status: MailStatus): string =>
  [
    progressLine(status.progress),
    `${status.stored} stored in full, ${status.envelopes} recorded as envelopes`,
    ...status.folders.flatMap(({ folder, since, done, total, last, fullAt }) => [
      `${folder}: since ${day(since)}, ${done} of ${total} stored; last whole listing ${minute(fullAt)}`,
      ...(last === undefined || last.since === since
        ? []
        : [`  last run, since ${day(last.since)} only: ${last.done} of ${last.total} done at ${minute(last.at)}`]),
    ]),
    ...(status.file === undefined
      ? []
      : [`file: ${status.file.size} bytes, ${status.file.complete ? "read to the end" : "partly read"}`]),
  ].join("\n")
