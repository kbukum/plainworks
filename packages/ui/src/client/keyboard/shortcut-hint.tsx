"use client"

import { Kbd, KbdGroup } from "@plainworks/elements/kbd"
import type { ReactElement } from "react"

/** Options for {@link formatShortcut}. */
export interface FormatShortcutOptions {
  /** What `mod` reads as: `"⌘"` on Apple keyboards, `"Ctrl"` elsewhere. Defaults to `"⌘"`. */
  readonly mod?: string
}

const NAMED: Readonly<Record<string, string>> = {
  ctrl: "Ctrl",
  control: "Ctrl",
  meta: "⌘",
  cmd: "⌘",
  command: "⌘",
  alt: "Alt",
  option: "Alt",
  shift: "Shift",
  escape: "Esc",
  esc: "Esc",
  enter: "Enter",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
}

/**
 * The key caps for a combo in {@link useKeyboardShortcuts} syntax, such as `"mod+k"` →
 * `["⌘", "K"]`. Shift is left out before a symbol that already needs it, so `"shift+?"` reads as
 * `["?"]`.
 */
export function formatShortcut(combo: string, options: FormatShortcutOptions = {}): string[] {
  const parts = combo.split("+").map((part) => part.trim().toLowerCase())
  const key = parts.at(-1) ?? ""
  const symbol = key.length === 1 && key.toUpperCase() === key.toLowerCase()
  return parts.flatMap((part, index) => {
    if (index < parts.length - 1) {
      if (part === "shift" && symbol) return []
      if (part === "mod") return [options.mod ?? "⌘"]
      return [NAMED[part] ?? part]
    }
    return [NAMED[part] ?? (part.length === 1 ? part.toUpperCase() : part)]
  })
}

/** Props for {@link ShortcutHint}. */
export interface ShortcutHintProps extends FormatShortcutOptions {
  readonly combo: string
  /**
   * Hides the caps from assistive tech, for a hint beside a control that already names its
   * shortcut (for example through `aria-keyshortcuts`).
   */
  readonly decorative?: boolean
  readonly className?: string
}

/** A key combination shown as key caps. */
export function ShortcutHint({
  combo,
  mod,
  decorative = false,
  className,
}: ShortcutHintProps): ReactElement {
  return (
    <KbdGroup aria-hidden={decorative ? true : undefined} className={className}>
      {formatShortcut(combo, mod === undefined ? {} : { mod }).map((key, index) => (
        <Kbd key={index}>{key}</Kbd>
      ))}
    </KbdGroup>
  )
}
