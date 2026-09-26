"use client"

import { buttonVariants } from "@plainworks/elements/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@plainworks/elements/dropdown-menu"
import { cn } from "@plainworks/theme"
import { useTheme } from "@plainworks/theme/client"
import type { ReactElement } from "react"
import {
  defaultThemeModeLabels,
  THEME_MODES,
  type ThemeModeIcons,
  type ThemeModeLabels,
  toThemeMode,
} from "./theme-mode-options"

/** Props for {@link ThemeModeMenu}. */
export interface ThemeModeMenuProps {
  /** Overrides for any subset of the copy. */
  readonly labels?: Partial<Omit<ThemeModeLabels, "error">>
  /** Per-mode icons. The trigger shows the stored mode's icon, or its label when none is given. */
  readonly icons?: ThemeModeIcons
  readonly className?: string
}

/**
 * A compact color-mode control for an app header: one button that opens a menu of light, dark, and
 * system. The trigger's name states the current choice ("Color mode: System"), so it reads the
 * same with or without an icon. It shows no inline error, because a header has no room for one:
 * render `useTheme().error` where the page announces status, or use `ThemeModeGroup` in settings.
 */
export function ThemeModeMenu({ labels, icons, className }: ThemeModeMenuProps): ReactElement {
  const copy = { ...defaultThemeModeLabels, ...labels }
  const { theme, setTheme } = useTheme()
  const icon = icons?.[theme.mode]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${copy.label}: ${copy[theme.mode]}`}
        className={cn(
          buttonVariants({ variant: "ghost", size: icon === undefined ? "sm" : "icon" }),
          className,
        )}
      >
        {icon ?? copy[theme.mode]}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{copy.label}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={theme.mode}
            onValueChange={(value) => {
              const mode = toThemeMode(value)
              if (mode !== undefined && mode !== theme.mode) {
                // The provider keeps the typed failure on `error`; the host announces it.
                setTheme({ ...theme, mode }).catch(() => undefined)
              }
            }}
          >
            {THEME_MODES.map((mode) => (
              <DropdownMenuRadioItem key={mode} value={mode} closeOnClick>
                {icons?.[mode]}
                {copy[mode]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
