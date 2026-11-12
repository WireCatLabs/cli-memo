import { listAnswer } from "./answer.js"

interface Paging<R, T> {
  fallback?: number
  cap?: number
  /** From 1, for a list paged by `--page`; `read` must then skip `offset` rows. */
  page?: number
  /** The command's query, so `page.next` reruns the same list. */
  args?: Record<string, unknown>
  /** Turns the store's rows into items; it may drop some, so whether more remain is judged on the rows read. */
  shape?: (rows: R[]) => Promise<T[]> | T[]
}

/** One page of a store list, which says itself whether more rows remain. */
export const pageOf = async <R, T = R>(
  command: string,
  limit: number | undefined,
  read: (limit: number, offset: number) => Promise<{ items: R[]; hasMore: boolean }>,
  { fallback = 100, cap = 500, page, args, shape = (rows) => rows as unknown as T[] }: Paging<R, T> = {},
) => {
  const wanted = Math.min(limit ?? fallback, cap)
  const { items, hasMore } = await read(wanted, ((page ?? 1) - 1) * wanted)
  return listAnswer(command, {
    items: await shape(items),
    limit: wanted,
    has_more: hasMore,
    ...(page === undefined ? {} : { page }),
    ...(args === undefined ? {} : { args }),
  })
}
