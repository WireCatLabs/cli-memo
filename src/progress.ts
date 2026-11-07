const EVERY_MS = 500

export type ProgressUnit = "bytes" | "files"

/**
 * cli-core's `{"event":"progress","step":…}` stderr line, with counts a window can draw a bar by. Only with --json,
 * at most every half second but always the first and last, and never a note's name: these lines reach the desktop
 * app's logs.
 */
export const progressLine = (
  diagnostic: (line: string) => void,
  json: boolean,
  { step, unit, label }: { step: string; unit: ProgressUnit; label?: string },
): ((done: number, total: number) => void) => {
  let last = Number.NEGATIVE_INFINITY
  return (done, total) => {
    if (!json) return
    const now = Date.now()
    if (done !== total && now - last < EVERY_MS) return
    last = now
    diagnostic(
      JSON.stringify({ event: "progress", step, done, total, unit, ...(label === undefined ? {} : { label }) }),
    )
  }
}
