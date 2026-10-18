import { CliError } from "@wirecat/cli-base"
import type { TagConsolidationOptions } from "@wirecat/cli-core/store"

export interface TagInspectionInput {
  source: string
  survivor: string
  fingerprint: string
  maxRows?: number
  maxReadBytes?: number
  limit?: number
}

export const tagInspectionOptions = (input: TagInspectionInput): TagConsolidationOptions => {
  const id = (reference: string, field: string) => {
    const match = reference.match(/^tag:([1-9]\d*)$/)
    if (!match || !Number.isSafeInteger(Number(match[1])))
      throw new CliError("validation_error", `${field} must be tag:<id> from vocabulary list`)
    return match[1] as string
  }
  return {
    sourceId: id(input.source, "source"),
    survivorId: id(input.survivor, "survivor"),
    expectedVocabularyFingerprint: input.fingerprint,
    ...(input.maxRows === undefined ? {} : { maxRows: input.maxRows }),
    ...(input.maxReadBytes === undefined ? {} : { maxReadBytes: input.maxReadBytes }),
    ...(input.limit === undefined ? {} : { sampleLimit: input.limit }),
  }
}
