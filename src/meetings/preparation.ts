import { CliError } from "@wirecat/cli-base"
import { createUpcomingMeetingReader } from "@wirecat/cli-core/meetings"
import {
  type ContextSource,
  createMeetingPreparationService,
  entriesOfList,
  type MeetingPreparationRequest,
} from "@wirecat/cli-core/services"
import type { MessageStore } from "@wirecat/cli-core/store"
import { accountName, oneAccountOf } from "../store/source-list.js"

const communicationSource = async (store: MessageStore, env: NodeJS.ProcessEnv, id: string) => {
  const dot = id.indexOf(".")
  if (dot < 1 || dot === id.length - 1)
    throw new CliError("validation_error", "context source needs app.profile or email.mailbox, such as tg.personal", {
      param: "communications.sources",
    })
  const key = await oneAccountOf(store, env, `${id.slice(0, dot)}:${id.slice(dot + 1)}`, "--context-source")
  const held = await store.accounts.storedAccount(key)
  const listed = entriesOfList(accountName(key), {
    held: [held],
    profiles: {},
    groups: {},
    running: { provider: "email", command: "memo" },
  })[0]?.accounts[0]
  const kind = listed?.kind === "messages" ? "message" : listed?.kind === "mail" ? "mail" : undefined
  if (kind === undefined)
    throw new CliError("validation_error", `${id}: select one stored messenger profile or mailbox`, {
      param: "communications.sources",
    })
  return { id, source: { ...key, accountId: held.id, kind } satisfies ContextSource }
}

export const prepareStoredMeeting = async (
  store: MessageStore,
  env: NodeJS.ProcessEnv,
  source: string | undefined,
  seriesId: string,
  request: MeetingPreparationRequest,
) => {
  const key = await oneAccountOf(store, env, source)
  const held = await store.accounts.storedAccount(key)
  const selections = request.communications
    ? await Promise.all(request.communications.sources.map(({ id }) => communicationSource(store, env, id)))
    : undefined
  if (selections && !store.contextEvidence)
    throw new CliError("configuration_error", "Stored communications are unavailable in this store")
  const service = createMeetingPreparationService(key, held.id, {
    meetings: store.meetings,
    upcoming: createUpcomingMeetingReader(key, {
      read: async (meetingId) => ({
        meetingId,
        kind: "unknown",
        timezone: null,
        occurrences: [],
        complete: false,
        missing: ["schedule-details", "occurrence-details"],
      }),
    }),
    projectDiscovery: { vocabulary: store.knowledge, search: store.meetings },
    ...(selections && store.contextEvidence ? { communications: { selections, reader: store.contextEvidence } } : {}),
  })
  return service.prepare(seriesId, request)
}
