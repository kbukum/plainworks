import { describe, expect, it } from "vitest"
import { FlowError } from "../errors"
import { guardJourneyPage, unguarded } from "./guard"

class FakeLocator {
  readonly clicks: string[] = []
  constructor(readonly selector: string) {}
  getByRole(role: string): FakeLocator {
    return new FakeLocator(`${this.selector} >> role=${role}`)
  }
  filter(): FakeLocator {
    return this
  }
  async all(): Promise<FakeLocator[]> {
    return [new FakeLocator(`${this.selector} >> nth=0`)]
  }
  async click(): Promise<void> {
    this.clicks.push(this.selector)
  }
  async textContent(): Promise<string> {
    return this.selector
  }
  page(): FakePage {
    return new FakePage("page")
  }
}

class FakePage extends FakeLocator {
  readonly keyboard = { press: async () => undefined }
  async goto(): Promise<void> {}
  url(): string {
    return "https://app.test/"
  }
  mainFrame(): FakeLocator {
    return this
  }
  context(): FakeContext {
    return new FakeContext()
  }
}

class FakeContext {
  pages(): FakePage[] {
    return [new FakePage("other")]
  }
}

describe("guardJourneyPage", () => {
  it("throws a definition error for a raw action, pointing at the user verbs", async () => {
    const page = guardJourneyPage(new FakePage("page"))
    expect(() => page.goto()).toThrow(FlowError)
    expect(() => page.goto()).toThrow(/page\.goto .* user\.visit/)
    expect(() => page.keyboard).toThrow(/page\.keyboard/)
  })

  it("guards every locator derived from the page, however it was reached", async () => {
    const page = guardJourneyPage(new FakePage("page"))
    const button = page.getByRole("button").filter()
    expect(() => button.click()).toThrow(/locator\.click/)
    const [first] = await button.all()
    expect(() => first?.click()).toThrow(/locator\.click/)
  })

  it("guards pages reached back through a locator or the browser context, naming each for what it is", () => {
    const page = guardJourneyPage(new FakePage("page"))
    expect(() => page.getByRole("button").page().goto()).toThrow(/^page\.goto/)
    const [other] = page.context().pages()
    expect(() => other?.goto()).toThrow(/^page\.goto/)
    expect(() => other?.getByRole("link").click()).toThrow(/^locator\.click/)
  })

  it("leaves reads alone", async () => {
    const page = guardJourneyPage(new FakePage("page"))
    expect(page.url()).toBe("https://app.test/")
    expect(await page.getByRole("heading").textContent()).toBe("page >> role=heading")
  })

  it("hands back the real object for the user's own driving", async () => {
    const real = new FakePage("page")
    const button = unguarded(guardJourneyPage(real).getByRole("button"))
    await button.click()
    expect(button.clicks).toEqual(["page >> role=button"])
    expect(unguarded(real)).toBe(real)
  })
})
