"use client"

import { buttonVariants } from "@plainworks/elements/button"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@plainworks/elements/command"
import { Kbd, KbdGroup } from "@plainworks/elements/kbd"
import { cn } from "@plainworks/theme"
import { useTheme } from "@plainworks/theme/client"
import { Moon, Search, Sun } from "lucide-react"
import { type ReactElement, useCallback, useEffect, useState } from "react"
import { SECTIONS } from "../../app/navigation"
import { useToast } from "../feedback"
import { useRouter } from "../router"

/**
 * The command palette — a single ⌘K (Ctrl-K) surface that navigates to every section and runs a
 * few real actions, built on the kit's focus-trapped `command` dialog atom. It owns its own open
 * state and the global hotkey, and also renders the header affordance that opens it, so the shell
 * only has to place one component. Nothing here is decorative: the shortcut hint mirrors a live key
 * binding, and every item performs its navigation or action and closes.
 */
export function CommandMenu(): ReactElement {
  const [open, setOpen] = useState(false)
  const { navigate } = useRouter()
  const { theme, setTheme, resolvedMode } = useTheme()
  const toast = useToast()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setOpen((previous) => !previous)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  // Every item closes the palette first, then performs its effect — so focus returns to the page
  // before navigation or a theme change lands.
  const run = useCallback((effect: () => void): void => {
    setOpen(false)
    effect()
  }, [])

  const nextMode = resolvedMode === "dark" ? "light" : "dark"
  const toggleTheme = (): void => {
    setOpen(false)
    void setTheme({ ...theme, mode: nextMode }).then(
      () => toast.info(`Switched to ${nextMode} mode`),
      () => toast.error(`Could not switch to ${nextMode} mode`),
    )
  }

  return (
    <>
      <button
        type="button"
        aria-label="Search sections and actions"
        onClick={() => setOpen(true)}
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "text-muted-foreground gap-2 sm:w-56 sm:justify-start",
        )}
      >
        <Search aria-hidden className="size-4 shrink-0" />
        <span className="sr-only sm:not-sr-only">Search</span>
        <KbdGroup aria-hidden className="ml-auto hidden sm:flex">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </KbdGroup>
      </button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Command menu"
        description="Search sections and run actions"
      >
        <Command label="Command menu">
          <CommandInput placeholder="Search sections and actions..." />
          <CommandList>
            <CommandEmpty>No matching commands.</CommandEmpty>
            <CommandGroup heading="Go to">
              {SECTIONS.map((section) => {
                const Icon = section.icon
                return (
                  <CommandItem
                    key={section.id}
                    value={`go ${section.label}`}
                    onSelect={() => run(() => navigate(section.path))}
                  >
                    <Icon aria-hidden className="size-4" />
                    {section.label}
                  </CommandItem>
                )
              })}
            </CommandGroup>
            <CommandGroup heading="Actions">
              <CommandItem value="toggle theme mode" onSelect={toggleTheme}>
                {nextMode === "dark" ? (
                  <Moon aria-hidden className="size-4" />
                ) : (
                  <Sun aria-hidden className="size-4" />
                )}
                Switch to {nextMode} mode
                <CommandShortcut>Theme</CommandShortcut>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  )
}
