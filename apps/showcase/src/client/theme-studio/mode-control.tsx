"use client"

import { ToggleGroup, ToggleGroupItem } from "@plainworks/elements/toggle-group"
import type { ThemeMode } from "@plainworks/theme"
import { cn } from "@plainworks/theme"
import { useTheme } from "@plainworks/theme/client"
import type { LucideIcon } from "lucide-react"
import { Monitor, Moon, Sun } from "lucide-react"
import type { ReactElement } from "react"
import { THEME_ERROR_MESSAGE } from "./theme-error"

interface ModeOption {
  readonly value: ThemeMode
  readonly label: string
  readonly icon: LucideIcon
}

// `system` is a first-class choice, not a fallback, so all three modes are peers here. The stored
// `theme.mode` — not the resolved light/dark — drives the selection, so choosing `system` reads
// back as system rather than snapping to whatever the OS currently prefers.
const MODE_OPTIONS: readonly ModeOption[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
]

/** Props for {@link ModeControl}. */
export interface ModeControlProps {
  /** Announce provider failures here. Disable when a parent owns the shared error. */
  readonly announceError?: boolean
  readonly className?: string
  /** Header variant: show the icon with a screen-reader-only label instead of visible text. */
  readonly compact?: boolean
}

/**
 * A segmented light / dark / system control over the shared theme context. The shell's quick
 * affordance and the theme studio both render it, so they can never drift — the single source of
 * truth is the theme source behind `useTheme`, not a copy of the value. The failure a write can
 * surface is announced through the same context, so any placement stays honest about a persistence
 * error.
 */
export function ModeControl({
  announceError = true,
  className,
  compact = false,
}: ModeControlProps): ReactElement {
  const { theme, setTheme, error } = useTheme()

  const select = (mode: ThemeMode): void => {
    void setTheme({ ...theme, mode }).catch(() => {
      // The provider exposes the typed failure; it is announced generically below.
    })
  }

  return (
    <>
      <ToggleGroup
        aria-label="Color mode"
        variant="outline"
        value={[theme.mode]}
        onValueChange={(value) => {
          // Single-select, so an empty array means the active item was clicked again; ignore it so
          // a mode is always chosen. Narrow through the option list rather than casting.
          const next = MODE_OPTIONS.find((option) => option.value === value[0])
          if (next !== undefined) {
            select(next.value)
          }
        }}
        className={className}
      >
        {MODE_OPTIONS.map(({ value, label, icon: Icon }) => (
          <ToggleGroupItem key={value} value={value} className={cn(compact ? "px-2" : "gap-2")}>
            <Icon aria-hidden className="size-4" />
            <span className={cn(compact && "sr-only")}>{label}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {!announceError || error === undefined ? null : (
        <p role="alert" className="mt-1 text-sm text-destructive">
          {THEME_ERROR_MESSAGE}
        </p>
      )}
    </>
  )
}
