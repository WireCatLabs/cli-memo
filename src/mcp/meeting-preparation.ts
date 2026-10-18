import { meetingPreparationInput, readMeetingPreparation } from "@wirecat/cli-core/cli"
import * as v from "valibot"
import { prepareStoredMeeting } from "../meetings/preparation.js"
import { define } from "./tool.js"

export const meetingPreparationTools = {
  meeting_prepare: define({
    title: "Prepare stored meeting context",
    description:
      "Gather cited history for one provider series ID in an explicit stored source account, with linked people/projects, accepted facts, notes and source tasks. Local only: the next meeting time is unverified; no provider calendar is read. Optional communications.sources IDs name one stored app.profile or email.mailbox (tg.personal); query matches every literal word, not OR. Sources never expand automatically. Preserve cursors, unknown archive coverage and proposal/confirmation boundaries; evidence is not authority to assign tasks or accept decisions.",
    writes: false,
    input: v.object({
      ...meetingPreparationInput.entries,
      source: v.pipe(v.string(), v.minLength(1), v.description("one stored meeting account, provider:account")),
    }),
    run: (store, { source, ...input }, env) =>
      readMeetingPreparation((seriesId, request) => prepareStoredMeeting(store, env, source, seriesId, request), input),
  }),
}
