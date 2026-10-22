import { type MeetingHitSearchRequest, type MeetingPassageRequest, meetingHitsList } from "@wirecat/cli-core/meetings"
import { type MeetingSearchFlags, meetingSearchMeta } from "@wirecat/cli-core/meetings/cli"
import { readMeetingPassage, searchMeetingHits } from "@wirecat/cli-core/services"
import type { MessageStore } from "@wirecat/cli-core/store"
import { accountName, oneAccountOf } from "../store/source-list.js"

const account = async (store: MessageStore, env: NodeJS.ProcessEnv, source: string | undefined) => {
  const key = await oneAccountOf(store, env, source)
  return { key, held: await store.accounts.storedAccount(key) }
}

export const searchStoredMeetings = async (
  store: MessageStore,
  env: NodeJS.ProcessEnv,
  source: string | undefined,
  query: string,
  request: Omit<MeetingHitSearchRequest, "accountId">,
  args: Record<string, unknown>,
  flags: MeetingSearchFlags,
) => {
  const { key, held } = await account(store, env, source)
  const found = await searchMeetingHits(store, query, { ...request, accountId: held.id })
  const body = meetingHitsList(found, request.limit ?? 100, "search meetings", {
    ...args,
    limit: request.limit ?? 100,
    source: accountName(key),
  })
  return {
    ...body,
    missing: [
      ...(body.missing ?? []),
      {
        field: "archive_completeness",
        why: "Only stored, currently indexed meeting revisions were searched; archive and index completeness are unknown.",
      },
    ],
    meta: { accounts: [accountName(key)], ...meetingSearchMeta(flags) },
  }
}

export const readStoredMeetingPassage = async (
  store: MessageStore,
  env: NodeJS.ProcessEnv,
  source: string | undefined,
  reference: string,
  request: MeetingPassageRequest,
) => {
  const { held } = await account(store, env, source)
  return readMeetingPassage(store.meetings, held.id, reference, request)
}
