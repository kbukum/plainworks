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
import { Sparkline } from "../display/sparkline"

/** Every user-facing string of the {@link ThemePreview}. */
export interface ThemePreviewLabels {
  /** Names the preview region. */
  readonly region: string
  readonly title: string
  readonly description: string
  readonly primary: string
  readonly secondary: string
  readonly outline: string
  readonly active: string
  readonly draft: string
  readonly archived: string
  /** The sample input's placeholder. */
  readonly input: string
}

/** English defaults for every {@link ThemePreviewLabels} field. */
export const defaultThemePreviewLabels: ThemePreviewLabels = {
  region: "Theme preview",
  title: "Preview",
  description: "How the current mode and accent look on real surfaces.",
  primary: "Primary",
  secondary: "Secondary",
  outline: "Outline",
  active: "Active",
  draft: "Draft",
  archived: "Archived",
  input: "Sample input",
}

// A fixed sample: the preview shows the theme, not data, so the shape never changes.
const SAMPLE: readonly number[] = [42, 68, 55, 80, 61, 92, 74]

/** Props for {@link ThemePreview}. */
export interface ThemePreviewProps {
  readonly labels?: Partial<ThemePreviewLabels>
  readonly className?: string
}

/**
 * A small sample of real surfaces — buttons, badges, an input, and a chart — so a user sees a theme
 * change before leaving the page. It repaints with the document, so it needs no theme wiring.
 */
export function ThemePreview({ labels, className }: ThemePreviewProps): ReactElement {
  const copy = { ...defaultThemePreviewLabels, ...labels }
  return (
    <Card role="region" aria-label={copy.region} className={className}>
      <CardHeader>
        <CardTitle>{copy.title}</CardTitle>
        <CardDescription>{copy.description}</CardDescription>
      </CardHeader>
      {/* Samples only show the theme, so they are inert: no dead tab stops and nothing announced. */}
      <CardContent inert className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm">
            {copy.primary}
          </Button>
          <Button type="button" size="sm" variant="secondary">
            {copy.secondary}
          </Button>
          <Button type="button" size="sm" variant="outline">
            {copy.outline}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{copy.active}</Badge>
          <Badge variant="secondary">{copy.draft}</Badge>
          <Badge variant="outline">{copy.archived}</Badge>
        </div>
        <Input aria-label={copy.input} placeholder={copy.input} />
        <Sparkline variant="bar" values={SAMPLE} />
      </CardContent>
    </Card>
  )
}
