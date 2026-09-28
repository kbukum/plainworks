import type { Page } from "@playwright/test"
import type { LayoutFacts } from "./heuristics"

// Bounds the measurement on a huge page (a long table), so one checkpoint stays fast and small.
const MAX_ELEMENTS = 4_000
const MAX_TRACKED = 400

/** Measure what the layout heuristics judge, in the live page. */
export function measureLayoutFacts(page: Page): Promise<LayoutFacts> {
  return page.evaluate(collectLayoutFacts, { maxElements: MAX_ELEMENTS, maxTracked: MAX_TRACKED })
}

/**
 * Collect {@link LayoutFacts} from the document. Runs in the browser, so it names nothing outside
 * its own body. Content under `inert` or `aria-hidden` (the page behind a modal) is left out, and
 * visually hidden text (a screen-reader-only label) is never judged as clipped. Focus scrolling is
 * modeled on the document scroller: the viewport minus the root `scroll-padding` is where focus
 * brings a control, as far as the page can still scroll.
 */
function collectLayoutFacts(limits: { maxElements: number; maxTracked: number }): LayoutFacts {
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const INTERACTIVE =
    "a[href], button, input:not([type='hidden']), select, textarea, summary, [role='button'], [role='link'], [role='checkbox'], [role='radio'], [role='switch'], [role='tab'], [role='menuitem'], [role='option'], [role='combobox'], [role='slider'], [tabindex]:not([tabindex='-1'])"
  const OVERLAY =
    "[role='dialog'], [role='alertdialog'], [role='menu'], [role='listbox'], [role='tooltip']"

  const keys = new WeakMap<Element, string>()
  const keyOf = (element: Element): string => {
    const known = keys.get(element)
    if (known !== undefined) return known
    const parent = element.parentElement
    const key =
      parent === null
        ? "0"
        : `${keyOf(parent)}.${Array.prototype.indexOf.call(parent.children, element)}`
    keys.set(element, key)
    return key
  }
  const nameOf = (element: Element): string => {
    const label =
      element.getAttribute("aria-label") ||
      element.getAttribute("alt") ||
      element.textContent?.replace(/\s+/g, " ").trim().slice(0, 40) ||
      element.getAttribute("title") ||
      element.id
    return label || element.tagName.toLowerCase()
  }
  const hiddenFromUsers = (element: Element): boolean =>
    element.closest("[inert], [aria-hidden='true']") !== null
  const visuallyHidden = (element: HTMLElement, style: CSSStyleDeclaration): boolean => {
    const box = element.getBoundingClientRect()
    return (
      box.width <= 1 ||
      box.height <= 1 ||
      style.visibility === "hidden" ||
      style.clipPath.startsWith("inset(50%") ||
      style.clip === "rect(0px, 0px, 0px, 0px)"
    )
  }
  const clips = (value: string): boolean => value === "hidden" || value === "clip"
  const ownText = (element: Element): boolean =>
    [...element.childNodes].some(
      (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim() !== "",
    )
  const boxOf = (element: Element) => {
    const box = element.getBoundingClientRect()
    return { x: box.x, y: box.y, width: box.width, height: box.height }
  }
  // A scrolling list or a clipped card paints only its padding box, so a control scrolled past its
  // edge draws nothing outside it. An empty result means nothing of the control is painted.
  const paintedBoxOf = (element: Element) => {
    const own = element.getBoundingClientRect()
    let left = own.left
    let top = own.top
    let right = own.right
    let bottom = own.bottom
    for (let node = element.parentElement; node !== null; node = node.parentElement) {
      const style = getComputedStyle(node)
      if (style.position === "fixed") break
      if (style.overflowX === "visible" && style.overflowY === "visible") continue
      const clip = node.getBoundingClientRect()
      const clipLeft = clip.left + node.clientLeft
      const clipTop = clip.top + node.clientTop
      if (style.overflowX !== "visible") {
        left = Math.max(left, clipLeft)
        right = Math.min(right, clipLeft + node.clientWidth)
      }
      if (style.overflowY !== "visible") {
        top = Math.max(top, clipTop)
        bottom = Math.min(bottom, clipTop + node.clientHeight)
      }
    }
    return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
  }
  const pinned = (element: Element): Element | null => {
    for (let node: Element | null = element; node !== null; node = node.parentElement) {
      const position = getComputedStyle(node).position
      if (position === "fixed" || position === "sticky") return node
    }
    return null
  }

  const scroller = document.scrollingElement ?? document.documentElement
  const rootStyle = getComputedStyle(document.documentElement)
  const padding = (value: string): number => Number.parseFloat(value) || 0
  const safe = {
    top: padding(rootStyle.scrollPaddingTop),
    bottom: viewportHeight - padding(rootStyle.scrollPaddingBottom),
    left: padding(rootStyle.scrollPaddingLeft),
    right: viewportWidth - padding(rootStyle.scrollPaddingRight),
  }
  const room = {
    up: scroller.scrollTop,
    down: scroller.scrollHeight - scroller.scrollTop - viewportHeight,
    left: scroller.scrollLeft,
    right: scroller.scrollWidth - scroller.scrollLeft - viewportWidth,
  }
  // Rounding slack, in CSS pixels, for comparing the chrome's edge with the scroll padding.
  const SLACK = 1
  const fitsAxis = (
    start: number,
    end: number,
    low: number,
    high: number,
    back: number,
    forward: number,
  ): boolean => {
    if (end - start > high - low + SLACK) return false
    if (end > high) return end - high <= forward + SLACK
    if (start < low) return low - start <= back + SLACK
    return true
  }
  // Focus scrolls a control into the padded viewport, so chrome that sits wholly in the padding
  // band cannot cover it once focused, as long as the page can scroll that far.
  const revealedOnFocus = (element: Element, cover: Element): boolean => {
    const chrome = cover.getBoundingClientRect()
    const inPadding =
      chrome.top >= safe.bottom - SLACK ||
      chrome.bottom <= safe.top + SLACK ||
      chrome.left >= safe.right - SLACK ||
      chrome.right <= safe.left + SLACK
    if (!inPadding) return false
    const box = element.getBoundingClientRect()
    return (
      fitsAxis(box.top, box.bottom, safe.top, safe.bottom, room.up, room.down) &&
      fitsAxis(box.left, box.right, safe.left, safe.right, room.left, room.right)
    )
  }

  const facts: {
    texts: LayoutFacts["texts"][number][]
    targets: LayoutFacts["targets"][number][]
    focusables: LayoutFacts["focusables"][number][]
    images: LayoutFacts["images"][number][]
    tracked: LayoutFacts["tracked"][number][]
  } = { texts: [], targets: [], focusables: [], images: [], tracked: [] }

  const elements = [...document.body.querySelectorAll<HTMLElement>("*")].slice(
    0,
    limits.maxElements,
  )
  for (const element of elements) {
    if (hiddenFromUsers(element)) continue
    const style = getComputedStyle(element)
    if (style.display === "none" || visuallyHidden(element, style)) continue

    if (ownText(element)) {
      facts.texts.push({
        name: nameOf(element),
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        clipsX: clips(style.overflowX),
        clipsY: clips(style.overflowY),
        ellipsis: style.textOverflow === "ellipsis",
        lineClamp: style.webkitLineClamp !== "none" && style.webkitLineClamp !== "",
      })
    }

    if (element instanceof HTMLImageElement) {
      const box = element.getBoundingClientRect()
      facts.images.push({
        name: element.getAttribute("alt") || element.currentSrc.split("/").pop() || "img",
        complete: element.complete,
        naturalWidth: element.naturalWidth,
        inViewport:
          box.bottom > 0 && box.top < viewportHeight && box.right > 0 && box.left < viewportWidth,
      })
    }

    if (!element.matches(INTERACTIVE)) continue
    const box = element.getBoundingClientRect()
    const centerX = box.left + box.width / 2
    const centerY = box.top + box.height / 2
    const inViewport =
      centerX >= 0 && centerX < viewportWidth && centerY >= 0 && centerY < viewportHeight
    const hit = inViewport ? document.elementFromPoint(centerX, centerY) : null
    const reachesSelf = hit !== null && (element.contains(hit) || hit.contains(element))
    // A control drawn over this one is an overlap to report; an overlay drawn over it is not.
    const hitControl = hit?.closest(INTERACTIVE) ?? null
    const exposed =
      reachesSelf ||
      (hitControl !== null && hitControl.closest(OVERLAY) === element.closest(OVERLAY))
    const inChrome = pinned(element) !== null
    facts.targets.push({
      key: keyOf(element),
      name: nameOf(element),
      box: paintedBoxOf(element),
      exposed,
      pinned: inChrome,
    })
    if (facts.tracked.length < limits.maxTracked) {
      facts.tracked.push({ key: keyOf(element), name: nameOf(element), box: boxOf(element) })
    }
    if (hit === null || reachesSelf) {
      facts.focusables.push({ name: nameOf(element), coveredBy: null })
      continue
    }
    const cover = pinned(hit)
    // Content that sits inside the same pinned chrome scrolls with it, so it is never covered by
    // it.
    const coveredBy =
      cover === null || cover.contains(element)
        ? null
        : {
            name: nameOf(cover),
            overlay: cover.closest(OVERLAY) !== null || cover.matches(OVERLAY),
            revealedOnFocus: !inChrome && revealedOnFocus(element, cover),
          }
    facts.focusables.push({ name: nameOf(element), coveredBy })
  }

  for (const heading of document.querySelectorAll("h1, h2, h3, img")) {
    if (facts.tracked.length >= limits.maxTracked) break
    if (hiddenFromUsers(heading)) continue
    facts.tracked.push({ key: keyOf(heading), name: nameOf(heading), box: boxOf(heading) })
  }
  return facts
}
