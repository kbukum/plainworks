import AxeBuilder from "@axe-core/playwright"
import type { Page } from "@playwright/test"
import { settleAnimations } from "./animation"

/**
 * The WCAG 2.2 AA rule tags the browser gate runs. Unlike the jsdom floor in
 * `@plainworks/testkit/client`, a real browser can measure layout, so this includes
 * `color-contrast` and runs over whole composed pages, open overlays included.
 */
export const BROWSER_AXE_TAGS: readonly string[] = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
]

/** The axe result fields {@link formatAxeViolations} reads. */
export interface AxeViolationSummary {
  readonly id: string
  readonly help: string
  readonly nodes: readonly { readonly target: readonly unknown[] }[]
}

/** Render violations as one `rule: help — targets` line each. */
export function formatAxeViolations(violations: readonly AxeViolationSummary[]): string {
  return violations
    .map((violation) => {
      const targets = violation.nodes.map((node) => node.target.join(" ")).join(", ")
      return `${violation.id}: ${violation.help} — ${targets || "(no target)"}`
    })
    .join("\n")
}

/** Options for {@link scanBrowserAxe}. */
export interface BrowserAxeOptions {
  /** CSS selectors to leave out, for third-party content the kit does not own. */
  readonly exclude?: readonly string[]
}

/**
 * Run axe-core in the live browser over the whole current page for WCAG 2.2 AA, including the
 * 24x24 CSS px `target-size` rule (WCAG 2.5.8), and return its violations. Running animations
 * settle first, so contrast is never sampled mid-transition.
 */
export async function scanBrowserAxe(
  page: Page,
  options: BrowserAxeOptions = {},
): Promise<AxeViolationSummary[]> {
  await settleAnimations(page)
  let builder = new AxeBuilder({ page }).options({
    runOnly: { type: "tag", values: [...BROWSER_AXE_TAGS] },
    // axe ships `target-size` as an experimental rule, which a tag filter alone never runs.
    rules: { "target-size": { enabled: true } },
  })
  for (const selector of options.exclude ?? []) {
    builder = builder.exclude(selector)
  }
  const { violations } = await builder.analyze()
  return violations
}
