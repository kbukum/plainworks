"use client"

import { RadioGroup, RadioGroupItem } from "@plainworks/elements/radio-group"
import type { ReactElement } from "react"
import { useLocalPreferences } from "./local-preferences"
import { MOTION_OPTIONS, type MotionPreference } from "./settings-fields"

/**
 * A device-local motion control. Unlike the account panels it saves nothing to the server: it reads
 * and writes the versioned persistent-scope preference through {@link useLocalPreferences},
 * applying instantly and persisting to this browser. Each choice is a labelled radio with a
 * description, so the group is keyboard-operable and screen-reader clear.
 *
 * Kit-promotion decision: `@plainworks/ui/forms` ships no `RadioGroupField` yet, so this composes
 * the `@plainworks/elements` radio atoms app-locally. If a second surface needs a radio group, this
 * is the candidate to promote into the kit's forms concern alongside the other field wrappers.
 */
export function MotionControl(): ReactElement {
  const motion = useLocalPreferences((state) => state.motion)
  const preferences = useLocalPreferences.useApi()

  return (
    <RadioGroup
      aria-label="Motion"
      className="gap-3"
      value={motion}
      onValueChange={(value) => preferences.set({ motion: value as MotionPreference })}
    >
      {MOTION_OPTIONS.map((option) => (
        // The radio control lives inside the label (the canonical "control-in-label" pattern), so
        // the label names it — axe confirms the association. Biome only recognizes a native input
        // here, not the Base UI radio, so this rule is a false positive.
        // biome-ignore lint/a11y/noLabelWithoutControl: the RadioGroupItem is the label's control.
        <label
          key={option.value}
          className="flex items-start gap-3 rounded-lg border border-border/70 p-3 has-data-checked:border-primary"
        >
          <RadioGroupItem value={option.value} className="mt-0.5" />
          <span className="grid gap-0.5">
            <span className="text-sm font-medium">{option.label}</span>
            <span className="text-sm text-muted-foreground">{option.description}</span>
          </span>
        </label>
      ))}
    </RadioGroup>
  )
}
