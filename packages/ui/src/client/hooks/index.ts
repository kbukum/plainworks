"use client"

// Re-export-only barrel for the client DOM hooks — the browser-only half of the behaviour
// foundation (media queries, clipboard, keyboard shortcuts). Every module carries `"use client"`,
// so this graph never enters the neutral `.` entry.
export type {
  Clipboard,
  ClipboardErrorKind,
  UseClipboardOptions,
} from "./use-clipboard"
export { ClipboardError, useClipboard } from "./use-clipboard"
export type { ShortcutHandler, UseKeyboardShortcutsOptions } from "./use-keyboard-shortcuts"
export { useKeyboardShortcuts } from "./use-keyboard-shortcuts"
export { useMediaQuery } from "./use-media-query"
