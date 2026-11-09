import type { SharedContractOverride } from "@wirecat/cli-base/commands"

const REASON =
  "Memo installs its own stored-data instructions through its environment, prints the packaged skills (morning-digest with the owner's brief from the store after it), and takes --json on each skill command because it has no global one."

const SHOW_DESCRIPTION =
  "print SKILL.md — `memo skill install` puts it where Claude Code, Codex, Gemini CLI and OpenClaw look for it, and where Hermes does on request; --for prints the copy already there"

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
    field: "description",
    before: SHOW_DESCRIPTION,
    after: `${SHOW_DESCRIPTION}; morning-digest ends with your brief from \`memo digest brief\` when you wrote one`,
    reason: REASON,
  },
  {
    command: ["skill", "show"],
    field: "examples",
    before: ["memo skill show"],
    after: null,
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
    command: ["skill", "show"],
    field: "arguments",
    before: [],
    after: [
      {
        name: "name",
        required: false,
        variadic: false,
        description:
          "one of the skills shipped for a task: search, projects, meetings, mail, proposals, money, mcp, vocabulary, mail-triage, morning-digest",
      },
    ],
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
