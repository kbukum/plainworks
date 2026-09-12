"use client"

import { Component, type ComponentType, createElement, type ErrorInfo, type ReactNode } from "react"

/** Props the injected presentational fallback receives: the caught error and a reset callback. */
export interface ErrorFallbackProps {
  /** The error this boundary caught. */
  readonly error: Error
  /** Clear the boundary and re-render its children — wire a UI "Try again" control to this. */
  readonly reset: () => void
}

/**
 * The **presentational** half of the boundary, injected by the consumer. `app` owns only the
 * behavior (catch/reset/report); the visual fallback lives in `ui` (or the showcase) and is passed
 * in — so `app` stays `ui`-free and a heavy DOM fallback never gets hard-imported into the kernel.
 */
export type ErrorFallbackComponent = ComponentType<ErrorFallbackProps>

/** Props for {@link AppErrorBoundary}. */
export interface AppErrorBoundaryProps {
  /** The presentational fallback to render once an error is caught (injected, never imported). */
  readonly fallback: ErrorFallbackComponent
  /**
   * The **report** seam — invoked with the error and React's component stack when a render throws.
   * Wire telemetry/logging here; it never sees a token or payload the kit didn't hand it.
   */
  readonly onError?: (error: Error, info: ErrorInfo) => void
  /**
   * Invoked when the boundary resets (via the fallback's `reset` or a `resetKeys` change).
   * Wire it to the router so recovering also re-runs the failed route's loaders instead of
   * re-rendering the same broken state.
   */
  readonly onReset?: () => void
  /**
   * When any value here changes between renders, the boundary auto-resets. Pass the current route
   * key/location so navigating away from a broken screen clears the error without a manual retry.
   */
  readonly resetKeys?: readonly unknown[]
  readonly children: ReactNode
}

interface AppErrorBoundaryState {
  readonly error: Error | null
}

/**
 * A **host-neutral behavioral** error boundary (app-F4): it catches a render error, reports it
 * through an injected seam, and offers layered recovery — a `reset` handed to the injected fallback
 * plus `resetKeys` that auto-recover on navigation — while importing no `ui`. Nest one per level
 * (app / route / component) so a component failure never blanks the whole app. The presentational
 * fallback is injected, keeping the visual concern in `ui` and the behavior here.
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  override state: AppErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info)
  }

  override componentDidUpdate(previous: AppErrorBoundaryProps): void {
    if (this.state.error !== null && keysChanged(previous.resetKeys, this.props.resetKeys)) {
      this.reset()
    }
  }

  private readonly reset = (): void => {
    this.setState({ error: null })
    this.props.onReset?.()
  }

  override render(): ReactNode {
    const { error } = this.state
    if (error !== null) {
      return createElement(this.props.fallback, { error, reset: this.reset })
    }
    return this.props.children
  }
}

/** True when the two reset-key lists differ in length or any element by identity. */
function keysChanged(
  previous: readonly unknown[] | undefined,
  next: readonly unknown[] | undefined,
): boolean {
  if (previous === undefined || next === undefined) {
    return previous !== next
  }
  return (
    previous.length !== next.length || previous.some((key, index) => !Object.is(key, next[index]))
  )
}
