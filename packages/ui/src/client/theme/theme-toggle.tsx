"use client"

import { Button } from "@plainworks/elements/button"
import { useTheme } from "@plainworks/theme/client"
import type { ReactElement } from "react"

export interface ThemeToggleProps {
  readonly className?: string
}

/** A ready-made light/dark switch that drives the theme source through `useTheme`. */
export function ThemeToggle({ className }: ThemeToggleProps): ReactElement {
  const { error, resolvedMode, theme, setTheme } = useTheme()
  // Derive the next mode and the pressed state from the *resolved* mode, so `system` under an OS
  // dark preference correctly reads as dark — clicking then writes an explicit light preference.
  const nextMode = resolvedMode === "dark" ? "light" : "dark"

  const toggle = async (): Promise<void> => {
    try {
      await setTheme({ ...theme, mode: nextMode })
    } catch {
      // The provider exposes the typed failure, announced generically below.
    }
  }

  return (
    <>
      <Button
        className={className}
        aria-pressed={resolvedMode === "dark"}
        onClick={() => void toggle()}
      >
        Use {nextMode} theme
      </Button>
      {error === undefined ? null : (
        <p role="alert" className="text-sm text-destructive">
          The theme could not be changed. Try again.
        </p>
      )}
    </>
  )
}
