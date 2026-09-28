import type { BrowserAxeOptions } from "../checks/axe"
import type { LayoutFacts } from "../checks/heuristics"
import type { RuntimeError } from "../checks/runtime-errors"
import type { FlowCheckpoint } from "./definition"
import type { PageVariant } from "./matrix/axes"

/** What a failure's evidence bundle holds, before it is written to the run. */
export interface EvidenceSnapshot {
  /** The DOM, without scripts or hidden and password field values. */
  readonly dom: string
  /** The recent console messages, as JSON. */
  readonly console: string
  /** The recent requests (method, URL, status only), as JSON. */
  readonly network: string
}

/**
 * Everything the flow engine asks of one live page on one device. The Playwright implementation
 * drives a real browser; a test drives the engine through a fake, so the orchestration is proven
 * without one. Each method is one observable step, and none of them sleeps.
 *
 * Each async method receives its step's `signal`, which aborts when the step's budget runs out or
 * the run is cancelled. An implementation hands it to every browser call that accepts one, so a
 * timed-out step stops rather than racing the steps after it.
 */
export interface FlowSession {
  /** Run the checkpoint's action. */
  act(checkpoint: FlowCheckpoint, signal: AbortSignal): Promise<void>
  /** Wait for the checkpoint's ready element and web fonts; `false` when it never shows. */
  waitReady(checkpoint: FlowCheckpoint, timeoutMs: number, signal: AbortSignal): Promise<boolean>
  /** Wait for the `main` landmark to hydrate; `false` when it never does. */
  waitHydrated(timeoutMs: number, signal: AbortSignal): Promise<boolean>
  /** Switch the live page to a variant's mode, theme, density, and preference. */
  applyVariant(variant: PageVariant, signal: AbortSignal): Promise<void>
  /** Put the page back as the test left it, before any variant. */
  restoreVariant(signal: AbortSignal): Promise<void>
  /** Wait for running finite animations to finish. */
  settle(signal: AbortSignal): Promise<void>
  measureLayout(signal: AbortSignal): Promise<LayoutFacts>
  /** One frame as the checkpoint frames it, with its masks painted over. */
  screenshot(checkpoint: FlowCheckpoint, signal: AbortSignal): Promise<Uint8Array>
  ariaSnapshot(signal: AbortSignal): Promise<string>
  /** One line per axe violation. */
  scanAxe(options: BrowserAxeOptions, signal: AbortSignal): Promise<string[]>
  /** How many CSS px the page scrolls sideways. */
  horizontalOverflow(signal: AbortSignal): Promise<number>
  /** One line per open overlay that leaves the viewport. */
  overlaysOutsideViewport(signal: AbortSignal): Promise<string[]>
  /** One line per problem with the focused control's indicator. */
  focusProblems(signal: AbortSignal): Promise<string[]>
  /** Compare a frame with its committed baseline; a message when they differ. */
  comparePixels(
    checkpoint: FlowCheckpoint,
    name: string,
    signal: AbortSignal,
  ): Promise<string | undefined>
  /** Take the runtime errors raised since the last call. */
  drainRuntimeErrors(): RuntimeError[]
  evidence(signal: AbortSignal): Promise<EvidenceSnapshot>
}
