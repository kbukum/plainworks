"use client"

import { Spinner as SpinnerAtom } from "@plainworks/elements/spinner"
import {
  createToastManager,
  Toast,
  ToastAction,
  ToastClose,
  ToastContent,
  ToastDescription,
  ToastPortal,
  ToastProvider as ToastRoot,
  ToastTitle,
  ToastViewport,
  useToastManager,
} from "@plainworks/elements/toast"
import { PlainError, type PlainErrorOptions } from "@plainworks/std"
import { cn } from "@plainworks/theme"
import {
  createContext,
  type ReactElement,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from "react"

/** Typed error raised when {@link useToast} runs outside a {@link ToastProvider}. */
export class ToastError extends PlainError<"toast/missing-provider"> {
  override readonly name: string = "ToastError"
  constructor(message: string, options?: PlainErrorOptions) {
    super("toast/missing-provider", message, options)
  }
}

/** The kinds of feedback a toast carries; each maps to an optional icon. */
export type ToastTone = "success" | "error" | "info" | "warning" | "loading"

/** A raised message: a short title plus optional supporting text. A string is the title alone. */
export type ToastMessage = string | { readonly title: string; readonly description?: string }

/** The messages a promise toast shows while it is pending, when it resolves, and when it rejects. */
export interface ToastPromiseMessages<T> {
  readonly loading: ToastMessage
  readonly success: ToastMessage | ((value: T) => ToastMessage)
  readonly error: ToastMessage | ((cause: unknown) => ToastMessage)
}

/** The typed feedback API a surface raises through {@link useToast}. Each call returns the toast id. */
export interface ToastApi {
  readonly success: (message: ToastMessage) => string
  readonly error: (message: ToastMessage) => string
  readonly info: (message: ToastMessage) => string
  readonly warning: (message: ToastMessage) => string
  /** Show a loading toast that settles into the success or error message; returns `promise`. */
  readonly promise: <T>(promise: Promise<T>, messages: ToastPromiseMessages<T>) => Promise<T>
  /** Close one toast, or every toast when `id` is omitted. */
  readonly dismiss: (id?: string) => void
}

/** The accessible names the toast host renders. */
export interface ToastLabels {
  /** The landmark name of the toast region. */
  readonly region: string
  /** The name of each toast's close button. */
  readonly close: string
}

export const defaultToastLabels: ToastLabels = {
  region: "Notifications",
  close: "Dismiss notification",
}

/** Props for {@link ToastProvider}. */
export interface ToastProviderProps {
  readonly children: ReactNode
  readonly labels?: Partial<ToastLabels>
  /** Icons per tone. `loading` defaults to the spinner; the others render none unless given. */
  readonly icons?: Partial<Record<ToastTone, ReactNode>>
  /** The most toasts shown at once; older ones are hidden until newer ones close. Defaults to 3. */
  readonly limit?: number
  /** Milliseconds before a toast closes itself. Defaults to 5000; `0` keeps it open. */
  readonly timeout?: number
  /** Extra classes for the fixed viewport, e.g. to clear fixed chrome at the screen edge. */
  readonly viewportClassName?: string
}

const ToastContext = createContext<ToastApi | null>(null)

type ToastManager = ReturnType<typeof createToastManager>

function toastFields(message: ToastMessage): { title: string; description?: string } {
  return typeof message === "string" ? { title: message } : message
}

function toastApiFor(manager: ToastManager): ToastApi {
  const raise =
    (type: ToastTone) =>
    (message: ToastMessage): string =>
      manager.add({ ...toastFields(message), type })
  return {
    success: raise("success"),
    error: raise("error"),
    info: raise("info"),
    warning: raise("warning"),
    promise: (promise, messages) =>
      manager.promise(promise, {
        loading: { ...toastFields(messages.loading), type: "loading" },
        success: (value) => ({
          ...toastFields(
            typeof messages.success === "function" ? messages.success(value) : messages.success,
          ),
          type: "success",
        }),
        error: (cause: unknown) => ({
          ...toastFields(
            typeof messages.error === "function" ? messages.error(cause) : messages.error,
          ),
          type: "error",
        }),
      }),
    dismiss: (id) => manager.close(id),
  }
}

function isToastTone(type: string | undefined): type is ToastTone {
  return (
    type === "success" ||
    type === "error" ||
    type === "info" ||
    type === "warning" ||
    type === "loading"
  )
}

function ToastIcon({
  type,
  icons,
}: {
  readonly type: string | undefined
  readonly icons: Partial<Record<ToastTone, ReactNode>>
}): ReactElement | null {
  if (!isToastTone(type)) return null
  const icon = icons[type] ?? (type === "loading" ? <SpinnerAtom aria-hidden="true" /> : null)
  if (icon === null) return null
  return (
    <span
      data-slot="toast-icon"
      aria-hidden="true"
      className="shrink-0 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4"
    >
      {icon}
    </span>
  )
}

function ToastList({
  labels,
  icons,
}: {
  readonly labels: ToastLabels
  readonly icons: Partial<Record<ToastTone, ReactNode>>
}): ReactNode {
  const { toasts } = useToastManager()
  return toasts.map((item) => (
    <Toast key={item.id} toast={item}>
      <ToastContent>
        <ToastIcon type={item.type} icons={icons} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <ToastTitle />
          <ToastDescription />
        </div>
        <ToastAction />
        <ToastClose aria-label={labels.close} />
      </ToastContent>
    </Toast>
  ))
}

/**
 * Mounts one toast region for an app and exposes a typed {@link ToastApi} through
 * {@link useToast}. Each provider builds its own toast manager, so two providers, or two server
 * requests, never share a queue. The upstream atom's module-level default manager is never used.
 */
export function ToastProvider({
  children,
  labels,
  icons = {},
  limit = 3,
  timeout = 5000,
  viewportClassName,
}: ToastProviderProps): ReactElement {
  const [manager] = useState(createToastManager)
  const api = useMemo(() => toastApiFor(manager), [manager])
  const resolved: ToastLabels = { ...defaultToastLabels, ...labels }

  return (
    <ToastRoot toastManager={manager} limit={limit} timeout={timeout}>
      <ToastContext.Provider value={api}>{children}</ToastContext.Provider>
      <ToastPortal>
        <ToastViewport aria-label={resolved.region} className={cn(viewportClassName)}>
          <ToastList labels={resolved} icons={icons} />
        </ToastViewport>
      </ToastPortal>
    </ToastRoot>
  )
}

/** Read the toast API of the nearest {@link ToastProvider}; throws outside one. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (api === null) {
    throw new ToastError("useToast must be used inside <ToastProvider>.")
  }
  return api
}
