import { expect, test } from "@playwright/test"
import { settleAnimations } from "../../src/playwright/checks/animation"

test("settling includes finite animations started by a finishing animation", async ({ page }) => {
  await page.setContent('<div id="panel" style="width:100px;height:100px"></div>')
  await page.evaluate(() => {
    const panel = document.getElementById("panel")
    if (panel === null) throw new Error("missing panel")
    const first = panel.animate(
      [{ transform: "translateX(200px)" }, { transform: "translateX(100px)" }],
      { duration: 100, fill: "forwards" },
    )
    void first.finished.then(() => {
      panel.animate([{ transform: "translateX(100px)" }, { transform: "translateX(0px)" }], {
        duration: 500,
        fill: "forwards",
      })
    })
  })
  await settleAnimations(page)
  expect(await page.locator("#panel").evaluate((panel) => getComputedStyle(panel).transform)).toBe(
    "matrix(1, 0, 0, 1, 0, 0)",
  )
})

test("an infinite spinner does not block readiness", async ({ page }) => {
  await page.setContent('<div id="spinner"></div>')
  await page.locator("#spinner").evaluate((spinner) => {
    spinner.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 100, iterations: Infinity })
  })
  await settleAnimations(page)
})

test("finite motion beyond the budget fails instead of reporting settled", async ({ page }) => {
  await page.setContent('<div id="panel"></div>')
  await page.locator("#panel").evaluate((panel) => {
    panel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 60_000 })
  })
  await expect(settleAnimations(page)).rejects.toMatchObject({ kind: "flow/timeout" })
})
