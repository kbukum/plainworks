"use client"

import { Button } from "@plainworks/elements/button"
import { Card, CardContent, CardFooter, CardHeader } from "@plainworks/elements/card"
import type { ReactElement, ReactNode } from "react"

export interface ErrorFallbackProps {
  readonly onReset: () => void
  readonly title?: string
  /**
   * User-facing copy. Keep it generic: a runtime `Error` message can carry URLs, identifiers, or
   * other internals, so this component never renders one — the original error belongs to the
   * reporting seam (`AppErrorBoundary`'s `onError`), not the page.
   */
  readonly description?: string
  readonly children?: ReactNode
}

/** Presentational fallback for an injected behavioral error boundary. */
export function ErrorFallback({
  onReset,
  title = "Something went wrong",
  description = "The page could not be displayed. Try again.",
  children,
}: ErrorFallbackProps): ReactElement {
  return (
    <div className="grid min-h-40 place-items-center p-4">
      <Card role="alert" aria-live="assertive" className="w-full max-w-prose">
        <CardHeader>
          <h2 className="text-lg font-semibold leading-tight">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </CardHeader>
        {children === undefined ? null : <CardContent>{children}</CardContent>}
        <CardFooter>
          <Button onClick={onReset}>Try again</Button>
        </CardFooter>
      </Card>
    </div>
  )
}
