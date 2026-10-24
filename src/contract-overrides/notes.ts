import type { SharedContractOverride } from "@wirecat/cli-base/commands"

// Reviewed differences from Core; update only after reviewing both definitions.
export const notes: readonly SharedContractOverride[] = [
  {
    command: ["notes"],
    field: "description",
    before: "notes kept in the shared store",
    after: "notes from your folders, and notes you write here",
    reason:
      "Memo supports native notes and imported files across stored subjects, with explicit subject, author and export options.",
  },
  {
    command: ["notes"],
    field: "effects",
    before: {
      remote: "none",
      local: "none",
    },
    after: null,
    reason:
      "Memo supports native notes and imported files across stored subjects, with explicit subject, author and export options.",
  },
  {
    command: ["notes"],
    field: "children",
    before: ["list", "show", "add", "edit", "remove"],
    after: ["show", "list", "add", "edit", "remove"],
    reason:
      "Memo supports native notes and imported files across stored subjects, with explicit subject, author and export options.",
  },
  {
    command: ["notes", "show"],
    field: "description",
    before: "show one note",
    after: "one note: its text, tags, what it links and what links it",
    reason:
      "Memo supports native notes and imported files across stored subjects, with explicit subject, author and export options.",
  },
  {
    command: ["notes", "show"],
    field: "arguments",
    before: [
      {
        name: "note",
        required: true,
        variadic: false,
        description: "stored note reference",
      },
    ],
    after: [
      {
        name: "note",
        required: true,
        variadic: false,
        description: "note:<id>, document:<id>, or a file in a configured folder",
      },
    ],
    reason:
      "Memo supports native notes and imported files across stored subjects, with explicit subject, author and export options.",
  },
  {
    command: ["notes", "show"],
    field: "options",
    before: [],
    after: [
      {
        flags: "--json",
        description: "print JSON; --json=id,title keeps only those fields",
        takes_value: false,
        mandatory: false,
      },
    ],
    reason:
      "Memo supports native notes and imported files across stored subjects, with explicit subject, author and export options.",
  },
  {
    command: ["notes", "list"],
    field: "description",
    before: "list stored notes",
    after: "notes, newest first",
    reason:
      "Memo supports native notes and imported files across stored subjects, with explicit subject, author and export options.",
  },
  {
    command: ["notes", "list"],
    field: "query",
    before: {
      entity: "note",
      backend: "native",
      fields: [
        {
          name: "ref",
          type: "ref",
          operators: ["term", "phrase"],
          example: 'ref:"note:42"',
        },
        {
          name: "kind",
          type: "enum",
          values: ["note", "document"],
          operators: ["term"],
          example: "kind:note",
        },
        {
          name: "provider",
          type: "kw",
          operators: ["term", "phrase", "wildcard"],
          example: "provider:abc",
        },
        {
          name: "account",
          type: "kw",
          operators: ["term", "phrase", "wildcard"],
          example: "account:abc",
        },
        {
          name: "url",
          type: "kw",
          operators: ["term", "phrase", "wildcard"],
          example: "url:abc",
        },
        {
          name: "id",
          type: "kw",
          operators: ["term", "phrase", "wildcard"],
          example: "id:abc",
        },
        {
          name: "source",
          type: "enum",
          values: ["file", "internal"],
          operators: ["term"],
          example: "source:file",
        },
        {
          name: "folder_id",
          type: "kw",
          operators: ["term", "phrase", "wildcard"],
          example: "folder_id:abc",
        },
        {
          name: "path",
          type: "kw",
          operators: ["term", "phrase", "wildcard"],
          example: "path:abc",
        },
        {
          name: "title",
          type: "kw",
          operators: ["term", "phrase", "wildcard"],
          example: "title:abc",
        },
        {
          name: "text",
          type: "kw",
          operators: ["term", "phrase", "wildcard"],
          example: "text:abc",
        },
        {
          name: "revision",
          type: "num",
          operators: ["term", "range"],
          example: "revision>0",
        },
        {
          name: "content_hash",
          type: "kw",
          operators: ["term", "phrase", "wildcard"],
          example: "content_hash:abc",
        },
        {
          name: "export_path",
          type: "kw",
          operators: ["term", "phrase", "wildcard"],
          example: "export_path:abc",
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
        {
          name: "deleted_at",
          type: "time",
          operators: ["term", "range"],
          example: "deleted_at>=7d",
        },
        {
          name: "tags",
          type: "kw",
          operators: ["term", "phrase", "wildcard"],
          example: "tags:abc",
        },
        {
          name: "excerpt",
          type: "kw",
          operators: ["term", "phrase", "wildcard"],
          example: "excerpt:abc",
        },
        {
          name: "found_by",
          type: "enum",
          values: ["title", "words", "meaning"],
          operators: ["term"],
          example: "found_by:title",
        },
      ],
    },
    after: {
      entity: "note",
      backend: "native",
      fields: [
        {
          name: "about",
          type: "ref",
          operators: ["term", "phrase"],
          example: 'about:"telegram:Kai Sample"',
          relation: "notes about it or linking it: <messenger>:<name or id> or a typed reference; stands alone",
          native: true,
        },
        {
          name: "source",
          type: "enum",
          operators: ["term"],
          example: "source:internal",
          values: ["file", "internal"],
          native: true,
        },
        {
          name: "text",
          type: "txt",
          operators: ["term", "phrase"],
          example: "text:budget",
          native: true,
        },
      ],
    },
    reason:
      "Memo supports native notes and imported files across stored subjects, with explicit subject, author and export options.",
  },
  {
    command: ["notes", "list"],
    field: "arguments",
    before: [
      {
        name: "query",
        required: false,
        variadic: true,
        description: "field:value terms; this list filters by none yet",
      },
    ],
    after: [
      {
        name: "query",
        required: false,
        variadic: true,
        description: "field:value terms that narrow the list — the fields are below",
      },
    ],
    reason:
      "Memo supports native notes and imported files across stored subjects, with explicit subject, author and export options.",
  },
  {
    command: ["notes", "list"],
    field: "options",
    before: [],
    after: [
      {
        flags: "--limit <n>",
        description: "most notes, at most 500",
        takes_value: true,
        mandatory: false,
        default: 20,
      },
      {
        flags: "--page <n>",
        description: "which page, from 1",
        takes_value: true,
        mandatory: false,
        default: 1,
      },
      {
        flags: "--json",
        description: "print JSON; --json=id,title keeps only those fields",
        takes_value: false,
        mandatory: false,
      },
    ],
    reason:
      "Memo supports native notes and imported files across stored subjects, with explicit subject, author and export options.",
  },
  {
    command: ["notes", "add"],
    field: "description",
    before: "write a note",
    after: "write a note of your own about messages, people, projects or other notes",
    reason:
      "Memo supports native notes and imported files across stored subjects, with explicit subject, author and export options.",
  },
  {
    command: ["notes", "add"],
    field: "arguments",
    before: [
      {
        name: "text",
        required: true,
        variadic: false,
        description: "note text",
      },
    ],
    after: [
      {
        name: "text",
        required: false,
        variadic: false,
        description: "the note; or --text, or --text-file",
      },
    ],
    reason:
      "Memo supports native notes and imported files across stored subjects, with explicit subject, author and export options.",
  },
  {
    command: ["notes", "add"],
    field: "options",
    before: [
      {
        flags: "--subject <ref>",
        description: "stored resource the note describes",
        takes_value: true,
        mandatory: false,
      },
    ],
    after: [
      {
        flags: "--text <text>",
        description: "the note",
        takes_value: true,
        mandatory: false,
      },
      {
        flags: "--text-file <path>",
        description: "read the note from a file; - reads stdin",
        takes_value: true,
        mandatory: false,
      },
      {
        flags: "--title <title>",
        description: "a title",
        takes_value: true,
        mandatory: false,
      },
      {
        flags: "--subject <ref>",
        description:
          "what it is about: <messenger>:<name or id>, msg:, chat:, person:, organization:, project:, task:, note:, document:, meeting:; repeat for more",
        takes_value: true,
        mandatory: false,
      },
      {
        flags: "--meeting <id>",
        description: "also about this meeting, by its store id, with --account",
        takes_value: true,
        mandatory: false,
      },
      {
        flags: "--account <account>",
        description:
          "the account of --meeting: the meeting account it acts as: provider:account, such as zoom:me@example.com",
        takes_value: true,
        mandatory: false,
      },
      {
        flags: "--export [dir]",
        description: "also write it as a file — to this folder, or notes.export.dir",
        takes_value: true,
        mandatory: false,
      },
      {
        flags: "--format <format>",
        description: "the file's format: obsidian, markdown",
        takes_value: true,
        mandatory: false,
      },
      {
        flags: "--json",
        description: "print JSON; --json=id,title keeps only those fields",
        takes_value: false,
        mandatory: false,
      },
    ],
    reason:
      "Memo supports native notes and imported files across stored subjects, with explicit subject, author and export options.",
  },
  {
    command: ["notes", "edit"],
    field: "description",
    before: "change a note",
    after: "change a note you wrote here; a file's note is edited in its file",
    reason:
      "Memo supports native notes and imported files across stored subjects, with explicit subject, author and export options.",
  },
  {
    command: ["notes", "edit"],
    field: "arguments",
    before: [
      {
        name: "note",
        required: true,
        variadic: false,
        description: "stored note reference",
      },
      {
        name: "text",
        required: true,
        variadic: false,
        description: "replacement text",
      },
    ],
    after: [
      {
        name: "id",
        required: true,
        variadic: false,
        description: "note:<id> or its id",
      },
    ],
    reason:
      "Memo supports native notes and imported files across stored subjects, with explicit subject, author and export options.",
  },
  {
    command: ["notes", "edit"],
    field: "options",
    before: [],
    after: [
      {
        flags: "--revision <n>",
        description: "its current revision, so an edit made meanwhile is not lost",
        takes_value: true,
        mandatory: true,
      },
      {
        flags: "--text <text>",
        description: "the new text",
        takes_value: true,
        mandatory: false,
      },
      {
        flags: "--text-file <path>",
        description: "read the new text from a file; - reads stdin",
        takes_value: true,
        mandatory: false,
      },
      {
        flags: "--export [dir]",
        description: "also rewrite its file — in this folder, or notes.export.dir",
        takes_value: true,
        mandatory: false,
      },
      {
        flags: "--format <format>",
        description: "the file's format: obsidian, markdown",
        takes_value: true,
        mandatory: false,
      },
      {
        flags: "--json",
        description: "print JSON; --json=id,title keeps only those fields",
        takes_value: false,
        mandatory: false,
      },
    ],
    reason:
      "Memo supports native notes and imported files across stored subjects, with explicit subject, author and export options.",
  },
  {
    command: ["notes", "remove"],
    field: "description",
    before: "remove a note",
    after: "delete a note you wrote here; a file it was exported to stays",
    reason:
      "Memo supports native notes and imported files across stored subjects, with explicit subject, author and export options.",
  },
  {
    command: ["notes", "remove"],
    field: "arguments",
    before: [
      {
        name: "note",
        required: true,
        variadic: false,
        description: "stored note reference",
      },
    ],
    after: [
      {
        name: "id",
        required: true,
        variadic: false,
        description: "note:<id> or its id",
      },
    ],
    reason:
      "Memo supports native notes and imported files across stored subjects, with explicit subject, author and export options.",
  },
  {
    command: ["notes", "remove"],
    field: "options",
    before: [],
    after: [
      {
        flags: "--json",
        description: "print JSON; --json=id,title keeps only those fields",
        takes_value: false,
        mandatory: false,
      },
    ],
    reason:
      "Memo supports native notes and imported files across stored subjects, with explicit subject, author and export options.",
  },
]
