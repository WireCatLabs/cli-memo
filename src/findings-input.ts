import { createReadStream } from "node:fs"
import { readBatchInput } from "@wirecat/cli-base"

export const FINDINGS_INPUT_HELP =
  "the findings JSON itself (starts with {), a JSON file, or - for stdin; at most 65536 UTF-8 bytes"

/**
 * A scheduled agent under Claude Code's dontAsk mode is refused a heredoc or a pipe it builds around real mail
 * text, and must never write mail to a file, so the JSON may come as the argument itself (BUG-534).
 */
export const readFindingsInput = (input: string, stdin: AsyncIterable<string | Uint8Array>): Promise<string> => {
  if (input.trimStart().startsWith("{")) return Promise.resolve(input)
  return readBatchInput(input === "-" ? stdin : createReadStream(input))
}
