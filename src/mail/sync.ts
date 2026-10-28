import type { MailSource } from "@wirecat/cli-core/mail"
import {
  type MailAccount as CoreAccount,
  type MailSyncOptions,
  type MailSyncResult,
  syncMail,
} from "@wirecat/cli-core/mail"
import type { MessageStore } from "@wirecat/cli-core/store"
import { embedChanged, embedMailChunks, type NotesEmbedded } from "../notes/embed.js"
import { knownAges } from "./domain-age.js"

export type ImportResult = MailSyncResult

export type MailAccount = CoreAccount & { name?: string; embed?: boolean }

export type ImportOptions = Omit<MailSyncOptions, "account" | "ages" | "index"> & {
  store: MessageStore
  source: MailSource
  account: MailAccount
  env?: NodeJS.ProcessEnv
  embed?: boolean
  indexThreads?: typeof embedChanged
  embedMail?: typeof embedMailChunks
}

/** memo's mail import: core's sync with memo's embedding as the index step and its domain-age cache as `ages`. */
export const importMail = ({
  store,
  source,
  account,
  env,
  embed = false,
  indexThreads = embedChanged,
  embedMail = embedMailChunks,
  ...options
}: ImportOptions): Promise<ImportResult> => {
  const embedding = { embed: embed && account.embed !== false, ...(env === undefined ? {} : { env }) }
  return syncMail(source, store, {
    ...options,
    account,
    ...(env === undefined ? {} : { ages: knownAges(env) }),
    // Chats an earlier import saved as messages may still wait for vectors; the mail tables have their own.
    index: async (indexed, key): Promise<NotesEmbedded> => {
      const older = await indexThreads(indexed, key, [], embedding)
      const mail = await embedMail(indexed, embedding)
      return {
        ...older,
        chunks: older.chunks + mail.chunks,
        left: older.left || mail.left,
        ...(mail.notEmbedded === undefined ? {} : { notEmbedded: mail.notEmbedded }),
      }
    },
  })
}
