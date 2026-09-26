"use client"

// Re-export-only barrel for the feedback composites: inline signals (spinner · callout) and the
// region states an async view moves through (loading · error · empty, gated by async state).
export type { AsyncStateProps } from "./async-state"
export { AsyncState } from "./async-state"
export type { CalloutProps, CalloutTone } from "./callout"
export { Callout } from "./callout"
export type { EmptyStateProps } from "./empty-state"
export { EmptyState } from "./empty-state"
export type { ErrorStateAction, ErrorStateProps } from "./error-state"
export { ErrorState } from "./error-state"
export type { LoadingStateProps } from "./loading-state"
export { LoadingState } from "./loading-state"
export type { SpinnerProps } from "./spinner"
export { Spinner } from "./spinner"
