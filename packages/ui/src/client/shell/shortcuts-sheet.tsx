"use client"

import { Label } from "@plainworks/elements/label"
import { Switch } from "@plainworks/elements/switch"
import { cn } from "@plainworks/theme"
import { type ReactElement, type ReactNode, useId } from "react"
import { ShortcutHint } from "../keyboard/shortcut-hint"
import { isSingleKey } from "../keyboard/use-keyboard-shortcuts"
import { Drawer } from "../overlays/drawer"

/** One shortcut listed in a {@link ShortcutsSheet}. */
export interface ShortcutEntry {
  /** The combo, in {@link useKeyboardShortcuts} syntax. */
  readonly combo: string
  readonly description: ReactNode
}

/** A titled group of shortcuts, such as "Anywhere" or "On Compare". */
export interface ShortcutGroup {
  readonly title: string
  readonly shortcuts: readonly ShortcutEntry[]
}

/** Every user-facing string of a {@link ShortcutsSheet}. */
export interface ShortcutsSheetLabels {
  readonly title: string
  readonly singleKeys: string
  readonly singleKeysHelp: string
}

/** English defaults for every {@link ShortcutsSheetLabels} field. */
export const defaultShortcutsSheetLabels: ShortcutsSheetLabels = {
  title: "Keyboard shortcuts",
  singleKeys: "Character-key shortcuts",
  singleKeysHelp: "Turn off if you use speech input or press keys by accident.",
}

/** Props for {@link ShortcutsSheet}. */
export interface ShortcutsSheetProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly groups: readonly ShortcutGroup[]
  /** Whether character-key shortcuts are on; the host owns and stores the preference. */
  readonly singleKeys: boolean
  readonly onSingleKeysChange: (on: boolean) => void
  /** What `mod` reads as; see {@link formatShortcut}. */
  readonly mod?: string
  readonly labels?: Partial<ShortcutsSheetLabels>
}

/**
 * A drawer listing the app's shortcuts by group, with the switch that turns character-key
 * shortcuts off (WCAG 2.1.4). Shortcuts that are off stay listed, dimmed.
 */
export function ShortcutsSheet({
  open,
  onOpenChange,
  groups,
  singleKeys,
  onSingleKeysChange,
  mod,
  labels,
}: ShortcutsSheetProps): ReactElement {
  const copy = { ...defaultShortcutsSheetLabels, ...labels }
  const switchId = useId()
  const helpId = useId()
  return (
    <Drawer title={copy.title} open={open} onOpenChange={onOpenChange}>
      <div className="flex flex-col gap-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor={switchId}>{copy.singleKeys}</Label>
            <p id={helpId} className="text-caption text-muted-foreground">
              {copy.singleKeysHelp}
            </p>
          </div>
          <Switch
            id={switchId}
            aria-describedby={helpId}
            checked={singleKeys}
            onCheckedChange={(checked) => onSingleKeysChange(checked)}
          />
        </div>
        {groups.map((group) => (
          <section key={group.title} className="flex flex-col gap-2">
            <h3 className="text-body font-semibold">{group.title}</h3>
            <ul className="flex flex-col gap-1">
              {group.shortcuts.map((shortcut) => {
                const off = !singleKeys && isSingleKey(shortcut.combo)
                return (
                  <li
                    key={shortcut.combo}
                    data-slot="shortcut-row"
                    data-off={off}
                    className={cn(
                      "flex items-center justify-between gap-4 text-body",
                      off && "text-muted-foreground line-through",
                    )}
                  >
                    <span>{shortcut.description}</span>
                    <ShortcutHint combo={shortcut.combo} {...(mod === undefined ? {} : { mod })} />
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </Drawer>
  )
}
