"use client"

import { Button } from "@plainworks/elements/button"
import type { ComponentProps, ReactElement } from "react"
import { useClipboard } from "./use-clipboard"

type ButtonProps = ComponentProps<typeof Button>

/** The visible strings a {@link CopyButton} renders, for localization. */
export interface CopyButtonLabels {
  readonly copy: string
  readonly copied: string
  /** Announced when the browser refuses the write. */
  readonly failed: string
}

export const defaultCopyButtonLabels: CopyButtonLabels = {
  copy: "Copy",
  copied: "Copied",
  failed: "Copy failed",
}

/** Props for {@link CopyButton}. Other props go to the underlying button. */
export interface CopyButtonProps
  extends Omit<ButtonProps, "children" | "onClick" | "aria-label" | "aria-labelledby"> {
  /** The text written to the clipboard. */
  readonly text: string
  /** What is copied, appended to the accessible name only, such as "command". */
  readonly context?: string | undefined
  readonly labels?: Partial<CopyButtonLabels> | undefined
}

/**
 * A text button that copies `text` and confirms in place. Its name starts with the visible text, so
 * voice control finds it (WCAG 2.5.3), and the result is announced through a polite status region,
 * including a refused write.
 */
export function CopyButton({
  text,
  context,
  labels,
  variant = "outline",
  size = "sm",
  type = "button",
  ...buttonProps
}: CopyButtonProps): ReactElement {
  const names = { ...defaultCopyButtonLabels, ...labels }
  const clipboard = useClipboard()
  const status = clipboard.copied ? names.copied : clipboard.error === undefined ? "" : names.failed
  return (
    <>
      <Button
        variant={variant}
        size={size}
        type={type}
        {...buttonProps}
        onClick={() => {
          // A refused write is kept in the hook's error state and announced below.
          clipboard.copy(text).catch(() => undefined)
        }}
      >
        {clipboard.copied ? names.copied : names.copy}
        {context === undefined ? null : (
          <>
            {" "}
            <span className="sr-only">{context}</span>
          </>
        )}
      </Button>
      <span role="status" className="sr-only">
        {status}
      </span>
    </>
  )
}
