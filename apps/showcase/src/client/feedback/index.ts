"use client"

// Re-export-only barrel for the shared feedback concern — the app-wide toast host.
export type { ToastApi, ToastMessage, ToastProviderProps } from "./toast-host"
export { ToastProvider, useToast } from "./toast-host"
