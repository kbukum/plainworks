import type { Locator, Page } from "@playwright/test"

/**
 * Who draws the focus indicator: the page, as the widest solid outline or box-shadow ring around
 * the control in CSS px; the browser, on an internal control such as a date input's picker button;
 * or the caret of an editable text field that draws no ring, which WCAG 2.4.7 accepts.
 */
export type FocusIndicator =
  | { readonly drawnBy: "page"; readonly width: number }
  | { readonly drawnBy: "browser" }
  | { readonly drawnBy: "caret" }

/** What the page reports about its focused control. */
export interface FocusMeasurement {
  /** An accessible-ish name for failure messages. */
  readonly name: string
  readonly indicator: FocusIndicator
  /** How many of nine points sampled across the control hit the control rather than a cover. */
  readonly uncoveredSamples: number
}

// WCAG 2.4.7 needs a visible indicator; 2 CSS px is the smallest the kit's focus ring draws.
const MIN_INDICATOR_PX = 2

/** Turn a focus measurement into failure messages; empty when focus is visible and reachable. */
export function judgeFocus(measurement: FocusMeasurement | null): string[] {
  if (measurement === null) return ["no element has keyboard focus"]
  const failures: string[] = []
  const { indicator } = measurement
  if (indicator.drawnBy === "page" && indicator.width < MIN_INDICATOR_PX) {
    failures.push(
      `${measurement.name}: focus indicator is ${indicator.width}px wide, expected at least ${MIN_INDICATOR_PX}px`,
    )
  }
  if (measurement.uncoveredSamples === 0) {
    failures.push(`${measurement.name}: focused control is entirely covered by other content`)
  }
  return failures
}

/** Measure the focused control in the page. Runs in the browser. */
function measureFocus(): FocusMeasurement | null {
  const active = document.activeElement
  if (!(active instanceof HTMLElement) || active === document.body) return null
  // Read the settled indicator, not a frame of its transition.
  for (const animation of document.getAnimations()) {
    if (animation instanceof CSSTransition) animation.finish()
  }
  // A visually hidden input (a slider thumb's) shows focus on its visible host. Some controls draw
  // focus elsewhere: an input group's text control on the group, which reads as one field, and a
  // one-time-code input on its active slot. A button inside an input group keeps its own ring.
  const hidden = (element: HTMLElement): boolean => {
    const style = getComputedStyle(element)
    return (
      element.getBoundingClientRect().width < 2 ||
      style.clipPath.startsWith("inset(50%") ||
      style.clip === "rect(0px, 0px, 0px, 0px)"
    )
  }
  const host = (): HTMLElement | null => {
    if (active.matches("[data-slot='input-group-control']")) {
      return active.closest<HTMLElement>("[data-slot='input-group']")
    }
    if (active.matches("[data-slot='input-otp']")) {
      return (
        active
          .closest("[data-input-otp-container]")
          ?.querySelector<HTMLElement>("[data-slot='input-otp-slot'][data-active='true']") ?? null
      )
    }
    return null
  }
  let target: HTMLElement = host() ?? active
  while (hidden(target) && target.parentElement !== null) {
    target = target.parentElement
  }
  const style = getComputedStyle(target)
  const rings = [...style.boxShadow.matchAll(/0px 0px 0px (\d+(?:\.\d+)?)px/g)]
  const ring = Math.max(0, ...rings.map(([, spread]) => Number.parseFloat(spread ?? "0")))
  const outline = style.outlineStyle === "none" ? 0 : Number.parseFloat(style.outlineWidth)
  // Tab also walks a native date or time input's internal stops. On its picker button the input
  // loses `:focus-visible` and the browser draws the indicator inside its own shadow tree.
  const pickerStop =
    active instanceof HTMLInputElement &&
    ["date", "time", "datetime-local", "month", "week"].includes(active.type) &&
    !active.matches(":focus-visible")
  const TEXT_TYPES = ["text", "search", "email", "url", "tel", "password", "number"]
  const editableText =
    ((active instanceof HTMLInputElement && TEXT_TYPES.includes(active.type)) ||
      active instanceof HTMLTextAreaElement) &&
    !active.readOnly &&
    !active.disabled
  const width = Math.max(outline, ring)

  // WCAG 2.4.11: the control must not be entirely hidden by author content such as a sticky
  // header or a docked panel. Sample a 3x3 grid inside its box, clipped to the viewport.
  const box = target.getBoundingClientRect()
  const left = Math.max(box.left, 0)
  const right = Math.min(box.right, window.innerWidth)
  const top = Math.max(box.top, 0)
  const bottom = Math.min(box.bottom, window.innerHeight)
  let uncoveredSamples = 0
  if (right > left && bottom > top) {
    for (const x of [0.1, 0.5, 0.9]) {
      for (const y of [0.1, 0.5, 0.9]) {
        const hit = document.elementFromPoint(left + (right - left) * x, top + (bottom - top) * y)
        if (hit !== null && (target.contains(hit) || hit.contains(active))) uncoveredSamples++
      }
    }
  }
  return {
    name:
      active.getAttribute("aria-label") ||
      active.id ||
      active.textContent?.trim().slice(0, 40) ||
      active.tagName.toLowerCase(),
    indicator: pickerStop
      ? { drawnBy: "browser" }
      : // A literal: this function is serialized into the page, away from module constants.
        width < 2 && editableText
        ? { drawnBy: "caret" }
        : { drawnBy: "page", width },
    uncoveredSamples,
  }
}

/** Judge the focused control once, as it is now; empty when focus is visible and reachable. */
export async function findFocusProblems(page: Page): Promise<string[]> {
  return judgeFocus(await page.evaluate(measureFocus))
}

/**
 * Activate a control from the keyboard: focus it, then press Enter. An overlay opened this way
 * moves focus with `:focus-visible`, as it does for a keyboard user; a click would not, so a focus
 * check after a click measures no indicator at all.
 */
export async function pressWithKeyboard(control: Locator): Promise<void> {
  await control.focus()
  await control.press("Enter")
}
