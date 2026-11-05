import { createReadStream, statSync } from "node:fs"
import { CliError, readBatchInput } from "@wirecat/cli-base"

export const FINDINGS_INPUT_HELP =
  "the findings JSON itself (starts with {), a JSON file, or - for stdin; at most 65536 UTF-8 bytes"

/**
 * A scheduled agent under Claude Code's dontAsk mode is refused a heredoc or a pipe it builds around real mail
 * text, and must never write mail to a file, so the JSON may come as the argument itself (BUG-534).
 */
export const readFindingsInput = (input: string, stdin: AsyncIterable<string | Uint8Array>): Promise<string> => {
  if (input.trimStart().startsWith("{")) return Promise.resolve(input)
  if (input === "-") return readBatchInput(stdin)
  const file = statSync(input, { throwIfNoEntry: false })
  if (!file)
    throw new CliError("not_found", `no findings file ${input}: give the JSON itself, a file that exists, or -`, {
      reason: "findings.file-missing",
      path: input,
    })
  if (!file.isFile()) throw new CliError("validation_error", `${input} is not a file`, { path: input })
  return readBatchInput(createReadStream(input))
}
