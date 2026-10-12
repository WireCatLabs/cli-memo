/**
 * The store's memory, fact and action lists answer an array of at most `cap` rows. One row more than asked says
 * whether more remain; asked for the whole cap, a full answer may have more, and says so.
 */
export const pageOf = async <T>(
  limit: number | undefined,
  read: (limit: number) => Promise<T[]>,
  { fallback = 100, cap = 500 }: { fallback?: number; cap?: number } = {},
): Promise<{ items: T[]; hasMore: boolean }> => {
  const wanted = Math.min(limit ?? fallback, cap)
  const rows = await read(Math.min(wanted + 1, cap))
  return { items: rows.slice(0, wanted), hasMore: rows.length > wanted || rows.length === cap }
}
