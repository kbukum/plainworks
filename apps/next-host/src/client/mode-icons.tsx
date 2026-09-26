"use client"

import type { ThemeModeIcons } from "@plainworks/ui/theme"
import { Monitor, Moon, Sun } from "lucide-react"

/** The icons the color-mode menu shows; the kit ships none, so the host picks its icon set. */
export const THEME_MODE_ICONS: ThemeModeIcons = {
  light: <Sun aria-hidden />,
  dark: <Moon aria-hidden />,
  system: <Monitor aria-hidden />,
}
