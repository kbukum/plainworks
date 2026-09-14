"use client"

import { PlainError } from "@plainworks/std"
import { useCallback, useEffect, useRef, useState } from "react"

/** Discriminant kinds for {@link ClipboardError}. */
export type ClipboardErrorKind = "clipboard/unavailable" | "clipboard/denied" | "clipboard/failed"

/**
 * Typed error raised when clipboard operations fail. Extends {@link PlainError} so callers can
 * reliably distinguish between an unavailable Clipboard API, denied permissions, and general write
 * failures while preserving the underlying `cause`.
 */
export class ClipboardError extends PlainError<ClipboardErrorKind> {}

/** Options for {@link useClipboard}. */
export interface UseClipboardOptions {
  /** How long the `copied` flag stays true before auto-resetting. Defaults to 2000ms. */
  readonly resetAfterMs?: number
}

/** Clipboard-copy state with a transient success flag and a typed failure. */
export interface Clipboard {
  readonly copied: boolean
  readonly error: ClipboardError | undefined
  readonly copy: (text: string) => Promise<void>
  readonly reset: () => void
}

function toClipboardError(cause: unknown): ClipboardError {
  if (cause instanceof ClipboardError) {
    return cause
  }
  const isErrorLike =
    typeof cause === "object" &&
    cause !== null &&
    "message" in cause &&
    typeof (cause as { message: unknown }).message === "string"

  if (isErrorLike) {
    const errorObj = cause as { name?: unknown; message: string }
    const name = typeof errorObj.name === "string" ? errorObj.name : ""
    const message = errorObj.message.length > 0 ? errorObj.message : "Clipboard write failed"

    if (
      name === "NotAllowedError" ||
      name === "SecurityError" ||
      /denied|permission/i.test(message)
    ) {
      return new ClipboardError("clipboard/denied", message, { cause })
    }
    return new ClipboardError("clipboard/failed", message, { cause })
  }

  const message = typeof cause === "string" ? cause : "Clipboard write failed"
  return new ClipboardError("clipboard/failed", message, { cause })
}

/**
 * Copy text to the async Clipboard API, exposing a transient `copied` flag and a typed `error` — a
 * write can reject when the document is not focused or permission is denied, and that failure is
 * surfaced (both via `error` state and by rejecting the returned Promise), never swallowed. The
 * auto-reset timer is owned by a ref and cleared on unmount. A `writeText` still in flight when the
 * component unmounts (or when a newer `copy` supersedes it) is ignored on completion, so no state
 * is set after unmount and no orphan timer is left running.
 */
export function useClipboard(options: UseClipboardOptions = {}): Clipboard {
  const resetAfterMs = options.resetAfterMs ?? 2000
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<ClipboardError | undefined>(undefined)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Ownership guards for late `writeText` completions: `mounted` drops on unmount, and each `copy`
  // takes the next `requestId` so only the newest in-flight write may commit its result.
  const mounted = useRef(true)
  const requestId = useRef(0)

  const clearTimer = useCallback(() => {
    if (timer.current !== undefined) {
      clearTimeout(timer.current)
      timer.current = undefined
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      clearTimer()
    }
  }, [clearTimer])

  const reset = useCallback(() => {
    clearTimer()
    requestId.current += 1
    setCopied(false)
    setError(undefined)
  }, [clearTimer])

  const copy = useCallback(
    async (text: string): Promise<void> => {
      clearTimer()
      requestId.current += 1
      const id = requestId.current
      const owns = (): boolean => mounted.current && id === requestId.current
      try {
        if (typeof navigator === "undefined" || navigator.clipboard === undefined) {
          throw new ClipboardError(
            "clipboard/unavailable",
            "Clipboard API is unavailable in this context",
          )
        }
        await navigator.clipboard.writeText(text)
        if (!owns()) return
        setCopied(true)
        setError(undefined)
        timer.current = setTimeout(() => setCopied(false), resetAfterMs)
      } catch (cause) {
        const err = toClipboardError(cause)
        if (owns()) {
          setCopied(false)
          setError(err)
        }
        throw err
      }
    },
    [clearTimer, resetAfterMs],
  )

  return { copied, error, copy, reset }
}
