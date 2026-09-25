// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { parseRules, readStylesheet } from "../testing/stylesheet"

// A neutral host: a plain document that links tokens.css directly, with no Tailwind build.
const css = readStylesheet("tokens.css")

function styleRules(list: CSSRuleList): CSSStyleRule[] {
  return [...list].flatMap((rule) => {
    if (rule instanceof CSSStyleRule) return [rule]
    if ("cssRules" in rule && rule.cssRules instanceof CSSRuleList) return styleRules(rule.cssRules)
    return []
  })
}

function token(element: Element, name: string): string {
  return getComputedStyle(element).getPropertyValue(`--pw-${name}`).trim()
}

describe("tokens.css in a neutral host", () => {
  let style: HTMLStyleElement

  beforeEach(() => {
    style = document.createElement("style")
    style.textContent = css
    document.head.append(style)
  })

  afterEach(() => {
    style.remove()
    document.body.replaceChildren()
  })

  it("parses every rule without the browser dropping one", () => {
    const sheet = style.sheet
    if (sheet === null) throw new Error("tokens.css did not produce a stylesheet")
    expect(styleRules(sheet.cssRules)).toHaveLength(parseRules(css).length)
  })

  it("resolves mode, scheme, and density tokens by class and attribute alone", () => {
    const dark = document.createElement("div")
    dark.className = "dark"
    const indigo = document.createElement("div")
    indigo.className = "theme-indigo"
    const compact = document.createElement("div")
    compact.dataset.density = "compact"
    document.body.append(dark, indigo, compact)
    const root = document.documentElement

    expect(token(root, "background")).not.toBe("")
    expect(token(dark, "background")).not.toBe(token(root, "background"))
    expect(token(indigo, "primary")).not.toBe(token(root, "primary"))
    expect(token(compact, "space-control")).not.toBe(token(root, "space-control"))
  })
})
