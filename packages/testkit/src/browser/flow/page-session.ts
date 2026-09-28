import { expect, type Page, errors as playwrightErrors } from "@playwright/test"
import { settleAnimations } from "../checks/animation"
import { formatAxeViolations, scanBrowserAxe } from "../checks/axe"
import { findFocusProblems } from "../checks/focus"
import { waitForHydration } from "../checks/hydration"
import { findOverlaysOutsideViewport, horizontalOverflow } from "../checks/layout"
import { measureLayoutFacts } from "../checks/layout-facts"
import { boundMessage } from "../checks/message"
import type { RuntimeErrorWatch } from "../checks/runtime-errors"
import { browserGateScreenshot, browserGateUse } from "../gate"
import type { FlowCheckpoint } from "./definition"
import { createEvidenceLog, snapshotDom, withoutQuery } from "./evidence"
import { captureOptions, withCaptureFrame } from "./frame"
import { FLOW_MODES, type PageVariant, PREFERENCES, type ThemeAxes } from "./matrix/axes"
import type { EvidenceSnapshot, FlowSession } from "./session"

/** Options for {@link createPageFlowSession}. */
export interface PageFlowSessionOptions {
  readonly page: Page
  /** The gate's runtime error watch, drained into each checkpoint's findings. */
  readonly runtimeErrors: RuntimeErrorWatch
  readonly axes: ThemeAxes
}

/** A {@link FlowSession} on a live page, with the listeners it must remove when the test ends. */
export interface PageFlowSession extends FlowSession {
  dispose(): void
}

// Enough recent history to explain a failure, bounded so a chatty page cannot grow memory.
const EVIDENCE_LOG_LIMIT = 200
// A DOM snapshot larger than this is cut, so one enormous page cannot fill the artifact store.
const MAX_DOM_CHARS = 2 * 1024 * 1024

interface RootState {
  readonly className: string
  readonly attributes: Readonly<Record<string, string | null>>
}

/**
 * Drive a flow on a Playwright page. A variant switches the live page in place, the way the
 * app's theme provider does: it swaps the theme's classes and attributes on `<html>`, emulates the
 * preference's media features, and scales root text for 200% zoom. Nothing reloads, so a
 * checkpoint's state survives every variant. Each step's signal goes to the checkpoint's action
 * and to every Playwright call that takes one. Call `dispose` when the test ends.
 */
export function createPageFlowSession(options: PageFlowSessionOptions): PageFlowSession {
  const { page, runtimeErrors, axes } = options
  // Every stored string is bounded as well as the entry count, since the page controls them.
  const consoleLog = createEvidenceLog<{ type: string; text: string }>(EVIDENCE_LOG_LIMIT)
  const networkLog = createEvidenceLog<{ method: string; url: string; status: number | string }>(
    EVIDENCE_LOG_LIMIT,
  )
  const onConsole = (message: { type(): string; text(): string }) =>
    consoleLog.remember({ type: message.type(), text: boundMessage(message.text()) })
  const onResponse = (response: {
    status(): number
    request(): { method(): string; url(): string }
  }) =>
    networkLog.remember({
      method: response.request().method(),
      url: boundMessage(withoutQuery(response.request().url())),
      status: response.status(),
    })
  const onRequestFailed = (request: {
    method(): string
    url(): string
    failure(): { errorText: string } | null
  }) =>
    networkLog.remember({
      method: request.method(),
      url: boundMessage(withoutQuery(request.url())),
      status: boundMessage(request.failure()?.errorText ?? "failed"),
    })
  page.on("console", onConsole)
  page.on("response", onResponse)
  page.on("requestfailed", onRequestFailed)

  const themeRoots = FLOW_MODES.flatMap((mode) =>
    axes.themes.flatMap((theme) =>
      axes.densities.map((density) => axes.root({ mode, theme, density })),
    ),
  )
  const themeClasses = [
    ...new Set(themeRoots.flatMap((root) => root.className.split(/\s+/).filter(Boolean))),
  ]
  const themeAttributes = [...new Set(themeRoots.flatMap((root) => Object.keys(root.attributes)))]
  let original: RootState | undefined
  let textScale: { evaluate(remove: (node: Node) => void): Promise<unknown> } | undefined

  const clearTextScale = async (): Promise<void> => {
    await textScale?.evaluate((node) => node.parentNode?.removeChild(node))
    textScale = undefined
  }

  const shoot = (checkpoint: FlowCheckpoint, signal: AbortSignal): Promise<Uint8Array> =>
    withCaptureFrame(page, checkpoint.frame, () =>
      page.screenshot({
        ...captureOptions(checkpoint.frame),
        animations: browserGateScreenshot.animations,
        caret: browserGateScreenshot.caret,
        scale: browserGateScreenshot.scale,
        mask: checkpoint.mask?.(page) ?? [],
        signal,
      }),
    )

  return {
    async act(checkpoint, signal) {
      await checkpoint.act(page, { signal })
    },
    async waitReady(checkpoint, timeoutMs, signal) {
      try {
        await checkpoint.ready(page).waitFor({ state: "visible", timeout: timeoutMs, signal })
      } catch (error) {
        if (error instanceof playwrightErrors.TimeoutError) return false
        throw error
      }
      await page.evaluate(() => document.fonts.ready.then(() => undefined))
      return true
    },
    waitHydrated: (timeoutMs) => waitForHydration(page, timeoutMs),
    async applyVariant(variant: PageVariant) {
      const root = axes.root(variant)
      const state = await page.evaluate(applyRootState, {
        strip: themeClasses,
        add: root.className.split(/\s+/).filter(Boolean),
        clear: themeAttributes,
        set: root.attributes,
      })
      original ??= state
      const preference = PREFERENCES[variant.preference]
      await page.emulateMedia({
        colorScheme: variant.mode,
        reducedMotion: preference.reducedMotion,
        forcedColors: preference.forcedColors,
        contrast: preference.contrast,
      })
      await clearTextScale()
      if (preference.textScale !== 1) {
        textScale = await page.addStyleTag({
          content: `html { font-size: ${preference.textScale * 100}% !important; }`,
        })
      }
    },
    async restoreVariant() {
      await clearTextScale()
      if (original !== undefined) {
        await page.evaluate(restoreRootState, original)
        original = undefined
      }
      await page.emulateMedia({
        colorScheme: browserGateUse.colorScheme,
        reducedMotion: browserGateUse.reducedMotion,
        forcedColors: "none",
        contrast: "no-preference",
      })
    },
    settle: () => settleAnimations(page),
    measureLayout: () => measureLayoutFacts(page),
    screenshot: shoot,
    ariaSnapshot: (signal) => page.ariaSnapshot({ signal }),
    async scanAxe(axeOptions) {
      const violations = await scanBrowserAxe(page, axeOptions)
      return violations.map((violation) => formatAxeViolations([violation]))
    },
    horizontalOverflow: () => horizontalOverflow(page),
    overlaysOutsideViewport: () => findOverlaysOutsideViewport(page),
    focusProblems: () => findFocusProblems(page),
    async comparePixels(checkpoint, name) {
      try {
        await withCaptureFrame(page, checkpoint.frame, () =>
          expect(page).toHaveScreenshot(`${name}.png`, {
            ...captureOptions(checkpoint.frame),
            mask: checkpoint.mask?.(page) ?? [],
          }),
        )
        return undefined
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return boundMessage(
          message.split("\n").find((line) => line.trim() !== "") ?? "The frame differs",
        )
      }
    },
    drainRuntimeErrors: () => runtimeErrors.drain(),
    async evidence(): Promise<EvidenceSnapshot> {
      const dom = await page.evaluate(snapshotDom, MAX_DOM_CHARS)
      return {
        dom,
        console: `${JSON.stringify(consoleLog.entries, null, 2)}\n`,
        network: `${JSON.stringify(networkLog.entries, null, 2)}\n`,
      }
    },
    dispose() {
      page.off("console", onConsole)
      page.off("response", onResponse)
      page.off("requestfailed", onRequestFailed)
    },
  }
}

// The functions below run in the page, so each is self-contained.

function applyRootState(change: {
  strip: readonly string[]
  add: readonly string[]
  clear: readonly string[]
  set: Readonly<Record<string, string>>
}): RootState {
  const root = document.documentElement
  const attributes: Record<string, string | null> = {}
  for (const name of [...change.clear, ...Object.keys(change.set)]) {
    attributes[name] = root.getAttribute(name)
  }
  const state = { className: root.className, attributes }
  root.classList.remove(...change.strip)
  root.classList.add(...change.add)
  for (const name of change.clear) root.removeAttribute(name)
  for (const [name, value] of Object.entries(change.set)) root.setAttribute(name, value)
  return state
}

function restoreRootState(state: RootState): void {
  const root = document.documentElement
  root.className = state.className
  for (const [name, value] of Object.entries(state.attributes)) {
    if (value === null) root.removeAttribute(name)
    else root.setAttribute(name, value)
  }
}
