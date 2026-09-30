"use client"

import type { MotionPreference } from "@plainworks/theme/preference"
import type { ReactElement } from "react"
import { RadioGroupField } from "../forms/radio-group-field"

/** Every user-facing string of the {@link MotionControl}. */
export interface MotionControlLabels {
  /** Names the group, e.g. `"Motion"`. */
  readonly label: string
  /** Helper text read with the group. */
  readonly description: string
  readonly system: string
  readonly systemDescription: string
  readonly reduce: string
  readonly reduceDescription: string
}

/** English defaults for every {@link MotionControlLabels} field. */
export const defaultMotionControlLabels: MotionControlLabels = {
  label: "Motion",
  description: "Control animation across the app.",
  system: "Match system",
  systemDescription: "Follow your device's reduce-motion setting.",
  reduce: "Reduced motion",
  reduceDescription: "Minimize animation across the app.",
}

/** Props for {@link MotionControl}. */
export interface MotionControlProps {
  /** The current choice. Where it is stored is the caller's concern. */
  readonly value: MotionPreference
  readonly onValueChange: (value: MotionPreference) => void
  /** Overrides for any subset of the copy. */
  readonly labels?: Partial<MotionControlLabels>
  /** Field name, for submitting the choice in a form. Defaults to `motion`. */
  readonly name?: string
  readonly className?: string
}

/**
 * A two-way choice between following the device's reduced-motion setting and always reducing
 * motion. Pair it with `useDocumentMotion` from `@plainworks/theme/client`, which applies the
 * choice to the document.
 */
export function MotionControl({
  value,
  onValueChange,
  labels,
  name = "motion",
  className,
}: MotionControlProps): ReactElement {
  const copy = { ...defaultMotionControlLabels, ...labels }
  return (
    <RadioGroupField
      name={name}
      label={copy.label}
      description={copy.description}
      value={value}
      onValueChange={onValueChange}
      className={className}
      options={[
        { value: "system", label: copy.system, description: copy.systemDescription },
        { value: "reduce", label: copy.reduce, description: copy.reduceDescription },
      ]}
    />
  )
}
