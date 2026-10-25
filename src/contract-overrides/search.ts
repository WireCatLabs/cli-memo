import type { SharedContractOverride } from "@wirecat/cli-base/commands"

// Reviewed differences from Core; update only after reviewing both definitions.
export const search: readonly SharedContractOverride[] = [
  {
    command: ["search"],
    field: "summary",
    before: "search the local archive",
    after: null,
    reason:
      "Memo searches imported accounts, mail and native notes without a live messenger; its scope, ranking and output controls are explicit provider differences.",
  },
  {
    command: ["search"],
    field: "description",
    before:
      "find things by text: one resource when you know it (messages, notes), or search all across messages and notes; for mail, the separate memo CLI: memo search mail",
    after: "search messages, mail, notes, memories and people; search all when unsure where",
    reason:
      "Memo searches imported accounts, mail and native notes without a live messenger; its scope, ranking and output controls are explicit provider differences.",
  },
  {
    command: ["search"],
    field: "children",
    before: ["all", "messages", "notes", "conversations", "runs"],
    after: ["all", "messages", "notes"],
    reason:
      "Memo searches imported accounts, mail and native notes without a live messenger; its scope, ranking and output controls are explicit provider differences.",
  },
  {
    command: ["search", "all"],
    field: "summary",
    before: "search stored messages, notes and selected meeting transcripts",
    after: "messages, mail and notes ranked together",
    reason:
      "Memo searches imported accounts, mail and native notes without a live messenger; its scope, ranking and output controls are explicit provider differences.",
  },
  {
    command: ["search", "all"],
    field: "description",
    before:
      "search messenger messages and notes in the local store, and a meeting account's transcripts when --source names one — best match first; not mail (the separate memo CLI searches it: memo search mail), tasks, people, memories or projects. Use it when you do not know where something was written; search messages or notes reads one kind with all its fields",
    after:
      "messages, mail and notes ranked together; not people, memories, projects or decisions. A kind you know reads better with its own search, with all its fields",
    reason:
      "Memo searches imported accounts, mail and native notes without a live messenger; its scope, ranking and output controls are explicit provider differences.",
  },
  {
    command: ["search", "all"],
    field: "effects",
    before: {
      remote: "read",
      local: "read",
    },
    after: {
      remote: "none",
      local: "read",
    },
    reason:
      "Memo searches imported accounts, mail and native notes without a live messenger; its scope, ranking and output controls are explicit provider differences.",
  },
  {
    command: ["search", "all"],
    field: "examples",
    before: ["memo personal search all draft"],
    after: null,
    reason:
      "Memo searches imported accounts, mail and native notes without a live messenger; its scope, ranking and output controls are explicit provider differences.",
  },
  {
    command: ["search", "all"],
    field: "arguments",
    before: [
      {
        name: "query",
        required: true,
        variadic: true,
        description: 'strict Lucene query: words, "phrases", AND/OR/NOT, field groups and date ranges',
      },
    ],
    after: [
      {
        name: "query",
        required: true,
        variadic: true,
        description: "words, phrases, Boolean operators and field queries",
      },
    ],
    reason:
      "Memo searches imported accounts, mail and native notes without a live messenger; its scope, ranking and output controls are explicit provider differences.",
  },
  {
    command: ["search", "all"],
    field: "options",
    before: [
      {
        flags: "--only <resources>",
        description:
          "only these resources, separated by commas: messages, notes; meetings when --source names a meeting account",
        takes_value: true,
        mandatory: false,
      },
      {
        flags: "--source <accounts>",
        description:
          "only these accounts, separated by commas: provider:account as a hit shows it, a provider, a kind or group:<name>; each resource reads the ones of its kind, and meetings only when it names one",
        takes_value: true,
        mandatory: false,
      },
      {
        flags: "--max-meetings <n>",
        description:
          "how many of the meeting account's meetings to look through, newest first, or all for every one (default 100)",
        takes_value: true,
        mandatory: false,
      },
      {
        flags: "--limit <n>",
        description: "how many",
        takes_value: true,
        mandatory: false,
      },
      {
        flags: "--page <n>",
        description: "which page, starting at 1",
        takes_value: true,
        mandatory: false,
      },
      {
        flags: "--exact",
        description: "bare words and quotes match their exact form only, as exact:word does",
        takes_value: false,
        mandatory: false,
      },
      {
        flags: "--timezone <zone>",
        description: "the IANA timezone for calendar date boundaries",
        takes_value: true,
        mandatory: false,
      },
    ],
    after: [
      {
        flags: "--limit <n>",
        description: "most results, at most 100",
        takes_value: true,
        mandatory: false,
        default: 20,
      },
      {
        flags: "--exact",
        description: "words as written; skip meaning search",
        takes_value: false,
        mandatory: false,
      },
      {
        flags: "--timezone <zone>",
        description: "IANA timezone for calendar date boundaries",
        takes_value: true,
        mandatory: false,
      },
      {
        flags: "--json",
        description: "print JSON; --json=id,title keeps only those fields",
        takes_value: false,
        mandatory: false,
      },
      {
        flags: "--only <resources>",
        description: "messages,mail,notes, separated by commas",
        takes_value: true,
        mandatory: false,
      },
      {
        flags: "--plain-order",
        description: "best first by the words alone, without moving mail from suspicious senders down",
        takes_value: false,
        mandatory: false,
      },
      {
        flags: "--project <project>",
        description:
          "rank the key documents of this project (id, project:<id>, key, exact name or alias) first; nothing is left out",
        takes_value: true,
        mandatory: false,
      },
    ],
    reason:
      "Memo searches imported accounts, mail and native notes without a live messenger; its scope, ranking and output controls are explicit provider differences.",
  },
  {
    command: ["search", "messages"],
    field: "summary",
    before: "find messages by words and filters",
    after: null,
    reason:
      "Memo searches imported accounts, mail and native notes without a live messenger; its scope, ranking and output controls are explicit provider differences.",
  },
  {
    command: ["search", "messages"],
    field: "description",
    before:
      "search messenger messages in the local store — what was read, fetched or kept by serve; --discover searches the archive only",
    after: "stored messenger messages only",
    reason:
      "Memo searches imported accounts, mail and native notes without a live messenger; its scope, ranking and output controls are explicit provider differences.",
  },
  {
    command: ["search", "messages"],
    field: "effects",
    before: {
      remote: "read",
      local: "read",
    },
    after: {
      remote: "none",
      local: "read",
    },
    reason:
      "Memo searches imported accounts, mail and native notes without a live messenger; its scope, ranking and output controls are explicit provider differences.",
  },
  {
    command: ["search", "messages"],
    field: "examples",
    before: ["memo personal search messages draft --limit 10"],
    after: null,
    reason:
      "Memo searches imported accounts, mail and native notes without a live messenger; its scope, ranking and output controls are explicit provider differences.",
  },
  {
    command: ["search", "messages"],
    field: "arguments",
    before: [
      {
        name: "query",
        required: false,
        variadic: true,
        description:
          'strict Lucene query: words, "phrases", AND/OR/NOT, field groups and date ranges; with --saved, more words AND-ed to it',
      },
    ],
    after: [
      {
        name: "query",
        required: true,
        variadic: true,
        description: "words, phrases, Boolean operators and field queries",
      },
    ],
    reason:
      "Memo searches imported accounts, mail and native notes without a live messenger; its scope, ranking and output controls are explicit provider differences.",
  },
  {
    command: ["search", "messages"],
    field: "options",
    before: [
      {
        flags: "--thread",
        description: "the stored reply chain and replies instead of time neighbours; falls back when no graph exists",
        takes_value: false,
        mandatory: false,
      },
      {
        flags: "--thread-hops <n>",
        description: "at most this many links from the hit (default: 8)",
        takes_value: true,
        mandatory: false,
      },
      {
        flags: "--thread-messages <n>",
        description: "at most this many messages in each thread context (default: 50)",
        takes_value: true,
        mandatory: false,
      },
      {
        flags: "--thread-bytes <n>",
        description: "at most this many bytes of whole messages and links in each context (default: 65536)",
        takes_value: true,
        mandatory: false,
      },
      {
        flags: "--thread-within <duration>",
        description: "messages within this long either side of the hit (default: 1d)",
        takes_value: true,
        mandatory: false,
      },
      {
        flags: "--source <accounts>",
        description:
          "every account of this messenger held in the store; personal, bots or all — the same as in: in the query; or a list: group:work,telegram:Alice",
        takes_value: true,
        mandatory: false,
      },
      {
        flags: "--limit <n>",
        description: "how many",
        takes_value: true,
        mandatory: false,
      },
      {
        flags: "--page <n>",
        description: "which page, starting at 1",
        takes_value: true,
        mandatory: false,
      },
      {
        flags: "--newest",
        description: "newest first instead of best first",
        takes_value: false,
        mandatory: false,
      },
      {
        flags: "--exact",
        description:
          "bare words and quotes match their exact form only, as exact:word does; text: still matches every form",
        takes_value: false,
        mandatory: false,
      },
      {
        flags: "--context <n>",
        description: "messages before and after each hit; 2 in the terminal, 0 otherwise",
        takes_value: true,
        mandatory: false,
      },
      {
        flags: "--discover",
        description:
          "find partial lexical matches and eligible replies in the local archive; results are evidence, not confirmed answers",
        takes_value: false,
        mandatory: false,
      },
      {
        flags: "--timezone <zone>",
        description: "the IANA timezone for calendar date boundaries",
        takes_value: true,
        mandatory: false,
      },
      {
        flags: "--saved <name|id>",
        description: "run a saved search or an earlier run; options typed here replace its own",
        takes_value: true,
        mandatory: false,
      },
    ],
    after: [
      {
        flags: "--limit <n>",
        description: "most results, at most 100",
        takes_value: true,
        mandatory: false,
        default: 20,
      },
      {
        flags: "--exact",
        description: "words as written; skip meaning search",
        takes_value: false,
        mandatory: false,
      },
      {
        flags: "--timezone <zone>",
        description: "IANA timezone for calendar date boundaries",
        takes_value: true,
        mandatory: false,
      },
      {
        flags: "--json",
        description: "print JSON; --json=id,title keeps only those fields",
        takes_value: false,
        mandatory: false,
      },
      {
        flags: "--brief",
        description: "each message as reference, time, sender and excerpt only",
        takes_value: false,
        mandatory: false,
      },
      {
        flags: "--full",
        description: "each message with its whole text; --json still gives the excerpt",
        takes_value: false,
        mandatory: false,
      },
    ],
    reason:
      "Memo searches imported accounts, mail and native notes without a live messenger; its scope, ranking and output controls are explicit provider differences.",
  },
  {
    command: ["search", "notes"],
    field: "summary",
    before: "find stored notes by words and filters",
    after: null,
    reason:
      "Memo searches imported accounts, mail and native notes without a live messenger; its scope, ranking and output controls are explicit provider differences.",
  },
  {
    command: ["search", "notes"],
    field: "description",
    before:
      "search the notes — written in memo, or imported from a notes folder — by words and, with the local text model, by meaning; each hit says which found it and what it links to",
    after: "native notes by words and, with the local model, meaning",
    reason:
      "Memo searches imported accounts, mail and native notes without a live messenger; its scope, ranking and output controls are explicit provider differences.",
  },
  {
    command: ["search", "notes"],
    field: "examples",
    before: ["memo personal search notes draft --limit 10"],
    after: null,
    reason:
      "Memo searches imported accounts, mail and native notes without a live messenger; its scope, ranking and output controls are explicit provider differences.",
  },
  {
    command: ["search", "notes"],
    field: "arguments",
    before: [
      {
        name: "query",
        required: true,
        variadic: true,
        description:
          'strict Lucene query: words, "phrases", AND/OR/NOT, tag:, source:internal (written in memo) or source:file (from a notes folder) and date ranges',
      },
    ],
    after: [
      {
        name: "query",
        required: true,
        variadic: true,
        description: "words, phrases, Boolean operators and field queries",
      },
    ],
    reason:
      "Memo searches imported accounts, mail and native notes without a live messenger; its scope, ranking and output controls are explicit provider differences.",
  },
  {
    command: ["search", "notes"],
    field: "options",
    before: [
      {
        flags: "--source <accounts>",
        description:
          "only these notes accounts, separated by commas: notes:internal for notes written in memo, notes:<folder id> as a hit shows it, notes, documents or group:<name>",
        takes_value: true,
        mandatory: false,
      },
      {
        flags: "--filter <query>",
        description: "a query every hit must also match; it does not change the search by meaning",
        takes_value: true,
        mandatory: false,
      },
      {
        flags: "--limit <n>",
        description: "how many",
        takes_value: true,
        mandatory: false,
      },
      {
        flags: "--page <n>",
        description: "which page, starting at 1",
        takes_value: true,
        mandatory: false,
      },
      {
        flags: "--exact",
        description: "words as written only; meaning is not searched",
        takes_value: false,
        mandatory: false,
      },
      {
        flags: "--timezone <zone>",
        description: "the IANA timezone for calendar date boundaries",
        takes_value: true,
        mandatory: false,
      },
    ],
    after: [
      {
        flags: "--limit <n>",
        description: "most results, at most 100",
        takes_value: true,
        mandatory: false,
        default: 20,
      },
      {
        flags: "--exact",
        description: "words as written; skip meaning search",
        takes_value: false,
        mandatory: false,
      },
      {
        flags: "--timezone <zone>",
        description: "IANA timezone for calendar date boundaries",
        takes_value: true,
        mandatory: false,
      },
      {
        flags: "--json",
        description: "print JSON; --json=id,title keeps only those fields",
        takes_value: false,
        mandatory: false,
      },
      {
        flags: "--filter <query>",
        description: "another query every note must match",
        takes_value: true,
        mandatory: false,
      },
      {
        flags: "--source <accounts>",
        description:
          "only these notes accounts, separated by commas: notes:internal for notes written in memo, notes:<folder id> as a hit shows it, notes or group:<name>",
        takes_value: true,
        mandatory: false,
      },
      {
        flags: "--page <n>",
        description: "which page, from 1",
        takes_value: true,
        mandatory: false,
        default: 1,
      },
      {
        flags: "--project <project>",
        description:
          "rank the key documents of this project (id, project:<id>, key, exact name or alias) first, labelled key; nothing is left out",
        takes_value: true,
        mandatory: false,
      },
    ],
    reason:
      "Memo searches imported accounts, mail and native notes without a live messenger; its scope, ranking and output controls are explicit provider differences.",
  },
]
