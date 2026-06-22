import { useState } from 'react'

/**
 * Client-side pagination over an in-memory array.
 *
 * Usage:
 *   const { pageItems, page, setPage, pageCount, total, from, to } = usePagination(filtered, 8)
 *   {pageItems.map(...)}
 *   <Pagination page={page} pageCount={pageCount} from={from} to={to} total={total} onPage={setPage} />
 *
 * Reset to page 1 on filter/search changes from the calling component:
 *   useEffect(() => setPage(1), [statusFilter, searchQ])
 *
 * The returned `page` is clamped to the valid range, so the view stays sane even
 * if the underlying list shrinks (e.g. polling) while you're on a later page.
 */
export function usePagination(items, pageSize = 10) {
  const [page, setPage] = useState(1)
  const list = Array.isArray(items) ? items : []
  const total = list.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(Math.max(1, page), pageCount)
  const start = (current - 1) * pageSize
  const pageItems = list.slice(start, start + pageSize)
  return {
    page: current,
    setPage,
    pageCount,
    pageItems,
    total,
    pageSize,
    from: total === 0 ? 0 : start + 1,
    to: Math.min(start + pageSize, total),
  }
}
