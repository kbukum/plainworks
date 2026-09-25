"use client"

import type { ReactElement, ReactNode } from "react"
import type { AsyncStatus } from "../../region"

/** Props for {@link AsyncState}. */
export interface AsyncStateProps {
  /** Which view to show; derive it with `asyncStatus`. */
  readonly status: AsyncStatus
  /** The loading view, usually a `LoadingState`. */
  readonly loading: ReactNode
  /** The failure view, usually an `ErrorState` with a retry. */
  readonly error: ReactNode
  /** The empty view, usually an `EmptyState`. Omit when the region is never empty. */
  readonly empty?: ReactNode
  /** The content, shown once the read succeeds. */
  readonly children: ReactNode
}

/**
 * The gate an async region renders behind: exactly one of its loading, failure, empty, or ready
 * views, picked by `status`. Each view is injected, so a region keeps its own copy and placeholder
 * shape while every region follows the same order of states.
 */
export function AsyncState({
  status,
  loading,
  error,
  empty,
  children,
}: AsyncStateProps): ReactElement {
  if (status === "pending") return <>{loading}</>
  if (status === "error") return <>{error}</>
  if (status === "empty" && empty !== undefined) return <>{empty}</>
  return <>{children}</>
}
