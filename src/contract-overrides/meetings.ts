import type { SharedContractOverride } from "@wirecat/cli-base/commands"

const REASON =
  "Memo reads stored records of every account. Its list and show give one row per real meeting for WireCat Desktop's Meetings page: a calendar event joined with its Zoom or Meet record, phone calls included, as meeting_entry with event: and meeting: refs, a native query and a 50-row page. Transcript, summary, export, people, sync, import and repair stay with the provider CLIs, which read one account."

// Reviewed differences from Core; update only after reviewing both definitions. memo's list and show read every
// account's meetings, calls and calendar events as one row per real meeting, for WireCat Desktop's Meetings page,
// not one provider account's meetings as Core's do.
export const meetings: readonly SharedContractOverride[] = [
  {
    command: ["meetings"],
    field: "description",
    before: "stored meetings and their records",
    after: "stored meeting evidence and reviewed findings",
    reason: REASON,
  },
  {
    command: ["meetings"],
    field: "effects",
    before: {
      remote: "none",
      local: "none",
    },
    after: null,
    reason: REASON,
  },
  {
    command: ["meetings"],
    field: "children",
    before: ["list", "show", "transcript", "summary", "export", "people", "sync", "import", "repair"],
    after: ["list", "show"],
    reason: REASON,
  },
  {
    command: ["meetings", "list"],
    field: "description",
    before: "meetings, newest first: the service's and the stored ones, kept in the store",
    after: "meetings, calls and calendar events of every account as one row per real meeting, latest start first",
    reason: REASON,
  },
  {
    command: ["meetings", "list"],
    field: "effects",
    before: {
      remote: "read",
      local: "read",
    },
    after: {
      remote: "none",
      local: "read",
    },
    reason: REASON,
  },
  {
    command: ["meetings", "list"],
    field: "output",
    before: {
      entity: "meeting",
    },
    after: {
      entity: "meeting_entry",
    },
    reason: REASON,
  },
  {
    command: ["meetings", "list"],
    field: "query",
    before: {
      entity: "meeting",
      backend: "sql",
      fields: [
        {
          name: "id",
          type: "kw",
          operators: ["term", "phrase", "wildcard"],
          example: "id:12",
        },
        {
          name: "provider_id",
          type: "kw",
          operators: ["term", "phrase", "wildcard"],
          example: "provider_id:85746065432",
        },
        {
          name: "title",
          type: "kw",
          operators: ["term", "phrase", "wildcard"],
          example: "title:*standup*",
        },
        {
          name: "started_at",
          type: "time",
          operators: ["term", "range"],
          example: "started_at:[2026-10-01 TO 2026-10-31]",
        },
        {
          name: "ended_at",
          type: "time",
          operators: ["term", "range"],
          example: "ended_at>=7d",
        },
        {
          name: "duration_ms",
          type: "num",
          operators: ["term", "range"],
          example: "duration_ms>=3600000",
        },
        {
          name: "participants_count",
          type: "num",
          operators: ["term", "range"],
          example: "participants_count>5",
        },
        {
          name: "created_at",
          type: "time",
          operators: ["term", "range"],
          example: "created_at>=7d",
        },
        {
          name: "updated_at",
          type: "time",
          operators: ["term", "range"],
          example: "updated_at>=7d",
        },
      ],
    },
    after: {
      entity: "meeting_entry",
      backend: "native",
      fields: [
        {
          name: "text",
          type: "txt",
          operators: ["term", "phrase"],
          example: "text:standup",
          relation: "words its title holds, in any letter case; a bare word means text:",
          native: true,
        },
        {
          name: "started_at",
          type: "time",
          operators: ["term", "range"],
          example: "started_at:[2026-11-02 TO 2026-11-09}",
          relation: "rows that overlap this time; a week or a month for a calendar",
          native: true,
        },
        {
          name: "source",
          type: "kw",
          operators: ["term", "phrase"],
          example: 'source:"google-drive:ana@example.com"',
          relation: "one account, provider:account, or every account of a provider; repeat for several",
          native: true,
        },
        {
          name: "kind",
          type: "enum",
          operators: ["term"],
          example: "kind:call",
          values: ["meeting", "call", "event"],
          relation: "repeat for any of several",
          native: true,
        },
        {
          name: "person",
          type: "kw",
          operators: ["term", "phrase"],
          example: 'person:"person:12"',
          relation: "invited, took part, or was on the other end of a call, as person:<id>",
          native: true,
        },
        {
          name: "has_transcript",
          type: "bool",
          operators: ["term"],
          example: "has_transcript:true",
          relation: "whether one of its meetings has a transcript",
          native: true,
        },
      ],
    },
    reason: REASON,
  },
  {
    command: ["meetings", "list"],
    field: "options",
    before: [
      {
        flags: "--backend <archive|server|both>",
        description:
          "where to read: the store (archive), the service (server), or both, kept in the store (default: both)",
        takes_value: true,
        mandatory: false,
      },
      {
        flags: "--limit <n>",
        description: "meetings per page; the profile's defaults.limit when absent",
        takes_value: true,
        mandatory: false,
      },
      {
        flags: "--page <n>",
        description: "which page, starting at 1",
        takes_value: true,
        mandatory: false,
      },
    ],
    after: [
      {
        flags: "--limit <n>",
        description: "rows per page, 1–1000; a month for a calendar fits in 1000",
        takes_value: true,
        mandatory: false,
        default: 50,
      },
      {
        flags: "--page <n>",
        description: "which page, from 1",
        takes_value: true,
        mandatory: false,
        default: 1,
      },
      {
        flags: "--order <recent|start>",
        description: "recent: latest start first; start: oldest first, for a calendar window",
        takes_value: true,
        mandatory: false,
        default: "recent",
      },
      {
        flags: "--json",
        description: "print JSON; --json=ref,title keeps only those fields",
        takes_value: false,
        mandatory: false,
      },
    ],
    reason: REASON,
  },
  {
    command: ["meetings", "list"],
    field: "summary",
    before: null,
    after: "meetings, calls and events of every account",
    reason: REASON,
  },
  {
    command: ["meetings", "show"],
    field: "description",
    before: "show a meeting, read again from the service with its people, transcript and documents",
    after: "one meeting row: its people, transcript lines with times, summaries, findings, calendar text and documents",
    reason: REASON,
  },
  {
    command: ["meetings", "show"],
    field: "effects",
    before: {
      remote: "read",
      local: "read",
    },
    after: {
      remote: "none",
      local: "read",
    },
    reason: REASON,
  },
  {
    command: ["meetings", "show"],
    field: "partial",
    before: true,
    after: null,
    reason: REASON,
  },
  {
    command: ["meetings", "show"],
    field: "output",
    before: {
      entity: "meeting_details",
    },
    after: {
      entity: "meeting_entry_details",
    },
    reason: REASON,
  },
  {
    command: ["meetings", "show"],
    field: "arguments",
    before: [
      {
        name: "meeting",
        required: true,
        variadic: false,
        description: "the stored meeting's number, its meeting: ref, or the service's id (provider_id)",
      },
    ],
    after: [
      {
        name: "meeting",
        required: true,
        variadic: false,
        description: "event:<id> or meeting:<account>/<id>, from meetings list",
      },
    ],
    reason: REASON,
  },
  {
    command: ["meetings", "show"],
    field: "options",
    before: [
      {
        flags: "--backend <archive|server|both>",
        description:
          "where to read: the store (archive), the service (server), or both, kept in the store (default: both)",
        takes_value: true,
        mandatory: false,
      },
    ],
    after: [
      {
        flags: "--cursor <cursor>",
        description: "the transcript line to start at: where the last read ended",
        takes_value: true,
        mandatory: false,
        default: 0,
      },
      {
        flags: "--limit <n>",
        description: "transcript lines at most, 1–2000",
        takes_value: true,
        mandatory: false,
        default: 200,
      },
      {
        flags: "--json",
        description: "print JSON; --json=ref,transcript keeps only those fields",
        takes_value: false,
        mandatory: false,
      },
    ],
    reason: REASON,
  },
  {
    command: ["meetings", "show"],
    field: "summary",
    before: "show a meeting, read again from the service with its people, transcript and…",
    after: "one meeting with its transcript",
    reason: REASON,
  },
]
