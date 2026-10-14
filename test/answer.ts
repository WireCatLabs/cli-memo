import { answerSchema } from "@wirecat/cli-core/cli"
import * as v from "valibot"

/** A command's `--json`, checked against the standard envelope. */
export const envelopeOf = (text: string) => {
  const body = JSON.parse(text)
  v.parse(answerSchema(), body)
  return body
}

/** The envelope's one thing as itself, or the list whole. */
export const answerOf = (text: string) => {
  const body = envelopeOf(text)
  return "item" in body ? body.item : body
}
