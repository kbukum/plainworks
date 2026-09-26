"use client"

// Presentation of the inspector's keyboard shortcut. A binding such as `"mod+shift+d"` is written
// once. `mod` fires on either ⌘ (Meta) or Ctrl, so the visible hint names the platform's usual
// key while `aria-keyshortcuts` lists both, the platform's first. The modifier names and aliases
// match the ones `useKeyboardShortcuts` binds.

interface ModifierNames {
  readonly apple: string
  readonly other: string
  readonly aria: (apple: boolean) => string
}

const META: ModifierNames = { apple: "⌘", other: "Meta", aria: () => "Meta" }
const ALT: ModifierNames = { apple: "⌥", other: "Alt", aria: () => "Alt" }
const CONTROL: ModifierNames = { apple: "⌃", other: "Ctrl", aria: () => "Control" }

const MODIFIERS: Readonly<Record<string, ModifierNames>> = {
  mod: { apple: "⌘", other: "Ctrl", aria: (primary) => (primary ? "Meta" : "Control") },
  shift: { apple: "⇧", other: "Shift", aria: () => "Shift" },
  alt: ALT,
  option: ALT,
  ctrl: CONTROL,
  control: CONTROL,
  meta: META,
  cmd: META,
  command: META,
}

function tokens(shortcut: string): string[] {
  return shortcut.split("+").map((part) => part.trim().toLowerCase())
}

/** `"mod+shift+d"` → `"⌘⇧D"` on Apple platforms, `"Ctrl+Shift+D"` elsewhere. */
export function shortcutHint(shortcut: string, apple: boolean): string {
  return tokens(shortcut)
    .map((token) => {
      const modifier = MODIFIERS[token]
      if (modifier === undefined) return token.toUpperCase()
      return apple ? modifier.apple : modifier.other
    })
    .join(apple ? "" : "+")
}

/** `"mod+shift+d"` → the `aria-keyshortcuts` value, e.g. `"Control+Shift+D Meta+Shift+D"`. */
export function shortcutAriaKeys(shortcut: string, apple: boolean): string {
  const parts = tokens(shortcut)
  const combo = (meta: boolean): string =>
    parts.map((token) => MODIFIERS[token]?.aria(meta) ?? token.toUpperCase()).join("+")
  if (!parts.includes("mod")) return combo(apple)
  return `${combo(apple)} ${combo(!apple)}`
}

interface UserAgentDataNavigator {
  readonly userAgentData?: { readonly platform: string }
}

/**
 * Whether the host platform uses ⌘ as its primary modifier. Prefers User-Agent Client Hints and
 * falls back to the user-agent string where they are not shipped (Safari, Firefox).
 */
export function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false
  const hinted = (navigator as UserAgentDataNavigator).userAgentData?.platform
  return /mac|iphone|ipad|ios/i.test(hinted ?? navigator.userAgent)
}
