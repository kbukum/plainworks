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
 * visually hidden text (a screen-reader-only label) is never judged as clipped.
 *
 * Open overlays (a popup role, or an out-of-flow panel an expanded trigger controls) cover the page
 * on purpose, so a cover that is the popup, its positioner, or its backdrop is marked as an
 * overlay. Each control's `layer` is the nearest fixed or sticky chrome it sits in; only controls
 * in the same layer can overlap. Focus scrolling is modeled through every scroller the control sits
 * in, nearest first and the document last: each scrollport minus its `scroll-padding`, plus the
 * control's `scroll-margin`, as far as each can still scroll.
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
  // Tracked boxes are in document coordinates, so a scroll between two measurements (a full-page
  // capture starts from the top) is not mistaken for content that moved.
  const boxOf = (element: Element) => {
    const box = element.getBoundingClientRect()
    return {
      x: box.x + window.scrollX,
      y: box.y + window.scrollY,
      width: box.width,
      height: box.height,
    }
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

  // Every open overlay: a popup role, or an out-of-flow panel an expanded trigger controls (a
  // disclosure navigation menu). Page content under one is covered on purpose.
  const overlays = new Set<Element>(document.querySelectorAll(OVERLAY))
  for (const trigger of document.querySelectorAll("[aria-expanded='true'][aria-controls]")) {
    for (const id of (trigger.getAttribute("aria-controls") ?? "").split(/\s+/)) {
      const panel = id === "" ? null : document.getElementById(id)
      if (panel === null) continue
      const position = getComputedStyle(panel).position
      if (position === "absolute" || position === "fixed") overlays.add(panel)
    }
  }
  const overlayOf = (element: Element): Element | null => {
    for (let node: Element | null = element; node !== null; node = node.parentElement) {
      if (overlays.has(node)) return node
    }
    return null
  }
  // A backdrop is a layer with nothing of its own to show (hidden from assistive technology,
  // presentational, or empty) that an open overlay paints over: the overlay's center hits the
  // overlay before it.
  const empty = (cover: Element): boolean =>
    hiddenFromUsers(cover) ||
    ["presentation", "none"].includes(cover.getAttribute("role") ?? "") ||
    (cover.childElementCount === 0 && (cover.textContent ?? "").trim() === "")
  const backdropOf = (cover: Element, overlay: Element): boolean => {
    const box = overlay.getBoundingClientRect()
    const x = box.left + box.width / 2
    const y = box.top + box.height / 2
    const stack = document.elementsFromPoint(x, y)
    const above = stack.findIndex((node) => overlay.contains(node))
    const under = stack.indexOf(cover)
    return above !== -1 && under > above
  }
  // A positioner holds the popup and is no bigger than it, so a sticky header that happens to
  // contain an open tooltip stays page chrome.
  const positionerOf = (cover: Element, overlay: Element): boolean => {
    if (!cover.contains(overlay)) return false
    const own = cover.getBoundingClientRect()
    const popup = overlay.getBoundingClientRect()
    return own.width <= popup.width + 1 && own.height <= popup.height + 1
  }
  // A cover is part of an open overlay when it is the popup, its positioner, or the backdrop laid
  // under it.
  const belongsToOverlay = (cover: Element): boolean =>
    overlayOf(cover) !== null ||
    [...overlays].some(
      (overlay) => positionerOf(cover, overlay) || (empty(cover) && backdropOf(cover, overlay)),
    )

  // Rounding slack, in CSS pixels, for comparing a cover's edge with a control's center.
  const SLACK = 1
  interface Scrollport {
    readonly low: { readonly x: number; readonly y: number }
    readonly high: { readonly x: number; readonly y: number }
    readonly back: { readonly x: number; readonly y: number }
    readonly forward: { readonly x: number; readonly y: number }
  }
  const px = (value: string): number => Number.parseFloat(value) || 0
  const scrolls = (value: string): boolean => value === "auto" || value === "scroll"
  const portOf = (
    left: number,
    top: number,
    width: number,
    height: number,
    style: CSSStyleDeclaration,
    scroller: Element,
  ): Scrollport => ({
    low: { x: left + px(style.scrollPaddingLeft), y: top + px(style.scrollPaddingTop) },
    high: {
      x: left + width - px(style.scrollPaddingRight),
      y: top + height - px(style.scrollPaddingBottom),
    },
    back: { x: scroller.scrollLeft, y: scroller.scrollTop },
    forward: {
      x: scroller.scrollWidth - scroller.scrollLeft - width,
      y: scroller.scrollHeight - scroller.scrollTop - height,
    },
  })
  // Every scroller focus moves to bring the control into view, nearest first: each scrolling
  // ancestor, then the document. Fixed or sticky chrome does not move with the scrollers outside
  // it, so the chain stops there.
  const scrollportsOf = (element: Element): Scrollport[] => {
    const ports: Scrollport[] = []
    for (let node = element.parentElement; node !== null; node = node.parentElement) {
      if (node === document.body || node === document.documentElement) break
      const style = getComputedStyle(node)
      const scrollsY = scrolls(style.overflowY) && node.scrollHeight > node.clientHeight
      const scrollsX = scrolls(style.overflowX) && node.scrollWidth > node.clientWidth
      if (scrollsX || scrollsY) {
        const box = node.getBoundingClientRect()
        ports.push(
          portOf(
            box.left + node.clientLeft,
            box.top + node.clientTop,
            node.clientWidth,
            node.clientHeight,
            style,
            node,
          ),
        )
      }
      if (style.position === "fixed" || style.position === "sticky") return ports
    }
    const scroller = document.scrollingElement ?? document.documentElement
    ports.push(
      portOf(
        0,
        0,
        viewportWidth,
        viewportHeight,
        getComputedStyle(document.documentElement),
        scroller,
      ),
    )
    return ports
  }
  // How far focus scrolls along one axis: nothing when the control's margin box already fits, else
  // to its nearest edge (its start when it is larger than the scrollport), as far as it can scroll.
  const focusScroll = (
    start: number,
    end: number,
    low: number,
    high: number,
    back: number,
    forward: number,
  ): number => {
    const wanted =
      end - start > high - low || start < low ? start - low : end > high ? end - high : 0
    return Math.min(Math.max(wanted, -back), forward)
  }
  // Focus scrolls the control into each scrollport in turn, minus its `scroll-padding` and plus the
  // control's `scroll-margin`. Pinned covers stay put, so the control is revealed when its scrolled
  // center no longer sits under the cover.
  const revealedOnFocus = (element: Element, cover: Element): boolean => {
    const ports = scrollportsOf(element)
    if (ports.length === 0) return false
    const style = getComputedStyle(element)
    const own = element.getBoundingClientRect()
    let box = { left: own.left, top: own.top, right: own.right, bottom: own.bottom }
    for (const port of ports) {
      const dx = focusScroll(
        box.left - px(style.scrollMarginLeft),
        box.right + px(style.scrollMarginRight),
        port.low.x,
        port.high.x,
        port.back.x,
        port.forward.x,
      )
      const dy = focusScroll(
        box.top - px(style.scrollMarginTop),
        box.bottom + px(style.scrollMarginBottom),
        port.low.y,
        port.high.y,
        port.back.y,
        port.forward.y,
      )
      box = {
        left: box.left - dx,
        top: box.top - dy,
        right: box.right - dx,
        bottom: box.bottom - dy,
      }
    }
    const centerX = (box.left + box.right) / 2
    const centerY = (box.top + box.bottom) / 2
    const chrome = cover.getBoundingClientRect()
    return (
      centerX < chrome.left - SLACK ||
      centerX > chrome.right + SLACK ||
      centerY < chrome.top - SLACK ||
      centerY > chrome.bottom + SLACK
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
      reachesSelf || (hitControl !== null && overlayOf(hitControl) === overlayOf(element))
    const chrome = pinned(element)
    facts.targets.push({
      key: keyOf(element),
      name: nameOf(element),
      box: paintedBoxOf(element),
      exposed,
      layer: chrome === null ? null : keyOf(chrome),
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
            overlay: belongsToOverlay(cover),
            revealedOnFocus: revealedOnFocus(element, cover),
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
