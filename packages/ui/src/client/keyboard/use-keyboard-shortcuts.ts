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
  /**
   * When false, character-key shortcuts (see {@link isSingleKey}) stay quiet, so a user who types
   * by voice or with a switch can turn them off (WCAG 2.1.4). Defaults to true.
   */
  readonly singleKeys?: boolean
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

/**
 * Whether a combo is a character-key shortcut: one printable character with no Ctrl, ⌘, `mod` or
 * Alt (Shift is allowed, as in `"shift+?"`). Such shortcuts never fire while the user types in a
 * field and can be turned off; named keys such as `Escape` and modified combos are unaffected.
 */
export function isSingleKey(combo: string): boolean {
  const parsed = parseCombo(combo)
  return parsed.key.length === 1 && !parsed.ctrl && !parsed.meta && !parsed.mod && !parsed.alt
}

const EDITABLE =
  '[contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]'
const TEXT_ROLES = new Set(["textbox", "combobox", "searchbox", "spinbutton"])

/** Whether typing at this event's target enters text, so a character key belongs to it. */
function typingInto(event: KeyboardEvent): boolean {
  const target = event.composedPath()[0] ?? event.target
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable || target.closest(EDITABLE) !== null) return true
  if (target.matches("input, textarea, select")) return true
  const role = target.getAttribute("role")
  return role !== null && TEXT_ROLES.has(role)
}

function matches(event: KeyboardEvent, combo: Combo): boolean {
  if (combo.key.length === 1 && !combo.ctrl && !combo.meta && !combo.mod && !combo.alt) {
    // A character key is matched by the character it types: Shift (for `?`), AltGr (Ctrl+Alt) and
    // macOS Option (Option+5 types `[` on a German Mac) are how the layout produces it. Alt alone
    // with a letter or digit is a command elsewhere, and Ctrl or ⌘ alone always is.
    if (event.metaKey || (event.ctrlKey && !event.altKey)) return false
    if (event.altKey && !event.ctrlKey && /^[a-z0-9]$/.test(combo.key)) return false
    const typed = combo.shift && /^[a-z]$/.test(combo.key) ? combo.key.toUpperCase() : combo.key
    return event.key === typed
  }
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
 * mounted. Character-key shortcuts ({@link isSingleKey}) never fire while focus is in a text field,
 * on a held-down key, or after another handler took the event, and `singleKeys: false` turns them
 * off. `mod` matches either ⌘ (Meta) or Ctrl on any platform, so one binding covers macOS and
 * Windows/Linux without platform detection. A matched handler runs with the raw event so it can
 * `preventDefault`. The listener is owned by an effect and removed on unmount or when
 * `enabled`/`target` change; the shortcut map is read through a ref, so changing handlers between
 * renders never re-binds the listener or leaves a stale closure.
 */
export function useKeyboardShortcuts(
  shortcuts: Readonly<Record<string, ShortcutHandler>>,
  options: UseKeyboardShortcutsOptions = {},
): void {
  const { enabled = true, target, singleKeys = true } = options
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
      if (keyboardEvent.isComposing) return
      const characterAllowed =
        singleKeys &&
        !keyboardEvent.defaultPrevented &&
        !keyboardEvent.repeat &&
        !typingInto(keyboardEvent)
      for (const [combo, handler] of Object.entries(latest.current)) {
        if (isSingleKey(combo) && !characterAllowed) continue
        if (matches(keyboardEvent, parseCombo(combo))) handler(keyboardEvent)
      }
    }
    node.addEventListener("keydown", listener)
    return () => node.removeEventListener("keydown", listener)
  }, [enabled, target, singleKeys])
}
