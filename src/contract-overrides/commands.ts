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
        description: "one command path, for example: commands info; inspect other groups in separate calls",
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
    reason: "wcat binds discovery to its command-local JSON renderer and scoped stored-data document format.",
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
    reason: "wcat binds discovery to its command-local JSON renderer and scoped stored-data document format.",
  },
  {
    command: ["commands", "info"],
    field: "examples",
    before: ["wcat commands info commands"],
    after: ["wcat commands info --json"],
    reason: "wcat binds discovery to its command-local JSON renderer and scoped stored-data document format.",
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
    reason: "wcat binds discovery to its command-local JSON renderer and scoped stored-data document format.",
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
    reason: "wcat binds discovery to its command-local JSON renderer and scoped stored-data document format.",
  },
]
