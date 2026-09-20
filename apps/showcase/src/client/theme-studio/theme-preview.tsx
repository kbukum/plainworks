"use client"

import { Badge } from "@plainworks/elements/badge"
import { Button } from "@plainworks/elements/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@plainworks/elements/card"
import { Input } from "@plainworks/elements/input"
import type { ReactElement } from "react"

// A fixed sample series — the preview shows craft, not data, so the shape stays constant while the
// theme repaints the bars through `fill-primary`.
const SAMPLE_BARS: readonly number[] = [42, 68, 55, 80, 61, 92, 74]

/** A dependency-light, CSP-friendly accent bar sketch that repaints with the active theme. */
function PreviewChart(): ReactElement {
  const max = Math.max(...SAMPLE_BARS)
  const gap = 4
  const width = SAMPLE_BARS.length * 12 + (SAMPLE_BARS.length - 1) * gap
  return (
    <svg
      role="img"
      aria-label="Sample trend, styled by the current accent"
      viewBox={`0 0 ${width} 48`}
      className="h-12 w-full"
      preserveAspectRatio="none"
    >
      {SAMPLE_BARS.map((value, index) => {
        const height = (value / max) * 44
        return (
          <rect
            // The series is fixed and positional, so the index is a stable key here.
            key={index}
            x={index * (12 + gap)}
            y={48 - height}
            width={12}
            height={height}
            rx={2}
            className="fill-primary"
          />
        )
      })}
    </svg>
  )
}

/**
 * A compact live preview of the kit's surface under the chosen mode and accent. It renders real kit
 * atoms — buttons, badges, an input, a card, and an accent chart — so a user sees the effect of a
 * theme change before leaving the studio. It re-themes automatically: changing mode or accent
 * repaints the whole document, this preview included.
 */
export function ThemePreview(): ReactElement {
  return (
    <Card role="region" aria-label="Theme preview" className="bg-card">
      <CardHeader>
        <CardTitle>Preview</CardTitle>
        <CardDescription>How the current mode and accent look on real surfaces.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm">Primary</Button>
          <Button size="sm" variant="secondary">
            Secondary
          </Button>
          <Button size="sm" variant="outline">
            Outline
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Active</Badge>
          <Badge variant="secondary">Draft</Badge>
          <Badge variant="outline">Archived</Badge>
        </div>
        <Input aria-label="Sample input" placeholder="Sample input" />
        <PreviewChart />
      </CardContent>
    </Card>
  )
}
