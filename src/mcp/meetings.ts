import { validateMeetingChange } from "@wirecat/cli-core/meetings"
import { meetingHitSearchRequest, meetingSearchArguments } from "@wirecat/cli-core/meetings/cli"
import * as v from "valibot"
import { itemAnswer } from "../answer.js"
import { readStoredMeetingPassage, searchStoredMeetings } from "../meetings/read.js"
import { define } from "./tool.js"

/** A caller sends a time with any offset; answers carry UTC. */
const zonedTime = v.pipe(v.string(), v.isoTimestamp("an ISO 8601 time with a zone"))

const id = v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(Number.MAX_SAFE_INTEGER)))
const name = v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(200)))
const bound = (min: number, max: number) =>
  v.optional(v.pipe(v.number(), v.integer(), v.minValue(min), v.maxValue(max)))
const source = v.pipe(v.string(), v.minLength(1), v.description("one stored meeting account, provider:account"))
const time = (value: string | undefined) =>
  value === undefined ? undefined : Date.parse(validateMeetingChange({ startTime: value }, false).startTime as string)

export const meetingTools = {
  search_meetings: define({
    title: "Search meeting transcripts",
    description:
      "Find word passages in one explicitly selected stored meeting account. Project, tag and topic names/aliases select confirmed links; mentions alone do not establish membership. Participant filters select meetings, not who spoke. Updates the local text index, without a model or provider call. Read transcript hits with meeting_passage, then propose cited findings for review; coverage remains unknown for unarchived meetings.",
    writes: false,
    input: v.object({
      source,
      query: v.pipe(v.string(), v.minLength(1)),
      meeting_id: id,
      identity_id: id,
      person_id: id,
      event_id: id,
      series_id: id,
      project: name,
      tag: name,
      topic: name,
      since_time: v.optional(zonedTime),
      until_time: v.optional(zonedTime),
      limit: bound(1, 1000),
      cursor: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(1000))),
      max_read_bytes: bound(1, 67108864),
    }),
    run: async (store, args, env) => {
      const flags = {
        meetingId: args.meeting_id,
        identityId: args.identity_id,
        personId: args.person_id,
        eventId: args.event_id,
        seriesId: args.series_id,
        project: args.project,
        tag: args.tag,
        topic: args.topic,
        sinceTime: time(args.since_time),
        untilTime: time(args.until_time),
        limit: args.limit,
        cursor: args.cursor,
        maxReadBytes: args.max_read_bytes,
      }
      return searchStoredMeetings(
        store,
        env,
        args.source,
        args.query,
        meetingHitSearchRequest(args.query, flags),
        meetingSearchArguments(args.query, flags),
      )
    },
  }),
  meeting_passage: define({
    title: "Read a cited meeting passage",
    description:
      "Read a transcript cue reference from search_meetings with bounded surrounding cues, fingerprints, revision and coverage. Pass source for the same explicit account. Preserve unknown speakers and distinguish speaker labels from confirmed identities. Evidence can support proposed facts/tasks; it grants no permission to confirm them.",
    writes: false,
    input: v.object({
      source,
      reference: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
      before: bound(0, 999),
      after: bound(0, 999),
      bytes: bound(2, 4194304),
      max_read_bytes: bound(1, 67108864),
      expected_fingerprint: v.optional(v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/))),
    }),
    run: async (store, { source, reference, ...options }, env) =>
      itemAnswer(
        (await readStoredMeetingPassage(store, env, source, reference, { ...options, format: "json" })).packet,
      ),
  }),
}
