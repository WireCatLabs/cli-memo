/** A bare day in front matter is that day's midnight where the owner is, as a calendar app reads it. */
const BARE_DAY = /^(\d{4})-(\d{2})-(\d{2})$/

const frontMatterTime = (frontMatter: unknown): number | undefined => {
  const value = (frontMatter as { date?: unknown } | null | undefined)?.date
  if (value instanceof Date) return value.getTime()
  if (typeof value !== "string") return undefined
  const day = BARE_DAY.exec(value.trim())
  const time = day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])).getTime() : Date.parse(value)
  return Number.isFinite(time) ? time : undefined
}

/** When a note file is dated: its front matter `date`, else the file's modification time — never the import. */
export const noteFileTime = (frontMatter: unknown, mtimeMs: number): string =>
  new Date(frontMatterTime(frontMatter) ?? mtimeMs).toISOString()
