"use client"

import { useEffect, useRef } from "react"

/** A handler invoked when its key combination is pressed. */
export type ShortcutHandler = (event: KeyboardEvent) => void

/** Options for {@link useKeyboardShortcuts}. */
export interface UseKeyboardShortcutsOptions {
  /** When false the listener is not attached. Defaults to true. */
  readonly enabled?: boolean
  /** The event target to bind to, resolved on mount. Defaults to `window`. */
  readonly target?: () => EventTarget | null
}

interface Combo {
  readonly key: string
  readonly ctrl: boolean
  readonly meta: boolean
  readonly alt: boolean
  readonly shift: boolean
  // `mod` matches either the ⌘ (Meta) or Ctrl key, on every platform — no platform detection.
  readonly mod: boolean
}

function parseCombo(combo: string): Combo {
  const parts = combo
    .toLowerCase()
    .split("+")
    .map((part) => part.trim())
  let key = ""
  let ctrl = false
  let meta = false
  let alt = false
  let shift = false
  let mod = false
  for (const part of parts) {
    if (part === "ctrl" || part === "control") ctrl = true
    else if (part === "meta" || part === "cmd" || part === "command") meta = true
    else if (part === "mod") mod = true
    else if (part === "alt" || part === "option") alt = true
    else if (part === "shift") shift = true
    else key = part
  }
  return { key, ctrl, meta, alt, shift, mod }
}

function matches(event: KeyboardEvent, combo: Combo): boolean {
  if (event.key.toLowerCase() !== combo.key) return false
  if (combo.mod) {
    if (!(event.metaKey || event.ctrlKey)) return false
  } else if (event.metaKey !== combo.meta || event.ctrlKey !== combo.ctrl) {
    return false
  }
  return event.altKey === combo.alt && event.shiftKey === combo.shift
}

/**
 * Bind keyboard shortcuts (`"mod+k"`, `"shift+?"`, …) to a target for as long as the component is
 * mounted. `mod` matches either ⌘ (Meta) or Ctrl on any platform, so one binding covers macOS and
 * Windows/Linux without platform detection. A matched handler runs with the raw event so it can
 * `preventDefault`. The listener is owned by an effect and removed on unmount or when
 * `enabled`/`target` change; the shortcut map is read through a ref, so changing handlers between
 * renders never re-binds the listener or leaves a stale closure.
 */
export function useKeyboardShortcuts(
  shortcuts: Readonly<Record<string, ShortcutHandler>>,
  options: UseKeyboardShortcutsOptions = {},
): void {
  const { enabled = true, target } = options
  const latest = useRef(shortcuts)

  useEffect(() => {
    latest.current = shortcuts
  })

  useEffect(() => {
    if (!enabled) return
    const node = target?.() ?? (typeof window === "undefined" ? null : window)
    if (node === null) return

    const listener = (event: Event): void => {
      const keyboardEvent = event as KeyboardEvent
      for (const [combo, handler] of Object.entries(latest.current)) {
        if (matches(keyboardEvent, parseCombo(combo))) handler(keyboardEvent)
      }
    }
    node.addEventListener("keydown", listener)
    return () => node.removeEventListener("keydown", listener)
  }, [enabled, target])
}
