import { setTimeout } from "node:timers/promises"

/** Same size and pause as cli-core's mail sync: a short write lock per slice, and room for other CLIs between. */
export const SLICE_SIZE = 50
export const SLICE_PAUSE_MS = 100

export const slicesOf = <T>(items: readonly T[]): T[][] =>
  Array.from({ length: Math.ceil(items.length / SLICE_SIZE) }, (_, at) =>
    items.slice(at * SLICE_SIZE, (at + 1) * SLICE_SIZE),
  )

export const pause = (): Promise<void> => setTimeout(SLICE_PAUSE_MS)
