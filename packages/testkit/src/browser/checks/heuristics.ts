import type { Finding } from "./findings"

/** A box in viewport CSS pixels. */
export interface LayoutBox {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** An element with its own text inside a box that may hide its overflow. */
export interface TextFact {
  readonly name: string
  readonly clientWidth: number
  readonly scrollWidth: number
  readonly clientHeight: number
  readonly scrollHeight: number
  /** The box hides horizontal overflow (`overflow-x: hidden | clip`). */
  readonly clipsX: boolean
  /** The box hides vertical overflow. */
  readonly clipsY: boolean
  /** The text truncates on purpose with `text-overflow: ellipsis`. */
  readonly ellipsis: boolean
  /** The text truncates on purpose with `line-clamp`. */
  readonly lineClamp: boolean
}

/** An interactive control. `key` is its child-index path, so a nested control shares a prefix. */
export interface TargetFact {
  readonly key: string
  readonly name: string
  /** The part of the control its clipping ancestors (a scrolling list) leave painted. */
  readonly box: LayoutBox
  /**
   * The control's center shows the control itself or another control of the same layer, rather
   * than a surface that hides it, such as an open overlay. Only exposed controls can overlap.
   */
  readonly exposed: boolean
  /** The control sits in fixed or sticky chrome, rather than in content that scrolls under it. */
  readonly pinned: boolean
}

/** A focusable control and what, if anything, covers its center. */
export interface FocusableFact {
  readonly name: string
  /** The fixed or sticky element drawn over the control's center, or `null` when uncovered. */
  readonly coveredBy: {
    readonly name: string
    readonly overlay: boolean
    /**
     * The chrome sits inside the page's `scroll-padding` and the page has room to scroll, so
     * focusing the control scrolls it clear, as WCAG 2.4.11 judges it.
     */
    readonly revealedOnFocus: boolean
  } | null
}

/** An `<img>` and its load state. */
export interface ImageFact {
  readonly name: string
  readonly complete: boolean
  readonly naturalWidth: number
  readonly inViewport: boolean
}

/** An element whose box is compared between readiness and capture. */
export interface TrackedBox {
  readonly key: string
  readonly name: string
  readonly box: LayoutBox
}

/** What the page reports about its layout; `collectLayoutFacts` measures it in the browser. */
export interface LayoutFacts {
  readonly texts: readonly TextFact[]
  readonly targets: readonly TargetFact[]
  readonly focusables: readonly FocusableFact[]
  readonly images: readonly ImageFact[]
  readonly tracked: readonly TrackedBox[]
}

// Glyph overhang and sub-pixel rounding can put a fitting line one or two pixels past its box.
const CLIP_SLACK_PX = 2
// Adjacent controls can share a rounded edge without drawing over each other.
const OVERLAP_SLACK_PX = 1
// A box that moves less than this between two measurements is rounding, not a shift.
const SHIFT_SLACK_PX = 1

/** Text whose box hides its overflow without truncating on purpose loses content silently. */
export function judgeClippedText(texts: readonly TextFact[]): Finding[] {
  return texts.flatMap((fact) => {
    if (fact.ellipsis || fact.lineClamp) return []
    const wider = fact.scrollWidth - fact.clientWidth
    const taller = fact.scrollHeight - fact.clientHeight
    if (fact.clipsX && wider > CLIP_SLACK_PX) {
      return [clipped(fact, `${wider}px wider than its ${fact.clientWidth}px box`)]
    }
    if (fact.clipsY && taller > CLIP_SLACK_PX) {
      return [clipped(fact, `${taller}px taller than its ${fact.clientHeight}px box`)]
    }
    return []
  })
}

function clipped(fact: TextFact, detail: string): Finding {
  return { check: "clipped-text", message: `"${fact.name}" is cut off: ${detail}` }
}

/**
 * Two visible controls drawn over each other: a user cannot tell which one a tap reaches. A control
 * nested in another (an action inside a row link) and one under an open overlay are left out.
 * Content scrolling under pinned chrome is left to {@link judgeObscuredFocusables}: the chrome
 * always wins the tap, and the question is whether focus can scroll the content clear.
 */
export function judgeOverlappingTargets(targets: readonly TargetFact[]): Finding[] {
  const visible = targets.filter((target) => target.exposed)
  const findings: Finding[] = []
  for (const [index, first] of visible.entries()) {
    for (const second of visible.slice(index + 1)) {
      if (nested(first.key, second.key) || first.pinned !== second.pinned) continue
      const width =
        Math.min(right(first.box), right(second.box)) - Math.max(first.box.x, second.box.x)
      const height =
        Math.min(bottom(first.box), bottom(second.box)) - Math.max(first.box.y, second.box.y)
      if (width > OVERLAP_SLACK_PX && height > OVERLAP_SLACK_PX) {
        findings.push({
          check: "overlapping-targets",
          message: `"${first.name}" and "${second.name}" overlap by ${Math.round(width)}x${Math.round(height)}px`,
        })
      }
    }
  }
  return findings
}

const nested = (first: string, second: string): boolean =>
  first.startsWith(`${second}.`) || second.startsWith(`${first}.`)
const right = (box: LayoutBox): number => box.x + box.width
const bottom = (box: LayoutBox): number => box.y + box.height

/**
 * Focusable content under fixed or sticky chrome (a docked bar, a toast region) that stays hidden
 * when focused. An open overlay covers the page on purpose, and content that focusing scrolls clear
 * of the chrome is only below the fold, so neither counts.
 */
export function judgeObscuredFocusables(focusables: readonly FocusableFact[]): Finding[] {
  return focusables.flatMap(({ name, coveredBy }) =>
    coveredBy === null || coveredBy.overlay || coveredBy.revealedOnFocus
      ? []
      : [
          {
            check: "obscured-focusable",
            message: `"${name}" is covered by fixed chrome "${coveredBy.name}"`,
          },
        ],
  )
}

/** An image that failed to decode, or a visible one still loading when the frame is taken. */
export function judgeBrokenImages(images: readonly ImageFact[]): Finding[] {
  return images.flatMap((image): Finding[] => {
    if (image.complete && image.naturalWidth === 0) {
      return [{ check: "broken-image", message: `"${image.name}" failed to load` }]
    }
    if (!image.complete && image.inViewport) {
      return [{ check: "broken-image", message: `"${image.name}" is still loading at capture` }]
    }
    return []
  })
}

/**
 * Elements that moved or resized between readiness and capture: content that lands late, such as
 * a font swap or an unreserved image slot, and that a user sees jump. New elements are not shifts.
 */
export function judgeLayoutShift(
  before: readonly TrackedBox[],
  after: readonly TrackedBox[],
): Finding[] {
  const earlier = new Map(before.map((tracked) => [tracked.key, tracked.box]))
  return after.flatMap((tracked): Finding[] => {
    const was = earlier.get(tracked.key)
    if (was === undefined) return []
    const dx = Math.round(tracked.box.x - was.x)
    const dy = Math.round(tracked.box.y - was.y)
    const dw = Math.round(tracked.box.width - was.width)
    const dh = Math.round(tracked.box.height - was.height)
    if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dw), Math.abs(dh)) <= SHIFT_SLACK_PX) {
      return []
    }
    const moved = dx !== 0 || dy !== 0 ? `moved ${dx},${dy}px` : ""
    const resized = dw !== 0 || dh !== 0 ? `resized ${dw},${dh}px` : ""
    const change = [moved, resized].filter(Boolean).join(" and ")
    return [
      {
        check: "layout-shift",
        message: `"${tracked.name}" ${change} after the checkpoint was ready`,
      },
    ]
  })
}

/** Run every single-frame layout heuristic over one measurement. */
export function judgeLayout(facts: LayoutFacts): Finding[] {
  return [
    ...judgeClippedText(facts.texts),
    ...judgeOverlappingTargets(facts.targets),
    ...judgeObscuredFocusables(facts.focusables),
    ...judgeBrokenImages(facts.images),
  ]
}
