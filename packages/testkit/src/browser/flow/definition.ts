import type { Locator, Page } from "@playwright/test"
import type { BrowserAxeOptions } from "../checks/axe"
import type { Allowance } from "../checks/findings"
import { FlowError } from "./errors"
import type { VisualCapture } from "./frame"

/** Which checks a checkpoint runs. Runtime errors are always checked. */
export interface CheckpointChecks {
  /** WCAG 2.2 AA axe scan of the whole page, `target-size` included. Defaults to `true`. */
  readonly axe?: boolean
  /** No horizontal scrolling, and every open overlay fits the viewport. Defaults to `true`. */
  readonly overflow?: boolean
  /** The focused control shows a visible, uncovered indicator. Defaults to `false`. */
  readonly focus?: boolean
  /**
   * React has hydrated the `main` landmark. Defaults to `true`; turn it off only for a page that
   * ships no client bundle, such as server-rendered sign-in markup.
   */
  readonly hydration?: boolean
  /**
   * The layout heuristics: clipped text, overlapping targets, focusable content under fixed
   * chrome, broken images, and a layout shift between readiness and capture. Defaults to `true`.
   */
  readonly heuristics?: boolean
}

/** What a checkpoint's action is handed besides the page. */
export interface FlowActionContext {
  /**
   * Aborts when the action's budget runs out or the run is cancelled. Pass it to each Playwright
   * call that takes one (`locator.click({ signal })`, `page.goto(url, { signal })`), so a
   * timed-out action stops instead of changing the page under the steps after it.
   */
  readonly signal: AbortSignal
}

/** One labeled step of a flow: an action, and the condition that says the page is ready. */
export interface FlowCheckpoint {
  /** A lowercase slug, unique in the flow. It names the checkpoint's frames and report entry. */
  readonly name: string
  /** Drive the page into this checkpoint's state, from where the previous checkpoint left it. */
  readonly act: (page: Page, context: FlowActionContext) => Promise<unknown>
  /**
   * The element whose visibility says the checkpoint is ready. The engine waits for it, then for
   * hydration, web fonts, and settled animations; a flow never sleeps.
   */
  readonly ready: (page: Page) => Locator
  readonly checks?: CheckpointChecks
  readonly axe?: BrowserAxeOptions
  /** Findings this checkpoint provokes on purpose, each with its reason. */
  readonly allow?: readonly Allowance[]
  /** How the frame is framed. Defaults to the viewport. */
  readonly frame?: VisualCapture
  /** Regions that differ on every run for a reason outside the kit, painted over in frames. */
  readonly mask?: (page: Page) => Locator[]
  /**
   * Compare each variant's frame with a committed baseline. Off by default: a checkpoint opts in
   * only when it earns a curated baseline, so a flow never creates one as a side effect.
   */
  readonly pixel?: boolean
}

/**
 * A named journey: ordered checkpoints over one live page. A single surface is a one-checkpoint
 * flow. The same definition asserts as an end-to-end test and captures frames for review.
 */
export interface Flow {
  /** A lowercase slug, unique in a suite. It names the flow's artifacts. */
  readonly name: string
  /**
   * Globs of the repository paths this flow proves, relative to the repository root, such as
   * `apps/showcase/src/routes/tasks/**`. `ui:check --affected` runs the flows whose globs match a
   * changed file. `*` matches within one path segment and `**` across segments.
   */
  readonly covers?: readonly string[]
  readonly checkpoints: readonly FlowCheckpoint[]
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Validate a flow and return it. Throws a `flow/definition` {@link FlowError} for a name that is
 * not a lowercase slug, a `covers` glob that is empty or leaves the repository, no checkpoints, a
 * repeated checkpoint name, an allowance with no reason, or an allowance pattern with the `g` or
 * `y` flag, whose `lastIndex` would make matching depend on what it matched before.
 */
export function defineFlow<const T extends Flow>(flow: T): T {
  slug("Flow", flow.name)
  for (const pattern of flow.covers ?? []) {
    if (
      pattern.trim() === "" ||
      pattern.startsWith("/") ||
      pattern.includes("\\") ||
      pattern.split("/").includes("..")
    ) {
      throw new FlowError(
        "definition",
        `Flow "${flow.name}" covers "${pattern}", which is not a repository-relative glob`,
      )
    }
  }
  if (flow.checkpoints.length === 0) {
    throw new FlowError("definition", `Flow "${flow.name}" needs at least one checkpoint`)
  }
  const seen = new Set<string>()
  for (const checkpoint of flow.checkpoints) {
    slug(`Checkpoint in "${flow.name}"`, checkpoint.name)
    if (seen.has(checkpoint.name)) {
      throw new FlowError(
        "definition",
        `Flow "${flow.name}" declares checkpoint "${checkpoint.name}" twice`,
      )
    }
    seen.add(checkpoint.name)
    for (const allowance of checkpoint.allow ?? []) {
      const where = `"${flow.name}" › "${checkpoint.name}"`
      if (allowance.reason.trim() === "") {
        throw new FlowError("definition", `An allowance in ${where} needs a reason`)
      }
      if (allowance.match?.global === true || allowance.match?.sticky === true) {
        throw new FlowError(
          "definition",
          `An allowance pattern in ${where} must not use the g or y flag`,
        )
      }
    }
  }
  return flow
}

function slug(what: string, name: string): void {
  if (!SLUG.test(name)) {
    throw new FlowError("definition", `${what} name must be a lowercase slug: "${name}"`)
  }
}
