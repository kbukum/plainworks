"use client"

// Re-export-only barrel for the shared feedback concern — the app-wide toast host and the
// loading/error/empty gate every section renders its body behind.
export type { SectionEmpty, SectionStateProps } from "./section-state"
export { SectionState } from "./section-state"
export type { ToastApi, ToastMessage, ToastProviderProps } from "./toast-host"
export { ToastProvider, useToast } from "./toast-host"
