export interface Rename {
  from: string
  to: string
}

/**
 * Files that moved between two listings: a path gone from `before` whose content hash appears at a path
 * new in `after`. A hash shared by two gone or two new files names no single move, so it is left out —
 * a wrong guess would hand one note's links and tags to another.
 */
export const detectRenames = (before: Record<string, string>, after: Record<string, string>): Rename[] => {
  const byHash = (paths: string[], hashes: Record<string, string>) => {
    const grouped = new Map<string, string[]>()
    for (const path of paths) {
      const hash = hashes[path] as string
      grouped.set(hash, [...(grouped.get(hash) ?? []), path])
    }
    return grouped
  }
  const gone = byHash(
    Object.keys(before).filter((path) => !(path in after)),
    before,
  )
  const added = byHash(
    Object.keys(after).filter((path) => !(path in before)),
    after,
  )
  return [...gone]
    .flatMap(([hash, from]) => {
      const to = added.get(hash)
      return from.length === 1 && to?.length === 1 ? [{ from: from[0] as string, to: to[0] as string }] : []
    })
    .sort((a, b) => a.from.localeCompare(b.from))
}
