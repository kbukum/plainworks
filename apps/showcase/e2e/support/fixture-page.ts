import type { Page } from "@playwright/test"

/** A test-only page the dev host serves from `e2e/fixtures/<name>.html`. */
export type FixturePage = "gallery" | "composites" | "inspector"

/** Open a fixture page, with an optional query string such as `?group=overlays`. */
export async function openFixturePage(page: Page, name: FixturePage, search = ""): Promise<void> {
  await page.goto(`/e2e/fixtures/${name}.html${search}`)
}
