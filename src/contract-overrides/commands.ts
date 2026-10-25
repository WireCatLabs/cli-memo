import type { SharedContractOverride } from "@wirecat/cli-base/commands"

// Reviewed differences from Core; update only after reviewing both definitions.
export const commands: readonly SharedContractOverride[] = [
  {
    command: ["commands"],
    field: "arguments",
    before: [
      {
        name: "path",
        required: false,
        variadic: true,
        description: "one command path, for example: search messages; inspect other groups in separate calls",
      },
    ],
    after: [
      {
        name: "path",
        required: false,
        variadic: true,
        description: "one command, such as tags add",
      },
    ],
    reason: "Memo binds discovery to its command-local JSON renderer and scoped stored-data document format.",
  },
  {
    command: ["commands"],
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
    reason: "Memo binds discovery to its command-local JSON renderer and scoped stored-data document format.",
  },
  {
    command: ["commands", "info"],
    field: "examples",
    before: ["memo commands info commands"],
    after: ["memo commands info --json"],
    reason: "Memo binds discovery to its command-local JSON renderer and scoped stored-data document format.",
  },
  {
    command: ["commands", "info"],
    field: "arguments",
    before: [
      {
        name: "path",
        required: false,
        variadic: true,
        description: "one command path; without one, export schemas, error reasons and explicit overrides",
      },
    ],
    after: [
      {
        name: "path",
        required: false,
        variadic: true,
        description: "one command path; without one, schemas, error reasons and explicit overrides",
      },
    ],
    reason: "Memo binds discovery to its command-local JSON renderer and scoped stored-data document format.",
  },
  {
    command: ["commands", "info"],
    field: "options",
    before: [],
    after: [
      {
        flags: "--json",
        description: "print JSON",
        takes_value: false,
        mandatory: false,
      },
    ],
    reason: "Memo binds discovery to its command-local JSON renderer and scoped stored-data document format.",
  },
]
