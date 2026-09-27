// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { countUnhydrated } from "./hydration"

// React marks each element it has hydrated with a `__reactFiber$<random>` own property.
function hydrate(element: Element): void {
  Object.assign(element, { __reactFiber$test: {} })
}

function page(markup: string): HTMLElement {
  document.body.innerHTML = markup
  return document.body
}

describe("countUnhydrated", () => {
  it("counts every element in the main landmark React has not yet hydrated", () => {
    const body = page("<main><h1>Orders</h1><div><input /></div></main>")
    const main = body.querySelector("main")
    if (main === null) throw new Error("fixture has no main")
    hydrate(main)
    expect(countUnhydrated()).toBe(3)
  })

  it("reports zero once React has hydrated the whole landmark", () => {
    const body = page("<main><h1>Orders</h1><div><input /></div></main>")
    for (const element of body.querySelectorAll("main, main *")) hydrate(element)
    expect(countUnhydrated()).toBe(0)
  })

  it("has nothing to wait for on a page without a main landmark", () => {
    page("<div><button>Fail primary source</button></div>")
    expect(countUnhydrated()).toBe(0)
  })
})
