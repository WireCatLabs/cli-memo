import type { Body } from "@wirecat/cli-core/cli"
import type { MessageStore } from "@wirecat/cli-core/store"
import type * as v from "valibot"

export interface MemoTool {
  title: string
  description: string
  writes: boolean
  input: v.ObjectSchema<v.ObjectEntries, undefined>
  run: (store: MessageStore, args: never, env: NodeJS.ProcessEnv) => Promise<Body>
}

export const define = <S extends v.ObjectSchema<v.ObjectEntries, undefined>>(tool: {
  title: string
  description: string
  writes: boolean
  input: S
  run: (store: MessageStore, args: v.InferOutput<S>, env: NodeJS.ProcessEnv) => Promise<Body>
}): MemoTool => tool as unknown as MemoTool
