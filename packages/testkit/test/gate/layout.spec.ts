import { expect, type Page, test } from "@playwright/test"
import { judgeObscuredFocusables } from "../../src/playwright/checks/heuristics"
import { measureLayoutFacts } from "../../src/playwright/checks/layout-facts"

// Layout facts against real Chromium: whether focus would scroll a control clear of fixed chrome.

const PAGE = `<!doctype html><title>t</title>
<style>
  html { scroll-padding-top: 4rem }
  body { margin: 0 }
  header { position: fixed; top: 0; left: 0; right: 0; height: 3rem; background: white; z-index: 10 }
  main { padding-top: 3rem }
  .tall { height: 150vh }
  .bar { position: sticky; bottom: 1rem; background: white }
</style>
<header>Top bar</header>
<main>
  <form>
    <div class="bar"><button type="button">Remove echo</button></div>
    <div class="tall"></div>
  </form>
  <div class="tall"></div>
</main>`

async function serve(page: Page): Promise<void> {
  await page.route("http://layout.test/**", (route) =>
    route.fulfill({ contentType: "text/html", body: PAGE }),
  )
  await page.goto("http://layout.test/")
}

test("a sticky bar scrolled away with its container is revealed by focus, not pinned under chrome", async ({
  page,
}) => {
  await serve(page)
  // Put the unstuck bar's button right under the fixed header.
  const top = await page.getByRole("button", { name: "Remove echo" }).evaluate((b) => {
    return b.getBoundingClientRect().top + window.scrollY
  })
  await page.evaluate((y) => window.scrollTo(0, y - 16), top)
  const facts = await measureLayoutFacts(page)
  const button = facts.focusables.find((f) => f.name === "Remove echo")
  expect(button?.coveredBy?.name).toBe("Top bar")
  expect(judgeObscuredFocusables(facts.focusables)).toEqual([])
})

test("a sticky bar stuck under fixed chrome stays obscured", async ({ page }) => {
  await serve(page)
  await page.addStyleTag({ content: ".bar { top: 1rem; bottom: auto }" })
  await page.evaluate(() => window.scrollTo(0, window.innerHeight / 2))
  const facts = await measureLayoutFacts(page)
  expect(judgeObscuredFocusables(facts.focusables)).toEqual([
    expect.objectContaining({ check: "obscured-focusable" }),
  ])
})

test("a clipping ancestor is not a sticky scrollport, so a bar stuck to the viewport stays obscured", async ({
  page,
}) => {
  await serve(page)
  // overflow: clip clips without scrolling, so the bar still sticks to the viewport under the
  // header.
  await page.addStyleTag({ content: "form { overflow: clip } .bar { top: 1rem; bottom: auto }" })
  await page.evaluate(() => window.scrollTo(0, window.innerHeight / 2))
  const facts = await measureLayoutFacts(page)
  expect(judgeObscuredFocusables(facts.focusables)).toEqual([
    expect.objectContaining({ check: "obscured-focusable" }),
  ])
})
