"use client"

import { ToggleGroup, ToggleGroupItem } from "@plainworks/elements/toggle-group"
import { cn } from "@plainworks/theme"
import type { ReactElement, KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react"
import { ShortcutHint } from "../keyboard/shortcut-hint"
import { useKeyboardShortcuts } from "../keyboard/use-keyboard-shortcuts"

/** One choice in a {@link RatingControl}. */
export interface RatingOption<T extends string = string> {
  readonly value: T
  /** The accessible name, and the visible text unless `hideLabel` is set. */
  readonly label: string
  /** One character that picks this choice, shown as a key cap. */
  readonly key: string
  /** A decorative glyph shown before the label. */
  readonly icon?: ReactNode
  /** Show only the icon and key cap; the label still names the button. */
  readonly hideLabel?: boolean
}

/** Labels for {@link thumbsRating}. */
export interface ThumbsRatingLabels {
  readonly up: string
  readonly down: string
}

/** Thumbs down (`D`) and thumbs up (`U`). */
export function thumbsRating(
  labels: ThumbsRatingLabels = { up: "Good", down: "Bad" },
): readonly RatingOption<"down" | "up">[] {
  return [
    { value: "down", label: labels.down, key: "d", icon: "👎" },
    { value: "up", label: labels.up, key: "u", icon: "👍" },
  ]
}

/** The points of a {@link pointsRating} scale, as strings `"1"` through `"9"`. */
export type RatingPoint = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"

const POINTS: readonly RatingPoint[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9"]

/**
 * A 1–`points` scale (2 to 9 points, default 5). Each button shows only its digit, which is also
 * its key. `label` names one point for assistive tech, such as `(n, of) => \`${n} of ${of}\``.
 */
export function pointsRating(
  points = 5,
  label: (point: number, of: number) => string = (point, of) => `${point} of ${of}`,
): readonly RatingOption<RatingPoint>[] {
  if (!Number.isInteger(points) || points < 2 || points > POINTS.length) {
    throw new RangeError(`pointsRating: points must be an integer from 2 to 9, got ${points}`)
  }
  return POINTS.slice(0, points).map((value, index) => ({
    value,
    label: label(index + 1, points),
    key: value,
    hideLabel: true,
  }))
}

/** Labels for {@link pairwiseRating}. */
export interface PairwiseRatingLabels {
  readonly a: string
  readonly b: string
  readonly equal: string
}

/** A preference between two outputs: A (`A`), equal (`E`) or B (`B`). */
export function pairwiseRating(
  labels: PairwiseRatingLabels = { a: "A is better", b: "B is better", equal: "Equal" },
): readonly RatingOption<"a" | "equal" | "b">[] {
  return [
    { value: "a", label: labels.a, key: "a" },
    { value: "equal", label: labels.equal, key: "e" },
    { value: "b", label: labels.b, key: "b" },
  ]
}

/** Props for {@link RatingControl}. */
export interface RatingControlProps<T extends string> {
  /** Names the group, such as "Rate this answer". */
  readonly label: string
  /** Choices in display order, usually from `thumbsRating`, `pointsRating` or `pairwiseRating`. */
  readonly options: readonly RatingOption<T>[]
  /** The current rating; `undefined` when not rated yet. */
  readonly value: T | undefined
  /** Called with the picked choice, even when it is already the value. */
  readonly onValueChange: (value: T) => void
  /**
   * Listen for the choice keys anywhere on the page, not only while the group has focus. Use it
   * for the one control a page is about, such as a rate-one-at-a-time view. Defaults to false.
   */
  readonly globalKeys?: boolean
  /** When false, the choice keys are off everywhere, so voice and switch users can type freely. */
  readonly singleKeys?: boolean
  readonly disabled?: boolean
  readonly className?: string
}

function validate(options: readonly RatingOption[]): void {
  const keys = new Set<string>()
  const values = new Set<string>()
  for (const option of options) {
    const key = option.key.toLowerCase()
    if (key.length !== 1 || key.trim() === "" || key === "+") {
      throw new RangeError(`RatingControl: option "${option.value}" needs a one-character key`)
    }
    if (keys.has(key) || values.has(option.value)) {
      throw new RangeError(`RatingControl: option "${option.value}" repeats a value or key`)
    }
    keys.add(key)
    values.add(option.value)
  }
}

/**
 * A row of rating buttons — thumbs, a points scale, or A / Equal / B. Each button shows the key
 * that picks it and announces it through `aria-keyshortcuts`. Arrow keys move between buttons, and
 * a choice key picks while focus is in the group (or anywhere with `globalKeys`). A pick always
 * calls `onValueChange`, so a caller can save and move on; picking the current value keeps it.
 */
export function RatingControl<T extends string>({
  label,
  options,
  value,
  onValueChange,
  globalKeys = false,
  singleKeys = true,
  disabled = false,
  className,
}: RatingControlProps<T>): ReactElement {
  validate(options)
  const byKey = new Map(options.map((option) => [option.key.toLowerCase(), option.value]))
  const pick = (key: string): boolean => {
    const next = byKey.get(key.toLowerCase())
    if (next === undefined || disabled) return false
    onValueChange(next)
    return true
  }

  useKeyboardShortcuts(
    Object.fromEntries(
      options.map((option) => [
        option.key.toLowerCase(),
        (event: KeyboardEvent) => {
          if (pick(option.key)) event.preventDefault()
        },
      ]),
    ),
    { enabled: globalKeys && !disabled, singleKeys },
  )

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (globalKeys || !singleKeys || event.repeat) return
    if (event.metaKey || event.ctrlKey || event.altKey) return
    if (pick(event.key)) event.preventDefault()
  }

  return (
    <ToggleGroup
      aria-label={label}
      variant="outline"
      value={value === undefined ? [] : [value]}
      onValueChange={(values) => {
        const next = options.find((option) => option.value === values[0])
        if (next !== undefined) onValueChange(next.value)
        else if (value !== undefined) onValueChange(value)
      }}
      disabled={disabled}
      onKeyDown={onKeyDown}
      className={cn("max-w-full flex-wrap", className)}
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          aria-keyshortcuts={singleKeys ? option.key.toUpperCase() : undefined}
          className="min-h-11 min-w-11 gap-2"
        >
          {option.icon === undefined ? null : <span aria-hidden="true">{option.icon}</span>}
          {/* The label is the button's name from its content, so the name always holds the visible text. */}
          <span className={option.hideLabel ? "sr-only" : undefined}>{option.label}</span>
          {singleKeys ? (
            <ShortcutHint combo={option.key} decorative className="text-muted-foreground" />
          ) : null}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
