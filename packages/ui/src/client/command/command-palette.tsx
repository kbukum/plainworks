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
import type { ReactElement, ReactNode } from "react"
import { useControllableState } from "../../state/use-controllable-state"
import { useKeyboardShortcuts } from "../keyboard/use-keyboard-shortcuts"

/** One runnable entry in a {@link CommandPalette}. */
export interface CommandPaletteItem {
  /** Unique within the palette. */
  readonly id: string
  /** The visible name, also matched by the search. */
  readonly label: string
  /** Extra words the search matches, e.g. synonyms. */
  readonly keywords?: readonly string[]
  /** A decorative icon shown before the label. */
  readonly icon?: ReactNode
  /** A short hint shown at the end of the row. */
  readonly shortcut?: ReactNode
  /** Runs after the palette has closed. */
  readonly onSelect: () => void
}

/** A headed group of {@link CommandPaletteItem}s. */
export interface CommandPaletteGroup {
  readonly id: string
  readonly heading: string
  readonly items: readonly CommandPaletteItem[]
}

/** Every user-facing string of the {@link CommandPalette}. */
export interface CommandPaletteLabels {
  /** Names the trigger button. */
  readonly trigger: string
  /** The trigger's visible text, shown when the shell header has room. */
  readonly triggerText: string
  /** Names the dialog and its search box. */
  readonly title: string
  readonly description: string
  readonly placeholder: string
  /** Shown when nothing matches the search. */
  readonly empty: string
}

/** English defaults for every {@link CommandPaletteLabels} field. */
export const defaultCommandPaletteLabels: CommandPaletteLabels = {
  trigger: "Search commands",
  triggerText: "Search",
  title: "Command menu",
  description: "Search sections and run actions",
  placeholder: "Search sections and actions...",
  empty: "No matching commands.",
}

/** Props for {@link CommandPalette}. */
export interface CommandPaletteProps {
  /** The groups and items to offer, in display order. */
  readonly groups: readonly CommandPaletteGroup[]
  readonly labels?: Partial<CommandPaletteLabels>
  /** The shortcut that toggles the palette, or `false` for none. `mod` is ⌘ or Ctrl. */
  readonly hotkey?: string | false
  /** The key caps the trigger shows for the shortcut. */
  readonly hotkeyHint?: readonly string[]
  /** A decorative search icon for the trigger. */
  readonly icon?: ReactNode
  /** Open state, for a controlled palette. */
  readonly open?: boolean | undefined
  readonly defaultOpen?: boolean
  readonly onOpenChange?: ((open: boolean) => void) | undefined
  readonly className?: string
}

/**
 * A searchable dialog of navigation and actions, opened from its trigger or a global shortcut
 * (⌘K or Ctrl+K by default). Items come from plain descriptors, so the app decides what it offers.
 * Picking an item closes the palette first, so focus is back on the page before the item runs. The
 * trigger grows to show its text and shortcut once the `AppShell` header has room.
 */
export function CommandPalette({
  groups,
  labels,
  hotkey = "mod+k",
  hotkeyHint = ["⌘", "K"],
  icon,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  className,
}: CommandPaletteProps): ReactElement {
  const copy = { ...defaultCommandPaletteLabels, ...labels }
  const [open, setOpen] = useControllableState({
    value: openProp,
    defaultValue: defaultOpen,
    onChange: onOpenChange,
  })

  useKeyboardShortcuts(
    hotkey === false
      ? {}
      : {
          [hotkey]: (event) => {
            event.preventDefault()
            setOpen((previous) => !previous)
          },
        },
    { enabled: hotkey !== false },
  )

  const run = (item: CommandPaletteItem): void => {
    setOpen(false)
    item.onSelect()
  }

  return (
    <>
      <button
        type="button"
        aria-label={copy.trigger}
        onClick={() => setOpen(true)}
        className={cn(
          buttonVariants({ variant: "outline", size: "icon" }),
          "gap-2 text-muted-foreground @2xl/shell:w-56 @2xl/shell:justify-start @2xl/shell:px-3",
          className,
        )}
      >
        {icon}
        <span className="sr-only @2xl/shell:not-sr-only">{copy.triggerText}</span>
        {hotkey === false ? null : (
          <KbdGroup aria-hidden className="ml-auto hidden @2xl/shell:flex">
            {hotkeyHint.map((key) => (
              <Kbd key={key}>{key}</Kbd>
            ))}
          </KbdGroup>
        )}
      </button>

      {/* The atom pins the dialog a third of the way down; bounding it lets the list scroll on a
          short landscape screen instead of running off it. */}
      <CommandDialog
        className="flex max-h-[calc(200dvh/3-1rem)] flex-col"
        open={open}
        onOpenChange={setOpen}
        title={copy.title}
        description={copy.description}
      >
        <Command label={copy.title}>
          <CommandInput placeholder={copy.placeholder} />
          {/* The empty message sits outside the list, and an empty list hides: a listbox with no
              options is invalid ARIA, and cmdk keeps it mounted when nothing matches. */}
          <CommandEmpty>{copy.empty}</CommandEmpty>
          <CommandList className="[&:not(:has([cmdk-item]))]:hidden">
            {groups.map((group) => (
              <CommandGroup key={group.id} heading={group.heading}>
                {group.items.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={item.id}
                    keywords={[item.label, ...(item.keywords ?? [])]}
                    onSelect={() => run(item)}
                  >
                    {item.icon}
                    {item.label}
                    {item.shortcut === undefined ? null : (
                      <CommandShortcut>{item.shortcut}</CommandShortcut>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  )
}
