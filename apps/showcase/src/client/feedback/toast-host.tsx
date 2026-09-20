"use client"

import { Toaster } from "@plainworks/elements/sonner"
import { createContext, type ReactElement, type ReactNode, useContext, useId, useMemo } from "react"
import { toast } from "sonner"

/** A raised message: a short title plus optional supporting body. */
export interface ToastMessage {
  readonly title: string
  readonly description?: string
}

/** The typed feedback API surfaces raise through {@link useToast} — never sonner's global directly. */
export interface ToastApi {
  readonly success: (message: ToastMessage | string) => void
  readonly error: (message: ToastMessage | string) => void
  readonly info: (message: ToastMessage | string) => void
}

type ToastKind = "success" | "error" | "info"

const ToastContext = createContext<ToastApi | null>(null)

function raise(kind: ToastKind, message: ToastMessage | string, toasterId: string): void {
  const { title, description } =
    typeof message === "string" ? { title: message, description: undefined } : message
  toast[kind](title, description === undefined ? { toasterId } : { description, toasterId })
}

/** Props for {@link ToastProvider}. */
export interface ToastProviderProps {
  readonly children: ReactNode
}

/**
 * Mounts the themed `Toaster` host once for the app and exposes a small typed {@link ToastApi}
 * through context, so any surface raises feedback with `useToast()` rather than reaching for
 * sonner's module global. The API is built per app instance — no module-level singleton — and the
 * host is the shadcn-synced atom, composed (not edited) with sonner's public `toast`.
 */
export function ToastProvider({ children }: ToastProviderProps): ReactElement {
  const toasterId = `showcase-toast-${useId()}`
  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => raise("success", message, toasterId),
      error: (message) => raise("error", message, toasterId),
      info: (message) => raise("info", message, toasterId),
    }),
    [toasterId],
  )
  return (
    <ToastContext.Provider value={api}>
      {children}
      <Toaster id={toasterId} />
    </ToastContext.Provider>
  )
}

/** Read the app toast API; throws when used outside {@link ToastProvider}. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (api === null) {
    throw new Error("useToast must be used inside <ToastProvider>.")
  }
  return api
}
