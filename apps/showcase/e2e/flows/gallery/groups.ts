import { defineFlow } from "@plainworks/testkit/playwright"
import { GALLERY_GROUPS } from "../../fixtures/gallery/groups"
import { openGalleryGroup } from "../../support/gallery"
import { PAGE_FRAME } from "../frame"

/**
 * Every vendored atom and ui composite exactly as shipped, one gallery group per checkpoint. It
 * also runs at the tablet breakpoint and the 320 px reflow width. Nothing here restyles an atom, so
 * a frame moves only with a registry update or a theme change.
 */
export const galleryFlow = defineFlow({
  name: "gallery",
  covers: [
    "apps/showcase/e2e/flows/gallery/groups.ts",
    "apps/showcase/e2e/fixtures/gallery/**",
    "packages/{ui,elements,theme}/src/**",
  ],
  extraDevices: ["tablet", "reflow"],
  checkpoints: GALLERY_GROUPS.map((group) => ({
    name: group.id,
    act: (page) => openGalleryGroup(page, group.id),
    ready: (page) => page.getByRole("heading", { level: 1, name: group.title }),
    frame: PAGE_FRAME,
  })),
})
