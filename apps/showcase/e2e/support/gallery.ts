import type { BrowserAxeOptions } from "@plainworks/testkit/playwright"
import { expect, type Page } from "@playwright/test"
import { GALLERY_GROUPS, type GalleryGroupId } from "../fixtures/gallery/groups"
import { openFixturePage } from "./fixture-page"

/** Open one gallery group and wait until it has rendered. */
export async function openGalleryGroup(page: Page, id: GalleryGroupId): Promise<void> {
  const group = GALLERY_GROUPS.find((candidate) => candidate.id === id)
  if (group === undefined) throw new RangeError(`Unknown gallery group: ${id}`)
  await openFixturePage(page, "gallery", `?group=${id}`)
  await expect(page.getByRole("heading", { level: 1, name: group.title })).toBeVisible({
    timeout: 30_000,
  })
}

/** An overlay the gallery opens from a marked trigger, and the popup that proves it opened. */
export interface GalleryOverlay {
  readonly group: GalleryGroupId
  /** The `data-gallery-trigger` value. */
  readonly trigger: string
  readonly action: "click" | "hover" | "contextmenu"
  readonly popup: (page: Page) => ReturnType<Page["locator"]>
  /** Axe options for the open overlay, when a vendored primitive needs a scoped exclusion. */
  readonly axe?: BrowserAxeOptions
}

/** Every overlay atom and composite the gallery can open. */
export const GALLERY_OVERLAYS: readonly GalleryOverlay[] = [
  {
    group: "form-controls",
    trigger: "select",
    action: "click",
    popup: (page) => page.getByRole("listbox"),
    // The same Base UI focus guards as the navigation menu, which bracket the listbox on the mobile
    // screen. The listbox itself is still scanned.
    axe: { exclude: ["[data-base-ui-focus-guard]"] },
  },
  {
    group: "navigation",
    trigger: "menubar",
    action: "click",
    popup: (page) => page.getByRole("menu"),
  },
  {
    group: "navigation",
    trigger: "navigation-menu",
    action: "click",
    popup: (page) => page.getByRole("link", { name: "Analytics" }),
    // Base UI brackets the open menu with `aria-hidden` focus guards that stay tabbable so focus
    // can wrap. They forward focus at once and never hold it, so axe's `aria-hidden-focus` is a
    // false positive on them alone. The menu itself is still scanned.
    axe: { exclude: ["[data-base-ui-focus-guard]"] },
  },
  {
    group: "overlays",
    trigger: "dialog",
    action: "click",
    popup: (page) => page.getByRole("dialog", { name: "Edit profile" }),
  },
  {
    group: "overlays",
    trigger: "alert-dialog",
    action: "click",
    popup: (page) => page.getByRole("alertdialog", { name: "Delete project?" }),
  },
  {
    group: "overlays",
    trigger: "sheet",
    action: "click",
    popup: (page) => page.getByRole("dialog", { name: "Filters" }),
  },
  {
    group: "overlays",
    trigger: "popover",
    action: "click",
    popup: (page) => page.getByRole("dialog", { name: "Dimensions" }),
  },
  {
    group: "overlays",
    trigger: "dropdown-menu",
    action: "click",
    popup: (page) => page.getByRole("menu"),
  },
  {
    group: "overlays",
    trigger: "context-menu",
    action: "contextmenu",
    popup: (page) => page.getByRole("menu"),
  },
  {
    group: "overlays",
    trigger: "hover-card",
    action: "hover",
    popup: (page) => page.getByText("Host-independent React kit."),
  },
  {
    group: "overlays",
    trigger: "tooltip",
    action: "hover",
    // Base UI tooltips are visual-only (no `tooltip` role), so match the popup text.
    popup: (page) => page.getByText("Add to library"),
  },
  {
    group: "overlays",
    trigger: "command",
    action: "click",
    popup: (page) => page.getByRole("dialog"),
  },
  {
    group: "composites",
    trigger: "modal",
    action: "click",
    popup: (page) => page.getByRole("dialog", { name: "Confirm order" }),
  },
  {
    group: "composites",
    trigger: "drawer",
    action: "click",
    popup: (page) => page.getByRole("dialog", { name: "Order details" }),
  },
  {
    group: "composites",
    trigger: "account-menu",
    action: "click",
    popup: (page) => page.getByRole("menu"),
  },
  {
    group: "composites",
    trigger: "command-palette",
    action: "click",
    popup: (page) => page.getByRole("dialog", { name: "Command menu" }),
  },
]

/** Open `overlay` in an already open gallery group, and wait for its popup. */
export async function openGalleryOverlay(page: Page, overlay: GalleryOverlay): Promise<void> {
  const marked = page.locator(`[data-gallery-trigger="${overlay.trigger}"]`)
  // A wrapper marks a span; the control is the button or combobox inside it.
  const target =
    overlay.action === "click"
      ? marked.locator("xpath=self::button | self::a | .//button | .//*[@role='combobox']").first()
      : marked
  await target.scrollIntoViewIfNeeded()
  if (overlay.action === "click") await target.click()
  else if (overlay.action === "hover") await target.hover()
  else await target.click({ button: "right" })
  await expect(overlay.popup(page).first()).toBeVisible()
}
