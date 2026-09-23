"use client"

// Coordinates the shared `document.body` bottom padding across every mounted rail. Each rail holds
// one reservation; the body reserves the host's original padding plus the sum of all live
// reservations, and the original is restored only when the last reservation is released. A single
// owner is required because `document.body` is global — two rails each snapshotting and restoring
// it independently would clobber one another's padding.
//
//   rail A mounts   -> reserve(36)  body = base + 36
//   rail B mounts   -> reserve(36)  body = base + 72
//   rail A unmounts -> release      body = base + 36   (B still reserved)
//   rail B unmounts -> release      body = base        (original restored)

let originalInline = ""
let basePx = 0
const reservations = new Map<symbol, number>()

function totalReserved(): number {
  let total = 0
  for (const px of reservations.values()) total += px
  return total
}

/**
 * Reserve `px` of bottom padding on the shared body so a fixed rail never covers page content.
 * Returns a release function that drops this reservation and restores the host's original padding
 * once no rail holds one. Safe with multiple concurrent rails; a no-op without a DOM.
 */
export function reserveBodyPadding(px: number): () => void {
  if (typeof document === "undefined" || typeof window === "undefined") return () => {}
  if (reservations.size === 0) {
    originalInline = document.body.style.paddingBottom
    basePx = Number.parseFloat(window.getComputedStyle(document.body).paddingBottom) || 0
  }
  const token = Symbol("rail-reservation")
  reservations.set(token, px)
  document.body.style.paddingBottom = `${basePx + totalReserved()}px`
  return () => {
    if (!reservations.delete(token)) return
    if (reservations.size === 0) {
      document.body.style.paddingBottom = originalInline
      return
    }
    document.body.style.paddingBottom = `${basePx + totalReserved()}px`
  }
}
