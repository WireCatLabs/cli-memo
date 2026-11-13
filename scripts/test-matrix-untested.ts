const ANSWERED_WHILE_PARSING =
  "commander answers it while it reads the options, before any command runs, so the argv log cannot record it"

export const UNTESTED: { command: string; option?: string; reason: string }[] = [
  {
    command: "",
    option: "--version",
    reason: `${ANSWERED_WHILE_PARSING}; src/program.test.ts and scripts/smoke-bundle.ts check its output`,
  },
  {
    command: "",
    option: "--help-all",
    reason: `${ANSWERED_WHILE_PARSING}; src/program.test.ts checks its output`,
  },
]
