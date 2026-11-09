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

/**
 * The store's memory, fact and action lists answer an array of at most `cap` rows. One row more than asked says
 * whether more remain. Asked for the whole cap, a list without `--page` cannot tell and says more may remain; a paged
 * one reads one row past the page to know.
 */
export const pageOf = async <R, T = R>(
  command: string,
  limit: number | undefined,
  read: (limit: number, offset: number) => Promise<R[]>,
  { fallback = 100, cap = 500, page, args, shape = (rows) => rows as unknown as T[] }: Paging<R, T> = {},
) => {
  const wanted = Math.min(limit ?? fallback, cap)
  const offset = ((page ?? 1) - 1) * wanted
  const rows = await read(Math.min(wanted + 1, cap), offset)
  const full = rows.length === cap && wanted === cap
  const more = rows.length > wanted || (full && (page === undefined || (await read(1, offset + cap)).length > 0))
  return listAnswer(command, {
    items: await shape(rows.slice(0, wanted)),
    limit: wanted,
    has_more: more,
    ...(page === undefined ? {} : { page }),
    ...(args === undefined ? {} : { args }),
  })
}
