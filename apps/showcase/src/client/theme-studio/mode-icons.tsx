import type { ThemeModeIcons } from "@plainworks/ui/theme"
import { Monitor, Moon, Sun } from "lucide-react"

/** The showcase's icons for the kit's color-mode controls, shared by the header and Settings. */
export const THEME_MODE_ICONS: ThemeModeIcons = {
  light: <Sun aria-hidden className="size-4" />,
  dark: <Moon aria-hidden className="size-4" />,
  system: <Monitor aria-hidden className="size-4" />,
}
