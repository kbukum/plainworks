"use client"

import { AbortError } from "@plainworks/std/resilience"
import { useTheme } from "@plainworks/theme/client"
import { CommandPalette, type CommandPaletteGroup } from "@plainworks/ui/command/command-palette"
import { useToast } from "@plainworks/ui/feedback/toast"
import { Moon, Search, Sun } from "lucide-react"
import type { ReactElement } from "react"
import { SECTIONS } from "../../app/navigation"
import { useRouter } from "../router"

/**
 * The showcase's ⌘K palette: the kit `CommandPalette` fed with a jump to every section and a
 * theme-mode switch that confirms with a toast.
 */
export function CommandMenu(): ReactElement {
  const { navigate } = useRouter()
  const { theme, setTheme, resolvedMode } = useTheme()
  const toast = useToast()

  const nextMode = resolvedMode === "dark" ? "light" : "dark"
  const toggleTheme = (): void => {
    void setTheme({ ...theme, mode: nextMode }).then(
      () => toast.info(`Switched to ${nextMode} mode`),
      (error: unknown) => {
        // A newer switch replaced this one before it saved; that one reports its own outcome.
        if (!(error instanceof AbortError)) toast.error(`Could not switch to ${nextMode} mode`)
      },
    )
  }

  const groups: readonly CommandPaletteGroup[] = [
    {
      id: "go",
      heading: "Go to",
      items: SECTIONS.map((section) => {
        const Icon = section.icon
        return {
          id: `go-${section.id}`,
          label: section.label,
          icon: <Icon aria-hidden className="size-4" />,
          onSelect: () => navigate(section.path),
        }
      }),
    },
    {
      id: "actions",
      heading: "Actions",
      items: [
        {
          id: "toggle-theme-mode",
          label: `Switch to ${nextMode} mode`,
          keywords: ["theme", "mode"],
          icon:
            nextMode === "dark" ? (
              <Moon aria-hidden className="size-4" />
            ) : (
              <Sun aria-hidden className="size-4" />
            ),
          shortcut: "Theme",
          onSelect: toggleTheme,
        },
      ],
    },
  ]

  return (
    <CommandPalette
      groups={groups}
      labels={{ trigger: "Search sections and actions" }}
      icon={<Search aria-hidden className="size-4 shrink-0" />}
    />
  )
}
