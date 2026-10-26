import type { SharedContractOverride } from "@wirecat/cli-base/commands"

const REASON =
  "Memo installs its own stored-data instructions through its environment, prints the packaged primary skill without filesystem effects, and takes --json on each skill command because it has no global one."

const JSON_OPTION = { flags: "--json", description: "print JSON", takes_value: false, mandatory: false }
const SHOW_FOR = {
  flags: "--for <agents>",
  description: "print the copy installed for these agents instead of this version's",
  takes_value: true,
  mandatory: false,
  choices: ["claude", "agents"],
}
const INSTALL_FOR = {
  flags: "--for <agents>",
  description: "which agents to install for",
  takes_value: true,
  mandatory: false,
  choices: ["claude", "agents", "hermes", "all"],
  default: "all",
}

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
    reason: REASON,
  },
  {
    command: ["skill", "show"],
    field: "examples",
    before: ["memo skill show", "memo skill show follow-ups"],
    after: null,
    reason: REASON,
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
    reason: REASON,
  },
  {
    command: ["skill", "install"],
    field: "examples",
    before: ["memo skill install --for agents"],
    after: null,
    reason: REASON,
  },
  {
    command: ["skill", "show"],
    field: "options",
    before: [SHOW_FOR],
    after: [SHOW_FOR, JSON_OPTION],
    reason: REASON,
  },
  {
    command: ["skill", "install"],
    field: "options",
    before: [INSTALL_FOR],
    after: [INSTALL_FOR, JSON_OPTION],
    reason: REASON,
  },
  {
    command: ["skill", "status"],
    field: "options",
    before: [],
    after: [JSON_OPTION],
    reason: REASON,
  },
]
