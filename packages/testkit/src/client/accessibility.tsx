"use client"

import { type RenderOptions, type RenderResult, render } from "@testing-library/react"
import axe from "axe-core"
import type { ReactNode } from "react"

/** Render a client component with React Testing Library for accessibility-oriented assertions. */
export function renderA11y(ui: ReactNode, options?: RenderOptions): RenderResult {
  return render(ui, options)
}

/** Run axe against a rendered container and reject with actionable rule identifiers on failure. */
export async function expectNoAxeViolations(container: Element): Promise<void> {
  // jsdom has no layout or canvas rendering, so color contrast cannot be measured here. Browser
  // integration tests retain that rule; this helper covers the deterministic DOM rules.
  const result = await axe.run(container, {
    rules: {
      "color-contrast": { enabled: false },
    },
  })
  if (result.violations.length === 0) {
    return
  }

  const details = result.violations
    .map((violation) => `${violation.id}: ${violation.help}`)
    .join("\n")
  throw new Error(`Expected no accessibility violations:\n${details}`)
}
