import type { Body } from "@wirecat/cli-core/cli"
import type { MessageStore } from "@wirecat/cli-core/store"
import * as v from "valibot"

export interface MemoTool {
  title: string
  description: string
  writes: boolean
  input: v.StrictObjectSchema<v.ObjectEntries, undefined>
  run: (store: MessageStore, args: never, env: NodeJS.ProcessEnv) => Promise<Body>
}

/** Strict like cli-core's tools: a loose object drops an unknown argument, so a misspelled filter runs unfiltered. */
export const define = <S extends v.ObjectSchema<v.ObjectEntries, undefined>>(tool: {
  title: string
  description: string
  writes: boolean
  input: S
  run: (store: MessageStore, args: v.InferOutput<S>, env: NodeJS.ProcessEnv) => Promise<Body>
}): MemoTool => ({ ...tool, input: v.strictObject(tool.input.entries) }) as unknown as MemoTool
