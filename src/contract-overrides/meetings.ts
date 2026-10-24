import type { SharedContractOverride } from "@wirecat/cli-base/commands"

// Reviewed differences from Core; update only after reviewing both definitions.
export const meetings: readonly SharedContractOverride[] = [
  {
    command: ["meetings"],
    field: "description",
    before: "stored meetings and their records",
    after: "stored meeting evidence and reviewed findings",
    reason:
      "Memo exposes stored meeting evidence and preparation across explicitly named source accounts; provider import and sync commands are unsupported.",
  },
  {
    command: ["meetings"],
    field: "effects",
    before: {
      remote: "none",
      local: "none",
    },
    after: null,
    reason:
      "Memo exposes stored meeting evidence and preparation across explicitly named source accounts; provider import and sync commands are unsupported.",
  },
  {
    command: ["meetings"],
    field: "children",
    before: ["list", "show", "transcript", "summary", "export", "people", "sync", "import"],
    after: [],
    reason:
      "Memo exposes stored meeting evidence and preparation across explicitly named source accounts; provider import and sync commands are unsupported.",
  },
]
