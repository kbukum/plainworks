import { expect, type Locator, type Page } from "@playwright/test"
import type { BrowserAxeOptions } from "../checks/axe"
import type { RuntimeErrorWatch } from "../checks/runtime-errors"
import { captureOptions, type VisualCapture, withCaptureFrame } from "../flow/frame"
import {
  expectFocusVisible,
  expectHydrated,
  expectNoBrowserAxeViolations,
  expectNoHorizontalOverflow,
  expectOverlaysInViewport,
} from "./assertions"
import { expandMatrix, type VisualMatrix, type VisualVariant } from "./matrix"

/** Which checks a surface runs besides its screenshot. */
export interface VisualChecks {
  /** WCAG 2.2 AA axe scan of the whole page. Defaults to `true`. */
  readonly axe?: boolean
  /**
   * No horizontal scrolling at the variant viewport (WCAG 1.4.10 at 320 px), and every open dialog
   * or menu fits inside the viewport. Defaults to `true`.
   */
  readonly overflow?: boolean
  /** The focused control shows a visible, uncovered indicator. Defaults to `false`. */
  readonly focus?: boolean
  /**
   * Wait for React to hydrate the `main` landmark before any check or capture. Defaults to `true`;
   * turn it off only for a surface that blocks the client bundle to capture server markup.
   */
  readonly hydration?: boolean
}

/** One user-visible surface in one state, captured across a matrix of modes and viewports. */
export interface VisualSurface {
  /** A lowercase slug. It prefixes every baseline file, so it must be unique in a suite. */
  readonly name: string
  readonly matrix: VisualMatrix
  /**
   * Bring the page into the state under test. It runs after the viewport and the color scheme are
   * applied, and must end with the surface rendered and settled.
   */
  readonly arrange: (page: Page, variant: VisualVariant) => Promise<void>
  readonly checks?: VisualChecks
  readonly axe?: BrowserAxeOptions
  /** Runtime errors this state provokes on purpose, such as a failed request's console line. */
  readonly allowErrors?: readonly RegExp[]
  /** How the screenshot frames the surface. Defaults to the viewport. */
  readonly capture?: VisualCapture
  /** Regions that differ on every run for a reason outside the kit, painted over in the capture. */
  readonly mask?: (page: Page) => Locator[]
  /**
   * `arrange` pauses the page clock (`page.clock.pauseAt`), so content a real timer drives stays
   * still until the capture. The run then resumes the clock and runs the axe scan, which needs
   * running timers. Defaults to `false`.
   */
  readonly holdsClock?: boolean
}

/** The tag every visual test carries, so a run can select (`--grep`) or skip (`--grep-invert`) them. */
export const VISUAL_TAG = "@visual"

/** One planned test: a surface in one variant, with its test title and baseline name. */
export interface PlannedVisualTest {
  readonly surface: VisualSurface
  readonly variant: VisualVariant
  readonly title: string
  readonly snapshot: string
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Plan one test per surface variant. Throws {@link RangeError} for a name that is not a lowercase
 * slug or that two surfaces share, because the name keys the baseline files.
 */
export function planVisualTests(surfaces: readonly VisualSurface[]): PlannedVisualTest[] {
  const seen = new Set<string>()
  return surfaces.flatMap((surface) => {
    if (!SLUG.test(surface.name)) {
      throw new RangeError(`Visual surface name must be a lowercase slug: "${surface.name}"`)
    }
    if (seen.has(surface.name)) {
      throw new RangeError(`Visual surface "${surface.name}" is declared twice`)
    }
    seen.add(surface.name)
    return expandMatrix(surface.matrix).map((variant) => ({
      surface,
      variant,
      title: `${surface.name} ${variant.id}`,
      snapshot: `${surface.name}-${variant.id}.png`,
    }))
  })
}

/** The gate fixtures a visual test uses. */
export interface VisualTestFixtures {
  readonly page: Page
  readonly runtimeErrors: RuntimeErrorWatch
}

/**
 * Run one planned visual test: apply the variant, arrange the surface, run its checks, and compare
 * its baseline. A surface that {@link VisualSurface.holdsClock | holds the clock} is captured
 * before its axe scan, because the scan needs running timers. Declare the tests in the spec file
 * itself, so each keeps the spec's location for reports and file filters. Playwright reads fixture
 * names from the destructured argument:
 *
 * ```ts
 * for (const planned of planVisualTests(surfaces)) {
 *   test(planned.title, { tag: VISUAL_TAG }, ({ page, runtimeErrors }) =>
 *     runVisualTest({ page, runtimeErrors }, planned),
 *   )
 * }
 * ```
 */
export async function runVisualTest(
  { page, runtimeErrors }: VisualTestFixtures,
  { surface, variant, snapshot }: PlannedVisualTest,
): Promise<void> {
  for (const pattern of surface.allowErrors ?? []) runtimeErrors.allow(pattern)
  await page.setViewportSize(variant.size)
  await page.emulateMedia({ colorScheme: variant.mode })
  await surface.arrange(page, variant)
  if (surface.checks?.hydration !== false) await expectHydrated(page)
  await page.evaluate(() => document.fonts.ready)
  const label = `${surface.name} ${variant.id}`
  if (surface.checks?.overflow !== false) {
    await expectNoHorizontalOverflow(page, label)
    await expectOverlaysInViewport(page, label)
  }
  if (surface.checks?.focus === true) await expectFocusVisible(page)
  const axe = surface.checks?.axe !== false
  const held = surface.holdsClock === true
  if (axe && !held) await expectNoBrowserAxeViolations(page, surface.axe)
  await withCaptureFrame(page, surface.capture, () =>
    expect(page).toHaveScreenshot(snapshot, {
      ...captureOptions(surface.capture),
      ...(surface.mask === undefined ? {} : { mask: surface.mask(page) }),
    }),
  )
  if (held) await page.clock.resume()
  if (axe && held) await expectNoBrowserAxeViolations(page, surface.axe)
}
