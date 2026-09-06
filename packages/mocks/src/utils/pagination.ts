/**
 * Pagination utilities
 */

/** Requested page parameters. */
export interface PaginationParams {
  /** 1-based page number. */
  page?: number
  /** Items per page. */
  pageSize?: number
  /** Alias for pageSize. */
  limit?: number
}

/** A page of items plus its metadata. */
export interface PaginationResult<T> {
  /** The current page of items. */
  data: T[]
  /** Pagination metadata. */
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

/** Slice `items` to the requested page and compute pagination metadata. */
export function paginate<T>(
  items: T[],
  { page = 1, pageSize, limit = 10 }: PaginationParams = {},
): PaginationResult<T> {
  const size = pageSize ?? limit
  const total = items.length
  const totalPages = Math.ceil(total / size)
  const start = (page - 1) * size
  const end = start + size

  return {
    data: items.slice(start, end),
    pagination: {
      page,
      pageSize: size,
      total,
      totalPages,
    },
  }
}
