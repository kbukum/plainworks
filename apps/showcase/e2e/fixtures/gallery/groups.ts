/**
 * The component gallery's groups, one page each (`/gallery?group=<id>`). Plain data, so the
 * browser entry and the Playwright specs share one list.
 */
export const GALLERY_GROUPS = [
  { id: "form-controls", title: "Form controls" },
  { id: "display", title: "Display" },
  { id: "feedback", title: "Feedback" },
  { id: "navigation", title: "Navigation" },
  { id: "overlays", title: "Overlays" },
  { id: "data", title: "Data" },
  { id: "layout", title: "Layout" },
  { id: "composites", title: "ui composites" },
] as const

/** A gallery group id. */
export type GalleryGroupId = (typeof GALLERY_GROUPS)[number]["id"]
