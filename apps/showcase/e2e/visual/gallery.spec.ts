import {
  COMPACT_MATRIX,
  DIALOG_MATRIX,
  FULL_MATRIX,
  planVisualTests,
  runVisualTest,
  VISUAL_TAG,
  type VisualCapture,
  type VisualSurface,
} from "@plainworks/testkit/browser"
import { COLOR_SCHEMES } from "@plainworks/theme"
import { GALLERY_GROUPS } from "../fixtures/gallery/groups"
import { GALLERY_OVERLAYS, openGalleryGroup, openGalleryOverlay } from "../support/gallery"
import { test } from "../support/gate"

// Every vendored atom and ui composite exactly as shipped: each gallery group at every gate
// viewport in both modes, each overlay open, and each accent scheme. Nothing here restyles an
// atom, so a baseline moves only with a registry update or a theme change.

// The gallery page docks no fixed chrome, so a full-page capture hides nothing.
const FIXTURE_CAPTURE: VisualCapture = { kind: "full-page", hideFixed: [] }

const groups: readonly VisualSurface[] = GALLERY_GROUPS.map((group) => ({
  name: `gallery-${group.id}`,
  matrix: FULL_MATRIX,
  capture: FIXTURE_CAPTURE,
  arrange: (page) => openGalleryGroup(page, group.id),
}))

// Modal surfaces also capture on a short landscape screen, where a tall one must scroll.
const MODALS = new Set(["dialog", "alert-dialog", "command", "modal", "sheet", "drawer"])

const overlays: readonly VisualSurface[] = GALLERY_OVERLAYS.map((overlay) => ({
  name: `gallery-overlay-${overlay.trigger}`,
  matrix: MODALS.has(overlay.trigger) ? DIALOG_MATRIX : COMPACT_MATRIX,
  ...(overlay.axe === undefined ? {} : { axe: overlay.axe }),
  arrange: async (page) => {
    await openGalleryGroup(page, overlay.group)
    await openGalleryOverlay(page, overlay)
  },
}))

const accents: readonly VisualSurface[] = COLOR_SCHEMES.map((scheme) => ({
  name: `gallery-accent-${scheme}`,
  matrix: { modes: FULL_MATRIX.modes, viewports: ["desktop"] },
  capture: FIXTURE_CAPTURE,
  arrange: async (page) => {
    await openGalleryGroup(page, "form-controls")
    await page.evaluate((next) => {
      const root = document.documentElement
      for (const name of [...root.classList]) {
        if (name.startsWith("theme-")) root.classList.remove(name)
      }
      root.classList.add(`theme-${next}`)
    }, scheme)
  },
}))

for (const planned of planVisualTests([...groups, ...overlays, ...accents])) {
  test(planned.title, { tag: VISUAL_TAG }, ({ page, runtimeErrors }) =>
    runVisualTest({ page, runtimeErrors }, planned),
  )
}
