import { defineFlow, type FlowCheckpoint } from "@plainworks/testkit/playwright"
import {
  GALLERY_OVERLAYS,
  type GalleryOverlay,
  openGalleryGroup,
  openGalleryOverlay,
} from "../../support/gallery"

// Modal surfaces also run on the short landscape phone, where a tall one must scroll.
const MODALS = new Set(["dialog", "alert-dialog", "command", "modal", "sheet", "drawer"])

const open = (overlay: GalleryOverlay): FlowCheckpoint => ({
  name: overlay.trigger,
  act: async (page) => {
    await openGalleryGroup(page, overlay.group)
    await openGalleryOverlay(page, overlay)
  },
  ready: (page) => overlay.popup(page).first(),
  ...(overlay.axe === undefined ? {} : { axe: overlay.axe }),
})

const COVERS = [
  "apps/showcase/e2e/flows/gallery/overlays.ts",
  "apps/showcase/e2e/support/gallery.ts",
  "apps/showcase/e2e/fixtures/gallery/**",
  "packages/ui/src/client/overlays/**",
  "packages/{elements,theme}/src/**",
]

/** Every popup atom of the gallery open from its trigger: menus, popovers, and tooltips. */
export const galleryPopupsFlow = defineFlow({
  name: "gallery-popups",
  covers: COVERS,
  checkpoints: GALLERY_OVERLAYS.filter((overlay) => !MODALS.has(overlay.trigger)).map(open),
})

/** Every modal atom and composite of the gallery open from its trigger. */
export const galleryModalsFlow = defineFlow({
  name: "gallery-modals",
  covers: COVERS,
  extraDevices: ["landscape"],
  checkpoints: GALLERY_OVERLAYS.filter((overlay) => MODALS.has(overlay.trigger)).map(open),
})
