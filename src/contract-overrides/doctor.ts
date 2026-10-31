import type { SharedContractOverride } from "@wirecat/cli-base/commands"

// Reviewed differences from Core; update only after reviewing both definitions.
export const doctor: readonly SharedContractOverride[] = [
  {
    command: ["doctor"],
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
      "Memo diagnoses imported-data paths and stored account configuration without connecting to a messenger or querying a keyring.",
  },
  {
    command: ["doctor"],
    field: "runnable",
    before: true,
    after: null,
    reason:
      "Memo diagnoses imported-data paths and stored account configuration without connecting to a messenger or querying a keyring.",
  },
  {
    command: ["doctor"],
    field: "options",
    before: [
      {
        flags: "--online",
        description: "also connect once and read the account; sends nothing",
        takes_value: false,
        mandatory: false,
      },
    ],
    after: [
      {
        flags: "--json",
        description: "print JSON; --json=id,title keeps only those fields",
        takes_value: false,
        mandatory: false,
      },
    ],
    reason:
      "Memo diagnoses imported-data paths and stored account configuration without connecting to a messenger or querying a keyring.",
  },
  {
    command: ["doctor"],
    field: "children",
    before: ["reports"],
    after: [],
    reason:
      "Memo diagnoses imported-data paths and stored account configuration without connecting to a messenger or querying a keyring.",
  },
]
