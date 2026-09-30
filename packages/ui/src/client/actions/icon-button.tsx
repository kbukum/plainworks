"use client"

import { Button } from "@plainworks/elements/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@plainworks/elements/tooltip"
import type { ComponentProps, ReactElement, ReactNode } from "react"

type ButtonProps = ComponentProps<typeof Button>

/** Props for {@link IconButton}. Other props go to the underlying button. */
export interface IconButtonProps
  extends Omit<ButtonProps, "children" | "aria-label" | "aria-labelledby" | "size"> {
  /** The accessible name, also shown as the tooltip. */
  readonly label: string
  /** The glyph. It is decorative; the label names the control. */
  readonly icon: ReactNode
  /** One of the button atom's icon sizes. Defaults to `icon` (32px). */
  readonly size?: "icon" | "icon-xs" | "icon-sm" | "icon-lg"
  /** Which side of the button the tooltip opens on. Defaults to `bottom`. */
  readonly tooltipSide?: "top" | "bottom" | "left" | "right"
}

/**
 * An icon-only button that names itself from `label` and shows the same label as a tooltip on
 * hover and keyboard focus. To use it as a menu or drawer trigger, pass it as the trigger's
 * `render` element; the trigger's props flow through to the button.
 */
export function IconButton({
  label,
  icon,
  size = "icon",
  variant = "ghost",
  tooltipSide = "bottom",
  ...buttonProps
}: IconButtonProps): ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Button variant={variant} size={size} aria-label={label} {...buttonProps} />}
      >
        <span aria-hidden="true" className="contents">
          {icon}
        </span>
      </TooltipTrigger>
      <TooltipContent side={tooltipSide}>{label}</TooltipContent>
    </Tooltip>
  )
}
