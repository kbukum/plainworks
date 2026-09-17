import { isAbsentOr, isRecord } from "../guard"
import type { CursorInfo, CursorResult, Facets, PageInfo, PaginatedResult } from "./result"

/** Narrow an untrusted value to the offset {@link PageInfo} block, every field present and numeric. */
export function isPageInfo(value: unknown): value is PageInfo {
  return (
    isRecord(value) &&
    typeof value.page === "number" &&
    typeof value.pageSize === "number" &&
    typeof value.total === "number" &&
    typeof value.totalPages === "number"
  )
}

/** Narrow an untrusted value to the {@link CursorInfo} block; an exhausted cursor is `null`, never absent. */
export function isCursorInfo(value: unknown): value is CursorInfo {
  return (
    isRecord(value) &&
    typeof value.pageSize === "number" &&
    (typeof value.nextCursor === "string" || value.nextCursor === null) &&
    (typeof value.prevCursor === "string" || value.prevCursor === null)
  )
}

/** Narrow an untrusted value to the {@link Facets} block — per field, per value, a count. */
export function isFacets(value: unknown): value is Facets {
  return (
    isRecord(value) &&
    Object.values(value).every(
      (counts) =>
        isRecord(counts) && Object.values(counts).every((count) => typeof count === "number"),
    )
  )
}

/**
 * Narrow an untrusted response body to the offset {@link PaginatedResult} envelope: every row
 * satisfies `isRow`, the pagination block is complete, and a present `facets` block is well-formed.
 * The one envelope guard every consumer validates a list response with, so no caller re-implements
 * (and drifts on) the contract's own shape.
 */
export function isPaginatedResult<T>(
  value: unknown,
  isRow: (row: unknown) => row is T,
): value is PaginatedResult<T> {
  return (
    isRecord(value) &&
    Array.isArray(value.data) &&
    value.data.every(isRow) &&
    isPageInfo(value.pagination) &&
    isAbsentOr(value.facets, isFacets)
  )
}

/** Narrow an untrusted response body to the cursor {@link CursorResult} envelope, rows included. */
export function isCursorResult<T>(
  value: unknown,
  isRow: (row: unknown) => row is T,
): value is CursorResult<T> {
  return (
    isRecord(value) &&
    Array.isArray(value.data) &&
    value.data.every(isRow) &&
    isCursorInfo(value.pagination) &&
    isAbsentOr(value.facets, isFacets)
  )
}
