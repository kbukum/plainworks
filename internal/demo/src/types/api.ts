/**
 * Common API types
 */

/** Page metadata returned alongside a paginated list. */
export interface PaginationInfo {
  /** Current page (1-based). */
  page: number
  /** Items per page. */
  pageSize: number
  /** Total items across all pages. */
  total: number
  /** Total page count. */
  totalPages: number
}

/** A list response with pagination metadata. */
export interface PaginatedResponse<T> {
  /** The current page of items. */
  data: T[]
  /** Pagination metadata. */
  pagination: PaginationInfo
}

/** A structured API error payload. */
export interface ApiError {
  /** Human-readable error message. */
  message: string
  /** Machine-readable error code. */
  code?: string
  /** Additional structured detail. */
  details?: Record<string, unknown>
}

/** A single-resource response envelope. */
export interface ApiResponse<T> {
  /** The response payload. */
  data: T
  /** Error message when the request failed. */
  error?: string
  /** Informational message. */
  message?: string
}
