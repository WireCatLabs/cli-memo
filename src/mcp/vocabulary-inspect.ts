import * as v from "valibot"
import { itemAnswer } from "../answer.js"
import { tagInspectionOptions } from "../vocabulary/inspection.js"
import { define } from "./tool.js"

const bounded = (maximum: number) => v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(maximum)))
const reference = v.pipe(v.string(), v.regex(/^tag:[1-9]\d*$/), v.maxLength(20))

export const vocabularyInspection = define({
  title: "Inspect duplicate tags",
  description:
    "Read-only consolidation preview for two explicit tag:<id> references from vocabulary_list. Pass its current unfiltered fingerprint. Counts selected assignments, overlapping targets/chats, aliases, automatic claims and links; sample limits do not limit counts. Coverage names four inspected tables, not historical text or a complete merge plan. Applies and merges nothing; apply_supported is false. No model is called.",
  writes: false,
  input: v.object({
    source: reference,
    survivor: reference,
    fingerprint: v.pipe(v.string(), v.regex(/^v1:all:all:[a-f0-9]{64}$/)),
    max_rows: bounded(20000),
    max_read_bytes: bounded(16777216),
    limit: bounded(100),
  }),
  run: async (store, { source, survivor, fingerprint, max_rows, max_read_bytes, limit }) =>
    itemAnswer(
      await store.knowledge.previewTagConsolidation(
        tagInspectionOptions({
          source,
          survivor,
          fingerprint,
          ...(max_rows === undefined ? {} : { maxRows: max_rows }),
          ...(max_read_bytes === undefined ? {} : { maxReadBytes: max_read_bytes }),
          ...(limit === undefined ? {} : { limit: limit }),
        }),
      ),
    ),
})
