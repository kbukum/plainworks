"use client"

import { ToggleGroup, ToggleGroupItem } from "@plainworks/elements/toggle-group"
import { isOneOf } from "@plainworks/std"
import { type LucideIcon, PanelBottom, PanelLeft, PanelRight } from "lucide-react"
import type { ReactElement } from "react"
import { DEVTOOLS_DOCK_SIDES, type DevtoolsDockSide } from "./layout"
import type { DockLayoutFailure } from "./use-dock-layout"

/** Props for {@link DockSidePicker}. */
export interface DockSidePickerProps {
  /** The side in effect. */
  readonly side: DevtoolsDockSide
  /** Whether the viewport fits a side dock; when it does not, only the bottom is possible. */
  readonly sideDockFits: boolean
  /** Called with the side the user picks. */
  readonly onSideChange: (side: DevtoolsDockSide) => void
  /** The last persistence failure, reported beside the picker. */
  readonly failure?: DockLayoutFailure
}

const SIDE_ICONS: Readonly<Record<DevtoolsDockSide, LucideIcon>> = {
  bottom: PanelBottom,
  left: PanelLeft,
  right: PanelRight,
}

const FAILURE_COPY: Readonly<Record<DockLayoutFailure["phase"], string>> = {
  restore: "Saved layout unreadable",
  save: "Layout not saved",
}

/**
 * The inspector's dock controls: a group of exclusive toggle buttons that move the devtools to the
 * bottom, left, or right, and a status line when the layout cannot be restored or saved. On a
 * viewport too narrow for a side dock there is nothing to choose, so the group is not rendered.
 */
export function DockSidePicker({
  side,
  sideDockFits,
  onSideChange,
  failure,
}: DockSidePickerProps): ReactElement | null {
  const status =
    failure === undefined ? null : (
      <p role="status" className="self-center text-destructive text-xs">
        {FAILURE_COPY[failure.phase]}
      </p>
    )
  if (!sideDockFits) return status
  return (
    <>
      {status}
      <ToggleGroup
        aria-label="Dock side"
        size="sm"
        spacing={0}
        value={[side]}
        onValueChange={(value) => {
          const [next] = value
          // Pressing the active side again would leave none pressed; the dock always has a side.
          if (isOneOf(next, DEVTOOLS_DOCK_SIDES)) onSideChange(next)
        }}
      >
        {DEVTOOLS_DOCK_SIDES.map((option) => {
          const Icon = SIDE_ICONS[option]
          return (
            <ToggleGroupItem key={option} value={option} aria-label={`Dock to ${option}`}>
              <Icon aria-hidden />
            </ToggleGroupItem>
          )
        })}
      </ToggleGroup>
    </>
  )
}
