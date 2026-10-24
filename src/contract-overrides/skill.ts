import type { SharedContractOverride } from "@wirecat/cli-base/commands"

// Reviewed differences from Core; update only after reviewing both definitions.
export const skill: readonly SharedContractOverride[] = [
  {
    command: ["skill", "show"],
    field: "effects",
    before: {
      remote: "none",
      local: "read",
    },
    after: {
      remote: "none",
      local: "none",
    },
    reason:
      "Memo installs its own stored-data instructions through its environment and prints the packaged primary skill without filesystem effects.",
  },
  {
    command: ["skill", "show"],
    field: "examples",
    before: ["memo skill show", "memo skill show follow-ups"],
    after: null,
    reason:
      "Memo installs its own stored-data instructions through its environment and prints the packaged primary skill without filesystem effects.",
  },
  {
    command: ["skill", "show"],
    field: "arguments",
    before: [
      {
        name: "name",
        required: false,
        variadic: false,
        description: "one of the skills shipped for a task: follow-ups, link-conversations",
      },
    ],
    after: [],
    reason:
      "Memo installs its own stored-data instructions through its environment and prints the packaged primary skill without filesystem effects.",
  },
  {
    command: ["skill", "install"],
    field: "examples",
    before: ["memo skill install --for agents"],
    after: null,
    reason:
      "Memo installs its own stored-data instructions through its environment and prints the packaged primary skill without filesystem effects.",
  },
]
